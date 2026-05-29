/**
 * Route one-shot : backfill de l'historique de prix des benchmarks (BNCH).
 *
 * POST /api/cron/backfill-benchmarks
 * Auth : header `authorization: Bearer ${CRON_SECRET}` (meme pattern que
 *        le cron refresh-prices). Fail-closed si CRON_SECRET absent.
 *
 * Fenetre de backfill : du plus ancien `portfolio_snapshots` (tous users,
 * envelope_id IS NULL = snapshots globaux) jusqu'a aujourd'hui. Si aucun
 * snapshot, on retombe sur 2 ans en arriere (pour avoir une base de
 * comparaison meme avant le premier snapshot utilisateur).
 *
 * Idempotent : la cle unique (instrument_id, priced_at, source) + upsert
 * ignoreDuplicates → re-run sans doublon.
 *
 * A declencher manuellement une fois apres la migration 046 :
 *   curl -X POST https://<app>/api/cron/backfill-benchmarks \
 *        -H "authorization: Bearer $CRON_SECRET"
 */

import { createClient } from '@supabase/supabase-js'
import { backfillBenchmarkHistory } from '@/lib/portfolio/refresh-prices'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000

export async function POST(req: Request) {
  if (!CRON_SECRET) {
    return new Response('Server misconfigured', { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!SERVICE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Missing Supabase service credentials' }, { status: 500 })
  }

  const supabase = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Fenetre : plus ancien snapshot global, sinon 2 ans en arriere.
  const { data: oldest } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date')
    .is('envelope_id', null)
    .order('snapshot_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const now = new Date()
  const from = oldest?.snapshot_date
    ? new Date(`${oldest.snapshot_date}T00:00:00.000Z`)
    : new Date(now.getTime() - TWO_YEARS_MS)

  try {
    const result = await backfillBenchmarkHistory(supabase, from, now)
    return Response.json({
      windowStart: from.toISOString().slice(0, 10),
      windowEnd:   now.toISOString().slice(0, 10),
      ...result,
    })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
