/**
 * POST /api/portfolio/refresh-prices
 *
 * Variante user-triggered de /api/cron/refresh-prices.
 * Pas d'auth Bearer (RLS via session) : ne rafraîchit que les instruments
 * détenus par l'utilisateur courant.
 *
 * Utilise le service-role key pour pouvoir écrire dans instrument_prices
 * (lecture authenticated, écriture par cron uniquement, sauf via cette route).
 */

import { createClient } from '@supabase/supabase-js'
import { ok, err, withAuth } from '@/lib/utils/api'
import { createServerClient } from '@/lib/supabase/server'
import { refreshInstrumentPrices } from '@/lib/portfolio/refresh-prices'
import { persistPortfolioSnapshot } from '@/lib/portfolio/persist-snapshot'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = withAuth(async (_req: Request, user: User) => {
  // 1. Lecture des instruments détenus (RLS user)
  const userClient = await createServerClient()
  const { data: held, error: heldErr } = await userClient
    .from('positions')
    .select('instrument_id')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (heldErr) return err(heldErr.message, 500)

  const ids = Array.from(new Set((held ?? []).map((r) => r.instrument_id as string)))
  if (ids.length === 0) {
    return ok({
      refreshed: 0, skipped: 0, errors: 0, protected_manual: 0,
      message: 'Aucune position active',
    })
  }

  // 2. Service-role pour bypass RLS sur instruments + instrument_prices
  const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SERVICE_KEY) {
    return err('SUPABASE_SERVICE_ROLE_KEY non configurée', 500)
  }
  const admin = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 3. Boucle factorisee (cf. lib/portfolio/refresh-prices.ts).
  //    Le helper gere : chargement instruments, orchestrateur, fetch +
  //    upsert idempotent, et P2 (UPDATE last_refresh_attempted_at).
  //    Specificite cette route : 1 seul user → snapshot final 'refresh'.
  let refreshResult
  try {
    refreshResult = await refreshInstrumentPrices(admin, ids)
  } catch (e) {
    return err((e as Error).message, 500)
  }
  const { refreshed, skipped, errors, protectedManual, instrumentsScanned } = refreshResult

  // Auto-snapshot apres refresh : on photographie le portefeuille avec
  // les nouveaux prix. Permet de construire la timeline progressivement
  // au gre des refresh utilisateur (et du cron quotidien).
  let snapshotPersisted = false
  try {
    const snap = await persistPortfolioSnapshot(userClient, user.id, 'refresh')
    snapshotPersisted = snap !== null
  } catch (e) {
    console.warn('[user-refresh] snapshot failed:', e)
  }

  return ok({
    refreshed,
    skipped,
    errors,
    protected_manual: protectedManual,
    instrumentsScanned,
    snapshotPersisted,
  })
})
