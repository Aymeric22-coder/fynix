/**
 * GET / POST /api/snapshots — route legacy.
 *
 * Sprint 2 — I4 finalise : la table `patrimony_snapshots` est supprimee
 * (migration 027). Ces handlers sont maintenant des proxies fins vers
 * `wealth_snapshots` pour preserver la compat des clients existants.
 *
 * GET  → lit `wealth_snapshots`, mappe vers la shape historique
 *        (total_net_value, total_gross_value, total_debt) pour ne pas
 *        casser les consommateurs qui filtreraient sur ces colonnes.
 * POST → delegue a /api/analyse/snapshot (qui ecrit dans wealth_snapshots
 *        avec anti-rebond 30 s). Renvoie 201 pour compat retro.
 */
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, getPagination } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'

interface LegacySnapshot {
  user_id:           string
  snapshot_date:     string
  total_gross_value: number
  total_net_value:   number
  total_debt:        number
  real_estate_value: number
  financial_value:   number
  cash_value:        number
  scpi_value:        number     // toujours 0 — column legacy non maintenue dans wealth_snapshots
  other_value:       number     // idem
  monthly_cashflow:  number
  confidence_score:  null       // jamais stocke dans wealth_snapshots
  notes:             null
  created_at:        string
  id:                string
}

export const GET = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const { from: rangeFrom, to: rangeTo } = getPagination(req.url)
  const supabase = await createServerClient()

  let query = supabase
    .from('wealth_snapshots')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .range(rangeFrom, rangeTo)

  const dateFrom = searchParams.get('from')
  if (dateFrom) query = query.gte('snapshot_date', dateFrom)

  const dateTo = searchParams.get('to')
  if (dateTo) query = query.lte('snapshot_date', dateTo)

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  // Mapping wealth_snapshots → shape `patrimony_snapshots` historique pour
  // ne pas casser un eventuel consommateur externe.
  const items: LegacySnapshot[] = (data ?? []).map((s) => ({
    id:                s.id              as string,
    user_id:           s.user_id         as string,
    snapshot_date:     s.snapshot_date   as string,
    total_gross_value: Number(s.patrimoine_brut     ?? 0),
    total_net_value:   Number(s.patrimoine_net      ?? 0),
    total_debt:        Number(s.total_dettes        ?? 0),
    real_estate_value: Number(s.total_immo          ?? 0),
    financial_value:   Number(s.total_portefeuille  ?? 0),
    cash_value:        Number(s.total_cash          ?? 0),
    monthly_cashflow:  Number(s.revenu_passif_mensuel ?? 0),
    scpi_value:        0,
    other_value:       0,
    confidence_score:  null,
    notes:             null,
    created_at:        s.created_at as string,
  }))

  return ok({ items, total: count ?? 0 })
})

export const POST = withAuth(async (_req: Request, user: User) => {
  // Delegue a /api/analyse/snapshot (anti-rebond 30 s, ecriture wealth_snapshots).
  // On execute la meme logique directement pour eviter un fetch interne.
  const supabase = await createServerClient()
  const patrimoine = await getPatrimoineComplet(user.id)

  const today = new Date()
  const snapshotDate = `${today.getUTCFullYear()}-`
                     + `${String(today.getUTCMonth() + 1).padStart(2, '0')}-`
                     + `${String(today.getUTCDate()).padStart(2, '0')}`

  // QW9 — Cible AJUSTÉE composition foyer (cf. aggregateur > loadProfile).
  const cibleFire = (patrimoine.fireInputs.revenu_passif_cible_ajuste ?? 0) * 12 * 25
  const progressionFirePct = cibleFire > 0
    ? Math.round((patrimoine.totalNet / cibleFire) * 100 * 10000) / 10000
    : null

  const row = {
    user_id:                user.id,
    snapshot_date:          snapshotDate,
    patrimoine_brut:        round2(patrimoine.totalBrut),
    patrimoine_net:         round2(patrimoine.totalNet),
    total_portefeuille:     round2(patrimoine.totalPortefeuille),
    total_immo:             round2(patrimoine.totalImmo),
    total_cash:             round2(patrimoine.totalCash),
    total_dettes:           round2(patrimoine.totalDettes),
    revenu_passif_mensuel:  round2(patrimoine.revenuPassifActuel),
    progression_fire_pct:   progressionFirePct,
  }

  const { data, error } = await supabase
    .from('wealth_snapshots')
    .upsert(row, { onConflict: 'user_id,snapshot_date' })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok({ snapshot: data }, 201)
})

function round2(n: number): number { return Math.round(n * 100) / 100 }
