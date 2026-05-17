/**
 * GET /api/analyse/snapshots — historique des wealth_snapshots
 *
 * Renvoie les N derniers snapshots du patrimoine global de l'utilisateur,
 * tries par date ascendante (le plus ancien en premier — pratique pour
 * tracer une courbe directement).
 *
 * Query params :
 *   ?limit=N  — max snapshots renvoyés (défaut 24, max 365)
 *
 * Utilise par <PatrimoineEvolutionChart> sur le dashboard.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

const DEFAULT_LIMIT = 24
const MAX_LIMIT     = 365

export const GET = withAuth(async (req: Request, user: User) => {
  const url   = new URL(req.url)
  const raw   = url.searchParams.get('limit')
  let limit   = raw ? parseInt(raw, 10) : DEFAULT_LIMIT
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
  if (limit > MAX_LIMIT) limit = MAX_LIMIT

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('wealth_snapshots')
    .select(`
      snapshot_date,
      patrimoine_brut, patrimoine_net,
      total_portefeuille, total_immo, total_cash, total_dettes,
      revenu_passif_mensuel, progression_fire_pct
    `)
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(limit)

  if (error) return err(error.message, 500)
  // Inverse pour avoir l'ordre chrono ascendant (utile pour Recharts)
  return ok((data ?? []).slice().reverse())
})
