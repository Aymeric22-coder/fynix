import { Metadata } from 'next'
import { createServerClient }    from '@/lib/supabase/server'
import { KpiGrid }               from '@/components/dashboard/kpi-grid'
import { AlertsPanel }           from '@/components/dashboard/alerts-panel'
import { TopAssetsList }         from '@/components/dashboard/top-assets-list'
import { DonutChart }            from '@/components/charts/donut-chart'
import { PatrimonyAreaChart }    from '@/components/charts/area-chart'
import { computeRealEstatePortfolio } from '@/lib/real-estate/portfolio'
import { buildPortfolioFromDb }  from '@/lib/portfolio/build-from-db'
import { RealEstateAlertsPanel } from '@/components/dashboard/real-estate-alerts-panel'
import {
  ASSET_TYPE_LABELS, ASSET_TYPE_COLORS,
  ASSET_CLASS_LABELS, ASSET_CLASS_COLORS,
  formatCurrency,
} from '@/lib/utils/format'
import { ConfidenceBadge }       from '@/components/shared/confidence-badge'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [assetsRes, debtsRes, snapshotsRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id,name,asset_type,current_value,acquisition_price,confidence,last_valued_at')
      .eq('user_id', user!.id)
      .eq('status', 'active'),
    supabase
      .from('debts')
      .select('asset_id,capital_remaining,monthly_payment')
      .eq('user_id', user!.id)
      .eq('status', 'active'),
    supabase
      .from('patrimony_snapshots')
      .select('snapshot_date,total_net_value,total_gross_value,total_debt,monthly_cashflow')
      .eq('user_id', user!.id)
      .order('snapshot_date', { ascending: false })
      .limit(13),
  ])

  const assets    = assetsRes.data    ?? []
  const debts     = debtsRes.data     ?? []
  const snapshots = snapshotsRes.data ?? []

  // ── Simulation immobilière + suivi réel (CF / capital / alertes drift) ───
  const portfolio = await computeRealEstatePortfolio(supabase, user!.id, { withActuals: true })
  const simAssetIds = new Set(portfolio.properties.map((p) => p.assetId))

  // ── Portefeuille financier (positions + instruments + prix) ──────────────
  const portfolioResult = await buildPortfolioFromDb(supabase, user!.id)

  // ── Calculs patrimoine ────────────────────────────────────────────────────
  // Brut = actifs "table assets" (immo, cash, autre) + valeur de marché du portefeuille.
  // Note : portfolioResult.summary.totalMarketValue ne couvre QUE les positions valorisees
  // (avec prix). Pour les positions sans prix, on ajoute leur cost basis comme proxy
  // (valeur investie) pour ne pas sous-estimer le brut.
  const assetsValue   = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const portfolioBrut = portfolioResult.summary.totalMarketValue
                      + (portfolioResult.summary.totalCostBasis - portfolioResult.summary.totalCostBasisValued)
  const grossValue    = assetsValue + portfolioBrut

  // Capital restant : analytique pour l'immo, stocké pour les autres
  const reCapital    = portfolio.totalCapitalRemaining
  const otherCapital = debts
    .filter((d) => !simAssetIds.has(d.asset_id ?? ''))
    .reduce((s, d) => s + (d.capital_remaining ?? 0), 0)
  const totalDebt    = reCapital + otherCapital
  const netValue     = grossValue - totalDebt

  // Cash-flow mensuel :
  // - Immo : simulation (après impôts, vacance, charges, crédit)
  // - Autres crédits (non-immo) : soustraire les mensualités stockées
  const otherMonthlyLoan = debts
    .filter((d) => !simAssetIds.has(d.asset_id ?? ''))
    .reduce((s, d) => s + (d.monthly_payment ?? 0), 0)
  const hasSim    = portfolio.properties.some((p) => !p.simulation.incompleteData)
  const cashFlow  = hasSim
    ? portfolio.totalMonthlyCFYear1 - otherMonthlyLoan
    : 0

  // CAGR sur les snapshots historiques
  let cagrValue: number | null = null
  if (snapshots.length >= 2) {
    const latest = snapshots[0]!
    const oldest = snapshots[snapshots.length - 1]!
    const years  = (new Date(latest.snapshot_date).getTime() - new Date(oldest.snapshot_date).getTime()) / (365.25 * 86400_000)
    if (years > 0 && oldest.total_net_value > 0)
      cagrValue = (Math.pow(latest.total_net_value / oldest.total_net_value, 1 / years) - 1) * 100
  }

  // Confidence : actifs avec confidence='high' + positions portefeuille avec prix frais (< 24 h)
  const highConfAssets = assets.filter(a => a.confidence === 'high')
                               .reduce((s, a) => s + (a.current_value ?? 0), 0)
  const freshPortfolio = portfolioResult.positions
                          .filter((p) => p.status === 'active' && !p.priceStale && p.marketValue !== null)
                          .reduce((s, p) => s + (p.marketValue ?? 0), 0)
  const highConf  = highConfAssets + freshPortfolio
  const confScore = grossValue > 0 ? (highConf / grossValue) * 100 : 0

  // Allocation donut : combine assets (immo/cash/autre) + portfolio (classes financières)
  // Labels et couleurs : ASSET_TYPE_LABELS pour les assets historiques, ASSET_CLASS_LABELS
  // pour les classes du module Portefeuille (etf, crypto, scpi…).
  const byKey: Record<string, { label: string; value: number; color: string }> = {}

  for (const a of assets) {
    if (!a.current_value || a.current_value <= 0) continue
    const key = `asset:${a.asset_type}`
    const prev = byKey[key]?.value ?? 0
    byKey[key] = {
      label: ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type,
      value: prev + a.current_value,
      color: ASSET_TYPE_COLORS[a.asset_type] ?? '#6b7280',
    }
  }
  for (const slice of portfolioResult.summary.allocationByClass) {
    if (slice.value <= 0) continue
    const key = `class:${slice.assetClass}`
    const prev = byKey[key]?.value ?? 0
    byKey[key] = {
      label: ASSET_CLASS_LABELS[slice.assetClass] ?? slice.assetClass,
      value: prev + slice.value,
      color: ASSET_CLASS_COLORS[slice.assetClass] ?? '#6b7280',
    }
  }

  const donutData = Object.entries(byKey)
    .filter(([, v]) => v.value > 0)
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([type, v]) => ({
      type,
      value:   v.value,
      label:   v.label,
      percent: grossValue > 0 ? (v.value / grossValue) * 100 : 0,
      color:   v.color,
    }))

  // Timeline
  const timeline = [...snapshots].reverse().map(s => ({
    date:        s.snapshot_date,
    net_value:   s.total_net_value,
    gross_value: s.total_gross_value,
    total_debt:  s.total_debt,
  }))

  // Top actifs : combine assets historiques (immo/cash/autre) + positions portefeuille
  type TopAsset = { id: string; name: string; type: string; value: number; percent: number }
  const assetsForTop: TopAsset[] = assets
    .filter((a) => (a.current_value ?? 0) > 0)
    .map((a) => ({
      id: a.id, name: a.name, type: a.asset_type,
      value:   a.current_value!,
      percent: 0,  // calculé ensuite
    }))
  const positionsForTop: TopAsset[] = portfolioResult.positions
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id:    p.positionId,
      name:  p.name,
      type:  p.assetClass,
      // Pour les positions sans prix, on retombe sur le cost basis (capital investi)
      value: p.marketValue ?? p.costBasis,
      percent: 0,
    }))
  const topAssets = [...assetsForTop, ...positionsForTop]
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((a) => ({
      ...a,
      percent: grossValue > 0 ? (a.value / grossValue) * 100 : 0,
    }))

  // Alertes
  const alerts: { type: string; message: string; severity: 'warning' | 'info' }[] = []
  for (const { type, percent } of donutData)
    if (percent > 70)
      alerts.push({ type: 'over_exposure', message: `Sur-exposition ${ASSET_TYPE_LABELS[type] ?? type} : ${percent.toFixed(0)} % du patrimoine`, severity: 'warning' })

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const stale = assets.filter(a => a.last_valued_at && new Date(a.last_valued_at) < thirtyDaysAgo)
  if (stale.length)
    alerts.push({ type: 'stale_data', message: `${stale.length} actif(s) non valorisé(s) depuis +30 jours`, severity: 'info' })

  // Alerte si des simulations sont incomplètes
  const incompleteCount = portfolio.properties.filter(p => p.simulation.incompleteData).length
  if (incompleteCount > 0)
    alerts.push({
      type: 'sim_incomplete',
      message: `${incompleteCount} bien(s) avec simulation incomplète — complétez le crédit pour un cash-flow précis`,
      severity: 'info',
    })

  // Résumé des alertes drift par bien (pour le panel détaillé)
  const driftSummaries = portfolio.properties
    .filter((p) => (p.driftAlerts ?? []).length > 0)
    .map((p) => ({
      propertyId:   p.propertyId,
      propertyName: p.propertyName,
      alerts:       p.driftAlerts ?? [],
    }))

  const kpis = {
    gross_value:        Math.round(grossValue * 100) / 100,
    net_value:          Math.round(netValue * 100) / 100,
    total_debt:         Math.round(totalDebt * 100) / 100,
    debt_ratio:         grossValue > 0 ? Math.round((totalDebt / grossValue) * 10000) / 100 : 0,
    monthly_cash_flow:  Math.round(cashFlow * 100) / 100,
    cagr:               cagrValue !== null ? Math.round(cagrValue * 100) / 100 : null,
    confidence_score:   Math.round(confScore * 100) / 100,
    assets_count:       assets.length,
    sim_cf_label:       hasSim ? 'après impôts (simulation)' : undefined,
  }

  return (
    <div className="space-y-8">
      {/* Alertes */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* Alertes drift immobilier (Phase 2) */}
      {driftSummaries.length > 0 && <RealEstateAlertsPanel summaries={driftSummaries} />}

      {/* KPIs */}
      <KpiGrid kpis={kpis} />

      {/* Récap simulation immo (si au moins un bien simulé) */}
      {portfolio.properties.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'CF immo mensuel',
              value: formatCurrency(portfolio.totalMonthlyCFYear1, 'EUR'),
              sub:   'après impôts · simulation Y1',
              accent: portfolio.totalMonthlyCFYear1 >= 0,
            },
            {
              label: 'Capital restant dû',
              value: formatCurrency(portfolio.totalCapitalRemaining, 'EUR', { compact: true }),
              sub:   `${portfolio.properties.length} bien(s) financé(s)`,
            },
            {
              label: 'Biens simulés',
              value: `${portfolio.properties.filter(p => !p.simulation.incompleteData).length} / ${portfolio.properties.length}`,
              sub:   portfolio.properties.some(p => p.simulation.incompleteData) ? 'Crédit(s) incomplet(s)' : 'Tous complets',
            },
            {
              label: 'Ratio dette immo',
              value: grossValue > 0
                ? `${Math.round((portfolio.totalCapitalRemaining / grossValue) * 100)} %`
                : '—',
              sub: 'Capital restant / actifs bruts',
            },
          ].map((k) => (
            <div key={k.label} className={`card p-4 ${k.accent ? 'border-accent/20' : ''}`}>
              <p className="text-xs text-secondary uppercase tracking-wider mb-2">{k.label}</p>
              <p className={`text-lg font-semibold financial-value ${k.accent ? 'text-accent' : 'text-primary'}`}>
                {k.value}
              </p>
              <p className="text-xs text-muted mt-1">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Récap Portefeuille (si au moins une position) */}
      {portfolioResult.summary.positionsCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Valeur portefeuille',
              value: formatCurrency(portfolioResult.summary.totalMarketValue, 'EUR', { compact: true }),
              sub:   `${portfolioResult.summary.positionsCount} position(s) · ${portfolioResult.summary.valuedPositionsCount} valorisée(s)`,
              accent: false,
            },
            {
              label: 'Capital investi',
              value: formatCurrency(portfolioResult.summary.totalCostBasis, 'EUR', { compact: true }),
              sub:   'cost basis cumulé',
              accent: false,
            },
            {
              label: 'Plus-value latente',
              value: portfolioResult.summary.totalUnrealizedPnL !== null
                ? formatCurrency(portfolioResult.summary.totalUnrealizedPnL, 'EUR', { compact: true, sign: true })
                : '—',
              sub: portfolioResult.summary.totalUnrealizedPnLPct !== null
                ? `${portfolioResult.summary.totalUnrealizedPnLPct >= 0 ? '+' : ''}${portfolioResult.summary.totalUnrealizedPnLPct.toFixed(2)} %`
                : 'en attente de prix',
              accent: (portfolioResult.summary.totalUnrealizedPnL ?? 0) >= 0
                      && portfolioResult.summary.totalUnrealizedPnL !== null,
            },
            {
              label: 'Fraîcheur prix',
              value: `${Math.round(portfolioResult.summary.freshnessRatio * 100)} %`,
              sub:   '< 24 h',
              accent: portfolioResult.summary.freshnessRatio >= 0.8,
            },
          ].map((k) => (
            <div key={k.label} className={`card p-4 ${k.accent ? 'border-accent/20' : ''}`}>
              <p className="text-xs text-secondary uppercase tracking-wider mb-2">{k.label}</p>
              <p className={`text-lg font-semibold financial-value ${k.accent ? 'text-accent' : 'text-primary'}`}>
                {k.value}
              </p>
              <p className="text-xs text-muted mt-1">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Timeline — 3/5 */}
        <div className="lg:col-span-3 card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-medium text-primary">Évolution du patrimoine</h2>
              <p className="text-xs text-secondary mt-0.5">
                {snapshots.length} point{snapshots.length > 1 ? 's' : ''} · Patrimoine net + brut
              </p>
            </div>
            <ConfidenceBadge level={confScore >= 80 ? 'high' : confScore >= 50 ? 'medium' : 'low'} />
          </div>
          <PatrimonyAreaChart data={timeline} />
        </div>

        {/* Donut — 2/5 */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="text-sm font-medium text-primary mb-6">Allocation</h2>
          <DonutChart
            data={donutData}
            centerLabel="Patrimoine brut"
            centerValue={formatCurrency(grossValue, 'EUR', { compact: true })}
          />
        </div>
      </div>

      {/* Top actifs */}
      {topAssets.length > 0 && (
        <div className="card p-6">
          <h2 className="text-sm font-medium text-primary mb-6">
            Top {topAssets.length} actifs
          </h2>
          <TopAssetsList assets={topAssets} />
        </div>
      )}
    </div>
  )
}
