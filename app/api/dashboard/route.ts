import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { round2, cagr, yearsBetween } from '@/lib/finance/formulas'

/**
 * GET /api/dashboard
 *
 * Endpoint unique pour le dashboard — une seule requête, toutes les données
 * nécessaires à l'affichage synthétique.
 *
 * Retourne :
 *  - kpis            → chiffres clés (patrimoine brut/net, cash-flow, etc.)
 *  - allocation      → répartition par classe d'actifs
 *  - timeline        → 12 derniers snapshots (graphique temporel)
 *  - top_assets      → 5 actifs les plus valorisés
 *  - alerts          → alertes simples (sur-exposition, data stale)
 */
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  // Requêtes parallèles pour minimiser la latence
  const [
    assetsResult,
    debtsResult,
    lotsResult,
    snapshotsResult,
    profileResult,
  ] = await Promise.all([
    supabase
      .from('assets')
      .select('id, name, asset_type, current_value, acquisition_price, acquisition_date, confidence, last_valued_at')
      .eq('user_id', user.id)
      .eq('status', 'active'),

    supabase
      .from('debts')
      .select('capital_remaining, monthly_payment, interest_rate')
      .eq('user_id', user.id)
      .eq('status', 'active'),

    supabase
      .from('real_estate_lots')
      .select('rent_amount, charges_amount, status')
      .eq('user_id', user.id),

    supabase
      .from('patrimony_snapshots')
      .select('snapshot_date, total_net_value, total_gross_value, total_debt, confidence_score')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(13), // 12 mois + 1 pour le CAGR

    supabase
      .from('profiles')
      .select('reference_currency, tmi_rate')
      .eq('id', user.id)
      .single(),
  ])

  if (assetsResult.error) return err(assetsResult.error.message, 500)

  const assets = assetsResult.data ?? []
  const debts = debtsResult.data ?? []
  const lots = lotsResult.data ?? []
  const snapshots = snapshotsResult.data ?? []

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const grossValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const totalDebt = debts.reduce((s, d) => s + (d.capital_remaining ?? 0), 0)
  const netValue = round2(grossValue - totalDebt)

  const monthlyLoanPayment = debts.reduce((s, d) => s + (d.monthly_payment ?? 0), 0)
  const monthlyRents = lots
    .filter((l) => l.status === 'rented')
    .reduce((s, l) => s + (l.rent_amount ?? 0), 0)
  const monthlyCharges = lots.reduce((s, l) => s + (l.charges_amount ?? 0), 0)
  const monthlyCashFlow = round2(monthlyRents - monthlyCharges - monthlyLoanPayment)

  // CAGR sur la période disponible (snapshots)
  let cagrValue: number | null = null
  if (snapshots.length >= 2) {
    const latest = snapshots[0]!
    const oldest = snapshots[snapshots.length - 1]!
    const years = yearsBetween(new Date(oldest.snapshot_date), new Date(latest.snapshot_date))
    if (years > 0 && oldest.total_net_value > 0) {
      cagrValue = round2(cagr(oldest.total_net_value, latest.total_net_value, years))
    }
  }

  // ── Allocation par classe d'actifs ─────────────────────────────────────────
  const allocationMap: Record<string, number> = {}
  for (const a of assets) {
    const type = a.asset_type
    allocationMap[type] = round2((allocationMap[type] ?? 0) + (a.current_value ?? 0))
  }

  const allocation = Object.entries(allocationMap)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({
      type,
      value,
      percent: grossValue > 0 ? round2((value / grossValue) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value)

  // ── Timeline (12 derniers snapshots — graphique) ───────────────────────────
  const timeline = [...snapshots].reverse().map((s) => ({
    date: s.snapshot_date,
    net_value: s.total_net_value,
    gross_value: s.total_gross_value,
    total_debt: s.total_debt,
  }))

  // ── Top 5 actifs ───────────────────────────────────────────────────────────
  const topAssets = [...assets]
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.asset_type,
      value: a.current_value ?? 0,
      percent: grossValue > 0 ? round2(((a.current_value ?? 0) / grossValue) * 100) : 0,
    }))

  // ── Score de confiance global ──────────────────────────────────────────────
  const highConfidenceValue = assets
    .filter((a) => a.confidence === 'high')
    .reduce((s, a) => s + (a.current_value ?? 0), 0)

  const confidenceScore = grossValue > 0
    ? round2((highConfidenceValue / grossValue) * 100)
    : 0

  // ── Alertes simples ────────────────────────────────────────────────────────
  const alerts: Array<{ type: string; message: string; severity: 'warning' | 'info' }> = []

  // Sur-exposition : une classe > 70% du patrimoine brut
  for (const { type, percent } of allocation) {
    if (percent > 70) {
      alerts.push({
        type: 'over_exposure',
        message: `Sur-exposition ${type} : ${percent}% du patrimoine`,
        severity: 'warning',
      })
    }
  }

  // Données stale : actifs sans valorisation depuis > 30 jours
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const staleAssets = assets.filter(
    (a) => a.last_valued_at && new Date(a.last_valued_at) < thirtyDaysAgo,
  )
  if (staleAssets.length > 0) {
    alerts.push({
      type: 'stale_data',
      message: `${staleAssets.length} actif(s) non valorisé(s) depuis +30 jours`,
      severity: 'info',
    })
  }

  return ok({
    kpis: {
      gross_value: round2(grossValue),
      net_value: netValue,
      total_debt: round2(totalDebt),
      debt_ratio: grossValue > 0 ? round2((totalDebt / grossValue) * 100) : 0,
      monthly_cash_flow: monthlyCashFlow,
      monthly_rents: round2(monthlyRents),
      cagr: cagrValue,
      confidence_score: confidenceScore,
      assets_count: assets.length,
    },
    allocation,
    timeline,
    top_assets: topAssets,
    alerts,
    profile: profileResult.data ?? null,
  })
})
