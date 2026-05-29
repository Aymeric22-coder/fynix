/**
 * Job cron Vercel : rafraîchit les prix de tous les instruments.
 *
 * Trigger : Vercel Cron (cf. vercel.json).
 * Auth    : header `authorization: Bearer ${CRON_SECRET}` requis en prod.
 *           Vercel injecte automatiquement ce header pour les routes /api/cron/*.
 *
 * Stratégie :
 *   1. Liste les instruments distincts pour lesquels au moins une `position`
 *      active existe (inutile de rafraîchir un instrument que personne ne détient).
 *   2. Pour chaque instrument, appelle l'orchestrateur de providers.
 *   3. Insère les prix obtenus dans `instrument_prices` (UNIQUE par triplet
 *      instrument_id + priced_at + source → on tronque la précision pour
 *      éviter de spammer la table).
 *
 * Utilise le service-role key pour bypasser la RLS (lecture/écriture
 * cross-utilisateur sur instruments / instrument_prices).
 */

import { createClient } from '@supabase/supabase-js'
import { refreshInstrumentPrices, refreshBenchmarkPrices } from '@/lib/portfolio/refresh-prices'
import { persistPortfolioSnapshot } from '@/lib/portfolio/persist-snapshot'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  // Fail closed : si CRON_SECRET n'est pas configure, on refuse tout appel
  // pour eviter qu'une route publique declenche des fetchs Yahoo massifs
  // et des ecritures cross-users via service role.
  if (!CRON_SECRET) {
    return new Response('Server misconfigured', { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!SERVICE_URL || !SERVICE_KEY) {
    return Response.json(
      { error: 'Missing Supabase service credentials' },
      { status: 500 },
    )
  }

  const supabase = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 0. Benchmarks (BNCH) — indices de reference, sans position rattachee.
  //      Forward-tracking via yahoo direct. Tourne TOUJOURS, meme s'il n'y
  //      a aucune position active (les benchmarks sont independants).
  let benchmarkResult = { refreshed: 0, skipped: 0, errors: 0 }
  try {
    benchmarkResult = await refreshBenchmarkPrices(supabase)
  } catch (e) {
    console.warn('[cron] benchmark refresh failed:', (e as Error).message)
  }

  // ── 1. Instruments à rafraîchir (ceux détenus dans au moins une position active) ──
  const { data: held, error: e1 } = await supabase
    .from('positions')
    .select('instrument_id')
    .eq('status', 'active')

  if (e1) {
    return Response.json({ error: e1.message }, { status: 500 })
  }

  const ids = Array.from(new Set((held ?? []).map((r) => r.instrument_id as string)))
  if (ids.length === 0) {
    return Response.json({
      refreshed: 0, skipped: 0, errors: 0, protected_manual: 0,
      benchmarks: benchmarkResult,
      message: 'no active positions',
    })
  }

  // ── 2. Boucle de refresh factorisee (cf. lib/portfolio/refresh-prices.ts) ─
  //      Le helper gere : chargement instruments, orchestrateur, fetch +
  //      upsert idempotent, et P2 (UPDATE last_refresh_attempted_at).
  //      Specificite cron : on passe `supabase` (service-role) et on
  //      enchaine ensuite les snapshots de TOUS les utilisateurs.
  let refreshResult
  try {
    refreshResult = await refreshInstrumentPrices(supabase, ids)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
  const { refreshed, skipped, errors, protectedManual, instrumentsScanned } = refreshResult

  // ── 3. Snapshot quotidien pour chaque utilisateur qui detient des positions ──
  const { data: usersWithPos } = await supabase
    .from('positions')
    .select('user_id')
    .eq('status', 'active')

  const uniqueUserIds = Array.from(new Set((usersWithPos ?? []).map((r) => r.user_id as string)))
  let snapshotsCreated = 0
  for (const uid of uniqueUserIds) {
    try {
      const snap = await persistPortfolioSnapshot(supabase, uid, 'cron')
      if (snap) snapshotsCreated++
    } catch (e) {
      console.warn(`[cron] snapshot failed for user ${uid}:`, e)
    }
  }

  return Response.json({
    refreshed,
    skipped,
    errors,
    protected_manual: protectedManual,
    instrumentsScanned,
    snapshotsCreated,
    benchmarks: benchmarkResult,
  })
}
