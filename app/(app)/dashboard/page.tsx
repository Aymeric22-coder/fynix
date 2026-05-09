import { Metadata } from 'next'
import { createServerClient }    from '@/lib/supabase/server'
import { KpiGrid }               from '@/components/dashboard/kpi-grid'
import { AlertsPanel }           from '@/components/dashboard/alerts-panel'
import { TopAssetsList }         from '@/components/dashboard/top-assets-list'
import { DonutChart }            from '@/components/charts/donut-chart'
import { PatrimonyAreaChart }    from '@/components/charts/area-chart'
import { computeRealEstatePortfolio } from '@/lib/real-estate/portfolio'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, formatCurrency } from '@/lib/utils/format'
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

  // ── Simulation immobilière (CF après impôts + capital restant analytique) ─
  const portfolio = await computeRealEstatePortfolio(supabase, user!.id)
  const simAssetIds = new Set(portfolio.properties.map((p) => p.assetId))

  // ── Calculs patrimoine ────────────────────────────────────────────────────
  const grossValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)

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

  const highConf  = assets.filter(a => a.confidence === 'high').reduce((s, a) => s + (a.current_value ?? 0), 0)
  const confScore = grossValue > 0 ? (highConf / grossValue) * 100 : 0

  // Allocation donut
  const byType: Record<string, number> = {}
  for (const a of assets) byType[a.asset_type] = (byType[a.asset_type] ?? 0) + (a.current_value ?? 0)

  const donutData = Object.entries(byType)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([type, value]) => ({
      type, value,
      label:   ASSET_TYPE_LABELS[type] ?? type,
      percent: grossValue > 0 ? (value / grossValue) * 100 : 0,
      color:   ASSET_TYPE_COLORS[type] ?? '#6b7280',
    }))

  // Timeline
  const timeline = [...snapshots].reverse().map(s => ({
    date:        s.snapshot_date,
    net_value:   s.total_net_value,
    gross_value: s.total_gross_value,
    total_debt:  s.total_debt,
  }))

  // Top actifs
  const topAssets = [...assets]
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, 5)
    .map(a => ({
      id: a.id, name: a.name, type: a.asset_type,
      value:   a.current_value ?? 0,
      percent: grossValue > 0 ? ((a.current_value ?? 0) / grossValue) * 100 : 0,
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
