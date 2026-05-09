import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, getPagination } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { confidenceScore, round2 } from '@/lib/finance/formulas'
import { computeRealEstatePortfolio } from '@/lib/real-estate/portfolio'
import { format } from 'date-fns'

// GET /api/snapshots — historique des snapshots
export const GET = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const { from: rangeFrom, to: rangeTo } = getPagination(req.url)
  const supabase = await createServerClient()

  let query = supabase
    .from('patrimony_snapshots')
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

  return ok({ items: data, total: count ?? 0 })
})

// POST /api/snapshots — crée / met à jour le snapshot du jour
// Met à jour capital_remaining sur toutes les dettes immobilières (calcul analytique).
// Le monthly_cashflow utilise les simulations réelles (après impôts, vacance, etc.)
export const POST = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // ── 1. Actifs actifs ──────────────────────────────────────────────────────
  const { data: assets, error: assetsErr } = await supabase
    .from('assets')
    .select('id, asset_type, current_value, confidence')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (assetsErr) return err(assetsErr.message, 500)

  // ── 2. Simulations immobilières (CF + capital_remaining analytique) ───────
  const portfolio = await computeRealEstatePortfolio(supabase, user.id)

  // Mettre à jour capital_remaining sur chaque dette immobilière
  // (opérations en parallèle, erreurs non bloquantes)
  const capitalUpdates = portfolio.properties
    .filter((p) => p.capitalRemaining > 0)
    .map((p) =>
      supabase
        .from('debts')
        .update({ capital_remaining: round2(p.capitalRemaining) })
        .eq('asset_id', p.assetId)
        .eq('user_id', user.id)
        .eq('status', 'active'),
    )
  await Promise.allSettled(capitalUpdates)

  // ── 3. Dettes NON immobilières (autres crédits : consommation, etc.) ──────
  // On lit capital_remaining stocké (pas de simulation analytique pour eux en Phase 1)
  const { data: otherDebts } = await supabase
    .from('debts')
    .select('asset_id, capital_remaining')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .not('asset_id', 'in', `(${portfolio.properties.map((p) => `"${p.assetId}"`).join(',') || '""'})`)

  // ── 4. Cash-flow mensuel hors immobilier (lots loués non-simulation) ──────
  // Pour les actifs sans simulation (SCPI, etc.) on garde l'ancienne méthode
  const { data: scpiLots } = await supabase
    .from('real_estate_lots')
    .select('rent_amount, charges_amount, status')
    .eq('user_id', user.id)
    .eq('status', 'rented')

  // ATTENTION : les lots immobiliers sont déjà dans les simulations.
  // On ne les double-compte pas — on prend uniquement le CF simulation.
  // Les SCPI et autres revenus fonciers (non couverts par la simulation) sont ignorés Phase 1.
  // TODO Phase 2 : ajouter les revenus SCPI.
  const simMonthlyCF = portfolio.totalMonthlyCFYear1

  // Pour l'instant on garde quand même les loyers bruts des lots comme signal
  // de cash-flow dans le cas où la simulation est incomplète (pas de régime, etc.)
  const fallbackCF = (scpiLots ?? []).reduce(
    (s, l) => s + (l.rent_amount ?? 0) - (l.charges_amount ?? 0),
    0,
  )

  // Si au moins une simulation a réussi, on utilise le CF simulation
  const hasSim = portfolio.properties.some((p) => !p.simulation.incompleteData)
  const monthlyCashFlow = hasSim ? simMonthlyCF : fallbackCF

  // ── 5. Agrégats par type d'actif ──────────────────────────────────────────
  const byType: Record<string, number> = {
    real_estate: 0, scpi: 0, stock: 0, etf: 0, crypto: 0, gold: 0, cash: 0, other: 0,
  }

  for (const a of assets ?? []) {
    const v    = a.current_value ?? 0
    const type = a.asset_type as string
    if (type in byType) byType[type]! += v
    else byType['other']! += v
  }

  const financialValue = (byType['stock'] ?? 0) + (byType['etf'] ?? 0) +
                         (byType['crypto'] ?? 0) + (byType['gold'] ?? 0)

  const totalGross = Object.values(byType).reduce((s, v) => s + v, 0)

  // Total dette = immobilier (analytique) + autres crédits (stocké)
  const reDebt    = portfolio.totalCapitalRemaining
  const otherDebt = (otherDebts ?? []).reduce((s, d) => s + (d.capital_remaining ?? 0), 0)
  const totalDebt = round2(reDebt + otherDebt)

  const totalNet  = round2(totalGross - totalDebt)

  const score = confidenceScore(
    (assets ?? []).map((a) => ({
      value:      a.current_value ?? 0,
      confidence: a.confidence as 'high' | 'medium' | 'low',
    })),
  )

  // ── 6. Upsert snapshot ────────────────────────────────────────────────────
  const { data: snapshot, error: snapErr } = await supabase
    .from('patrimony_snapshots')
    .upsert(
      {
        user_id:           user.id,
        snapshot_date:     today,
        total_gross_value: round2(totalGross),
        total_debt:        totalDebt,
        total_net_value:   totalNet,
        real_estate_value: round2(byType['real_estate'] ?? 0),
        scpi_value:        round2(byType['scpi'] ?? 0),
        financial_value:   round2(financialValue),
        cash_value:        round2(byType['cash'] ?? 0),
        other_value:       round2(byType['other'] ?? 0),
        monthly_cashflow:  round2(monthlyCashFlow),
        confidence_score:  round2(score),
      },
      { onConflict: 'user_id,snapshot_date' },
    )
    .select()
    .single()

  if (snapErr) return err(snapErr.message, 500)

  return ok({
    snapshot,
    simulation_summary: {
      properties_simulated: portfolio.properties.filter((p) => !p.simulation.incompleteData).length,
      properties_incomplete: portfolio.properties.filter((p) => p.simulation.incompleteData).length,
      monthly_cf_simulation: round2(simMonthlyCF),
      total_capital_remaining: round2(reDebt),
    },
  }, 201)
})
