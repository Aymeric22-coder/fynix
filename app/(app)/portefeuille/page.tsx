import { Metadata } from 'next'
import Link from 'next/link'
import {
  Briefcase, Wallet, TrendingUp, Activity, Layers, LineChart,
  ArrowDownRight, BarChart3, History, Coins, Percent,
} from 'lucide-react'
import { createServerClient }     from '@/lib/supabase/server'
import { PageHeader }             from '@/components/shared/page-header'
import { EmptyState }             from '@/components/ui/empty-state'
import { Badge }                  from '@/components/ui/badge'
import { buildPortfolioFromDb }   from '@/lib/portfolio/build-from-db'
import { computeHistoricalAnalytics } from '@/lib/portfolio/historical-analytics'
import { transactionsToCashFlows }    from '@/lib/portfolio/cash-flows'
import {
  filterPortfolioByCategory, summarizeCategories, isValidCategoryId,
} from '@/lib/portfolio/categories'
import { CategoryTabs }               from '@/components/portfolio/category-tabs'
import { FxFallbackBanner }           from '@/components/portfolio/fx-fallback-banner'
import { RealizedPnlCard }            from '@/components/portfolio/realized-pnl-card'
import { EnvelopePerformanceTable }   from '@/components/portfolio/envelope-performance-table'
import { DividendProjectionCard }     from '@/components/portfolio/dividend-projection-card'
import { DividendCalendarStrip }      from '@/components/portfolio/dividend-calendar-strip'
import {
  formatCurrency, formatPercent, formatQuantity,
  ASSET_CLASS_LABELS,
} from '@/lib/utils/format'
import { PortefeuilleActions }    from '@/components/pages/portefeuille-actions'
import { PositionRowActions }     from '@/components/pages/position-row-actions'
import { RefreshPricesButton }    from '@/components/pages/refresh-prices-button'
import { PortfolioEvolutionChart, type SnapshotPoint } from '@/components/portfolio/evolution-chart'
import { normalizeSnapshotSeries, checkSeriesMatchesLive } from '@/lib/portfolio/normalize-snapshots'
import type { PositionInitialData } from '@/components/forms/add-position-form'
import type { AssetClass, CurrencyCode } from '@/types/database.types'

export const metadata: Metadata = { title: 'Portefeuille' }

interface Props {
  searchParams: Promise<{ cat?: string }>
}

export default async function PortefeuillePage({ searchParams }: Props) {
  const { cat } = await searchParams
  const activeCategory = isValidCategoryId(cat) ? cat : 'global'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Charge envelopes pour le formulaire d'ajout
  const { data: envelopes } = await supabase
    .from('financial_envelopes')
    .select('id, name, envelope_type, broker')
    .eq('user_id', user!.id)
    .eq('is_active', true)
    .order('name')

  // Compute portfolio (TOUTES positions, toutes catégories)
  const fullResult = await buildPortfolioFromDb(supabase, user!.id)

  // Compteurs par catégorie (pour les onglets) sur l'ensemble complet
  const categorySummaries = summarizeCategories(fullResult.positions)
  // Patch : la 1ere ligne "global" affiche la valeur totale du portefeuille
  if (categorySummaries[0]) {
    categorySummaries[0] = {
      ...categorySummaries[0],
      positionsCount: fullResult.summary.positionsCount,
      totalValue:     fullResult.summary.totalMarketValue,
    }
  }

  // Vue filtrée selon ?cat= (par défaut : global = pas de filtre)
  const result = filterPortfolioByCategory(fullResult, activeCategory)
  const { positions, summary } = result

  // Charge les 90 derniers snapshots pour la courbe d'evolution
  const { data: snapshotRows } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, total_market_value, total_cost_basis, total_pnl')
    .eq('user_id', user!.id)
    .order('snapshot_date', { ascending: false })
    .limit(90)
  const rawSnapshots: SnapshotPoint[] = (snapshotRows ?? []).slice().reverse().map((r) => ({
    snapshot_date:      r.snapshot_date as string,
    total_market_value: Number(r.total_market_value),
    total_cost_basis:   Number(r.total_cost_basis),
    total_pnl:          Number(r.total_pnl),
  }))

  // Réaligne la série historique avec les KPI affichés juste au-dessus :
  // injecte un point "live" du jour basé sur summary, force la monotonie du
  // capital investi et recalcule le PnL = MV − CB. Sans ça les snapshots
  // figés divergent visuellement des cartes (fallback cost_basis sur position
  // sans prix au moment du snapshot puis arrivée d'un prix plus bas, ou
  // positions ajoutées après le 1er snapshot, etc.).
  const snapshots: SnapshotPoint[] = normalizeSnapshotSeries(rawSnapshots, {
    totalMarketValue:   fullResult.summary.totalMarketValue,
    totalCostBasis:     fullResult.summary.totalCostBasis,
    totalUnrealizedPnL: fullResult.summary.totalUnrealizedPnL,
    referenceCurrency:  fullResult.summary.referenceCurrency,
  })

  if (process.env.NODE_ENV !== 'production') {
    const drift = checkSeriesMatchesLive(snapshots, {
      totalMarketValue:   fullResult.summary.totalMarketValue,
      totalCostBasis:     fullResult.summary.totalCostBasis,
      totalUnrealizedPnL: fullResult.summary.totalUnrealizedPnL,
    })
    if (drift) console.warn('[portefeuille] graphique / KPI désynchronisés :', drift)
  }

  // Cash flows depuis les transactions liées au portefeuille (achats/ventes)
  const { data: txRows } = await supabase
    .from('transactions')
    .select('transaction_type, amount, executed_at, position_id, instrument_id')
    .eq('user_id', user!.id)
    .in('transaction_type', ['purchase', 'sale'])
    .or('position_id.not.is.null,instrument_id.not.is.null')

  const cashFlows = transactionsToCashFlows(txRows ?? [])

  // Analytics historiques (TWR, MWR, drawdown, vol, sharpe) — on utilise la
  // série BRUTE non normalisée car ces métriques doivent refléter l'historique
  // réel (rendement, drawdown sur faits passés, pas sur série lissée).
  const historicalAnalytics = computeHistoricalAnalytics(rawSnapshots, cashFlows)

  // Charge les positions brutes + ISIN pour le formulaire d'édition
  const { data: rawPositions } = await supabase
    .from('positions')
    .select(`
      id, instrument_id, envelope_id, quantity, average_price, currency,
      broker, acquisition_date, notes,
      instrument:instruments!instrument_id ( name, ticker, isin, asset_class )
    `)
    .eq('user_id', user!.id)

  type RawInstr = { name: string; ticker: string | null; isin: string | null; asset_class: AssetClass }
  // Mapping envelope_id → name pour le label affiche dans la modale TX.
  const envelopeNameById = new Map<string, string>()
  for (const e of envelopes ?? []) {
    envelopeNameById.set(e.id as string, e.name as string)
  }
  // Liste serialisee des positions actives consommee par PortefeuilleActions
  // → AddTransactionModal. On ne sert que ce dont le composant client a besoin.
  const transactionPositions: import('@/components/portfolio/add-transaction-modal').TransactionModalPosition[] = []
  const editDataById = new Map<string, PositionInitialData>()
  for (const r of (rawPositions ?? [])) {
    const inst = (Array.isArray(r.instrument) ? r.instrument[0] : r.instrument) as RawInstr | null
    if (!inst) continue
    const envId = (r.envelope_id as string | null) ?? ''
    transactionPositions.push({
      id:            r.id as string,
      ticker:        inst.ticker ?? '',
      name:          inst.name,
      envelopeLabel: envId ? (envelopeNameById.get(envId) ?? '') : '',
      currentQty:    Number(r.quantity),
      averagePrice:  Number(r.average_price),
      currency:      r.currency as CurrencyCode,
    })
    editDataById.set(r.id as string, {
      id:               r.id as string,
      name:             inst.name,
      asset_class:      inst.asset_class,
      ticker:           inst.ticker ?? '',
      isin:             inst.isin   ?? '',
      envelope_id:      (r.envelope_id as string | null) ?? '',
      quantity:         Number(r.quantity),
      average_price:    Number(r.average_price),
      currency:         r.currency as CurrencyCode as PositionInitialData['currency'],
      broker:           (r.broker as string | null) ?? '',
      acquisition_date: (r.acquisition_date as string | null) ?? '',
      notes:            (r.notes as string | null) ?? '',
    })
  }

  return (
    <div>
      <PageHeader
        title="Portefeuille"
        subtitle={
          fullResult.summary.positionsCount > 0
            ? `${fullResult.summary.positionsCount} position${fullResult.summary.positionsCount > 1 ? 's' : ''} au total`
            : 'Suivi unifié actions, ETF, crypto, SCPI…'
        }
        action={
          <div className="flex items-center gap-3">
            {fullResult.summary.positionsCount > 0 && <RefreshPricesButton />}
            <PortefeuilleActions
              envelopes={envelopes ?? []}
              transactionPositions={transactionPositions}
            />
          </div>
        }
      />

      {/* Onglets de catégorie (visibles dès qu'il y a au moins 1 position) */}
      {fullResult.summary.positionsCount > 0 && (
        <CategoryTabs
          summaries={categorySummaries}
          activeId={activeCategory}
          currency={fullResult.summary.referenceCurrency}
        />
      )}

      {fullResult.summary.positionsCount === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Aucune position"
          description="Ajoutez votre première position (action, ETF, crypto, SCPI…) pour démarrer le suivi unifié."
          action={<PortefeuilleActions envelopes={envelopes ?? []} />}
          ariaPrompt="Je n'ai pas encore de positions. Montre-moi à quoi ressemblerait un portefeuille ETF World + small caps avec 500 €/mois d'épargne."
        />
      ) : summary.positionsCount === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Aucune position dans cette catégorie"
          description="Sélectionne une autre catégorie ou retourne sur Global pour voir l'ensemble du portefeuille."
        />
      ) : (
        <>
          {/* ── Avertissement repli FX 1:1 (au-dessus des KPI) ───────────── */}
          <FxFallbackBanner
            pairs={(fullResult.summary.excludedForFx ?? []).map((p) => `${p.from}/${p.to}`)}
          />

          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Carte 1 — Capital investi */}
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest">Capital investi</p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(summary.totalCostBasis, summary.referenceCurrency, { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">montant total investi</p>
            </div>

            {/* Carte 2 — Valeur actuelle */}
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <Wallet size={11} /> Valeur actuelle
              </p>
              <p className="text-xl font-semibold financial-value text-primary mt-2">
                {formatCurrency(summary.totalMarketValue, summary.referenceCurrency, { compact: true })}
              </p>
              <p className="text-xs text-secondary mt-1">
                {summary.valuedPositionsCount}/{summary.positionsCount} position{summary.positionsCount > 1 ? 's' : ''} valorisée{summary.valuedPositionsCount > 1 ? 's' : ''}
              </p>
            </div>

            {/* Carte 3 — Plus-value latente */}
            <div className="card p-5 border-accent/20">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <TrendingUp size={11} /> Plus-value latente
              </p>
              {summary.totalUnrealizedPnL === null ? (
                <>
                  <p className="text-xl font-semibold financial-value text-muted mt-2">—</p>
                  <p className="text-xs text-secondary mt-1">en attente de prix</p>
                </>
              ) : (
                <>
                  <p className={`text-xl font-semibold financial-value mt-2 ${summary.totalUnrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {formatCurrency(summary.totalUnrealizedPnL, summary.referenceCurrency, { compact: true, sign: true })}
                  </p>
                  <p className={`text-xs mt-1 ${summary.totalUnrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {formatPercent(summary.totalUnrealizedPnLPct, { sign: true })}
                    <span className="text-muted ml-1.5">
                      · sur {summary.valuedPositionsCount}/{summary.positionsCount} valorisée{summary.valuedPositionsCount > 1 ? 's' : ''}
                    </span>
                  </p>
                </>
              )}
            </div>

            {/* Carte 4 — Fraicheur prix */}
            <div className="card p-5">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                <Activity size={11} /> Fraîcheur prix
              </p>
              <p className={`text-xl font-semibold financial-value mt-2 ${summary.freshnessRatio >= 0.8 ? 'text-accent' : summary.freshnessRatio >= 0.5 ? 'text-warning' : 'text-danger'}`}>
                {formatPercent(summary.freshnessRatio * 100, { decimals: 0 })}
              </p>
              <p className="text-xs text-secondary mt-1">{`< 24 h`}</p>
            </div>
          </div>

          {/* ── KPI Dividendes (E3 + DCAL) — rangée affichée seulement si au moins
              un dividende a été encaissé sur 12 mois glissants. La carte
              Projection (DCAL) rejoint la rangée en 4e colonne, conditionnelle. */}
          {fullResult.summary.dividends.ttmTotal > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                  <Coins size={11} /> Dividendes 12 mois
                </p>
                <p className="text-xl font-semibold financial-value text-accent mt-2">
                  {formatCurrency(fullResult.summary.dividends.ttmTotal, summary.referenceCurrency, { compact: true })}
                </p>
                <p className="text-xs text-secondary mt-1">TTM glissant</p>
              </div>
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                  <Percent size={11} /> Yield on Cost
                </p>
                <p className="text-xl font-semibold financial-value text-primary mt-2">
                  {fullResult.summary.dividends.yieldOnCost !== null
                    ? formatPercent(fullResult.summary.dividends.yieldOnCost, { decimals: 2 })
                    : <span className="text-muted">—</span>}
                </p>
                <p className="text-xs text-secondary mt-1">sur capital investi</p>
              </div>
              <div className="card p-5">
                <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                  <Percent size={11} /> Yield on Market
                </p>
                <p className="text-xl font-semibold financial-value text-primary mt-2">
                  {fullResult.summary.dividends.yieldOnMarket !== null
                    ? formatPercent(fullResult.summary.dividends.yieldOnMarket, { decimals: 2 })
                    : <span className="text-muted">—</span>}
                </p>
                <p className="text-xs text-secondary mt-1">sur valeur actuelle</p>
              </div>
              {/* DCAL — projection annuelle. Le composant gère son
                  rendu conditionnel (null si data null ou 0 projection). */}
              <DividendProjectionCard
                data={fullResult.summary.dividendCalendar}
                currency={summary.referenceCurrency}
              />
            </div>
          )}

          {/* ── Frise calendrier des prochains versements (DCAL).
              Composant SSR avec rendu conditionnel intrinsèque. */}
          {fullResult.summary.dividendCalendar && (
            <div className="mb-6">
              <DividendCalendarStrip
                data={fullResult.summary.dividendCalendar.calendar}
                currency={summary.referenceCurrency}
              />
            </div>
          )}

          {/* ── KPI PV réalisée 12 mois (R6) — affichée seulement si au
              moins une vente avec realized_pnl non nul sur la période.
              Le composant gère lui-même le rendu conditionnel ; on lui
              fournit un mapping envelope_id → label affichable. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <RealizedPnlCard
              data={fullResult.summary.realizedPnlTtm}
              currency={summary.referenceCurrency}
              envelopeLabels={Object.fromEntries(
                (envelopes ?? []).map((e) => [e.id, e.name]),
              )}
            />
          </div>

          {/* ── Tableau Performance par enveloppe (E12 / Étape 4).
              Le composant se rend lui-même conditionnel (≥ 2 enveloppes). */}
          <div className="mb-6">
            <EnvelopePerformanceTable
              data={fullResult.summary.envelopePerformance}
              currency={summary.referenceCurrency}
            />
          </div>

          {/* ── Courbe d'évolution (uniquement en vue Global) ─────────────
              Les snapshots sont stockés au niveau du portefeuille global,
              pas par catégorie. La courbe est donc cachée quand on filtre. */}
          {activeCategory === 'global' && (
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
                  <LineChart size={11} /> Évolution du portefeuille
                </p>
                <div className="flex items-center gap-4 text-[10px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-0.5 bg-accent" />
                    Valeur actuelle
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t border-dashed border-secondary" style={{ height: 1 }} />
                    Capital investi
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-4 h-0.5" style={{ background: summary.totalUnrealizedPnL !== null && summary.totalUnrealizedPnL < 0 ? '#ef4444' : '#10b981' }} />
                    Plus-value latente
                    <span className="text-muted">(axe droit)</span>
                  </span>
                </div>
              </div>
              <PortfolioEvolutionChart
                data={snapshots}
                live={{
                  totalMarketValue:   fullResult.summary.totalMarketValue,
                  totalCostBasis:     fullResult.summary.totalCostBasis,
                  totalUnrealizedPnL: fullResult.summary.totalUnrealizedPnL,
                }}
              />
            </div>
          )}

          {/* ── Analytics historiques (Global uniquement, même raison) ── */}
          {activeCategory === 'global' && historicalAnalytics.pointsCount >= 2 && (
            <div className="card p-5 mb-6">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1 mb-4">
                <History size={11} /> Performance historique
                <span className="text-muted normal-case font-normal ml-2">
                  · {historicalAnalytics.pointsCount} snapshot{historicalAnalytics.pointsCount > 1 ? 's' : ''} sur {historicalAnalytics.daysCovered} jour{historicalAnalytics.daysCovered > 1 ? 's' : ''}
                  {historicalAnalytics.cashFlowsCount > 0 && (
                    <> · {historicalAnalytics.cashFlowsCount} flux pris en compte</>
                  )}
                </span>
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {/* TWR annualisé */}
                <div>
                  <p className="text-xs text-secondary flex items-center gap-1">
                    <TrendingUp size={10} /> TWR annualisé
                  </p>
                  {historicalAnalytics.annualizedReturn === null ? (
                    <p className="text-base font-semibold financial-value text-muted mt-1">—</p>
                  ) : (
                    <p className={`text-base font-semibold financial-value mt-1 ${historicalAnalytics.annualizedReturn >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {formatPercent(historicalAnalytics.annualizedReturn * 100, { sign: true })}
                    </p>
                  )}
                  <p className="text-[10px] text-muted mt-0.5">
                    {historicalAnalytics.totalReturn !== null
                      ? <>total {formatPercent(historicalAnalytics.totalReturn * 100, { sign: true })}</>
                      : ''}
                  </p>
                </div>

                {/* MWR / IRR */}
                <div>
                  <p className="text-xs text-secondary flex items-center gap-1">
                    <TrendingUp size={10} /> MWR (IRR)
                  </p>
                  {historicalAnalytics.moneyWeightedReturn === null ? (
                    <p className="text-base font-semibold financial-value text-muted mt-1">—</p>
                  ) : (
                    <p className={`text-base font-semibold financial-value mt-1 ${historicalAnalytics.moneyWeightedReturn >= 0 ? 'text-accent' : 'text-danger'}`}>
                      {formatPercent(historicalAnalytics.moneyWeightedReturn * 100, { sign: true })}
                    </p>
                  )}
                  <p className="text-[10px] text-muted mt-0.5">pondéré flux</p>
                </div>

                {/* Drawdown max */}
                <div>
                  <p className="text-xs text-secondary flex items-center gap-1">
                    <ArrowDownRight size={10} /> Drawdown max
                  </p>
                  {historicalAnalytics.maxDrawdown === null ? (
                    <p className="text-base font-semibold financial-value text-muted mt-1">—</p>
                  ) : (
                    <p className={`text-base font-semibold financial-value mt-1 ${historicalAnalytics.maxDrawdown < -0.05 ? 'text-danger' : 'text-secondary'}`}>
                      {formatPercent(historicalAnalytics.maxDrawdown * 100)}
                    </p>
                  )}
                  <p className="text-[10px] text-muted mt-0.5">
                    courant {historicalAnalytics.currentDrawdown !== null
                      ? formatPercent(historicalAnalytics.currentDrawdown * 100)
                      : '—'}
                  </p>
                </div>

                {/* Volatilité annualisée */}
                <div>
                  <p className="text-xs text-secondary flex items-center gap-1">
                    <BarChart3 size={10} /> Volatilité
                  </p>
                  {historicalAnalytics.volatility === null ? (
                    <p className="text-base font-semibold financial-value text-muted mt-1">—</p>
                  ) : (
                    <p className="text-base font-semibold financial-value text-primary mt-1">
                      {formatPercent(historicalAnalytics.volatility * 100)}
                    </p>
                  )}
                  <p className="text-[10px] text-muted mt-0.5">annualisée</p>
                </div>

                {/* Sharpe */}
                <div>
                  <p className="text-xs text-secondary flex items-center gap-1">
                    <Activity size={10} /> Sharpe ratio
                  </p>
                  {historicalAnalytics.sharpe === null ? (
                    <p className="text-base font-semibold financial-value text-muted mt-1">—</p>
                  ) : (
                    <p className={`text-base font-semibold financial-value mt-1 ${historicalAnalytics.sharpe >= 1 ? 'text-accent' : historicalAnalytics.sharpe >= 0 ? 'text-secondary' : 'text-danger'}`}>
                      {historicalAnalytics.sharpe.toFixed(2)}
                    </p>
                  )}
                  <p className="text-[10px] text-muted mt-0.5">rf = 0 %</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Allocations ──────────────────────────────────────────────── */}
          {summary.allocationByClass.length > 0 && (
            <div className="card p-5 mb-6">
              <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1 mb-4">
                <Layers size={11} /> Allocation par classe d&apos;actif
              </p>
              <div className="space-y-2">
                {summary.allocationByClass.map((slice) => (
                  <div key={slice.assetClass} className="flex items-center gap-3">
                    <div className="text-xs text-secondary w-32 flex-shrink-0">
                      {ASSET_CLASS_LABELS[slice.assetClass] ?? slice.assetClass}
                    </div>
                    <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${slice.weightPct}%` }}
                      />
                    </div>
                    <div className="text-xs text-primary w-16 text-right financial-value">
                      {formatPercent(slice.weightPct, { decimals: 1 })}
                    </div>
                    <div className="text-xs text-secondary w-24 text-right financial-value">
                      {formatCurrency(slice.value, summary.referenceCurrency, { compact: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tableau positions ────────────────────────────────────────── */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 border-b border-border">
                  <tr className="text-xs text-secondary uppercase tracking-wider">
                    <th className="text-left  px-4 py-3 font-medium">Position</th>
                    <th className="text-left  px-4 py-3 font-medium">Classe</th>
                    <th className="text-right px-4 py-3 font-medium">Quantité</th>
                    <th className="text-right px-4 py-3 font-medium">PRU</th>
                    <th className="text-right px-4 py-3 font-medium">Prix actuel</th>
                    <th className="text-right px-4 py-3 font-medium">Valeur</th>
                    <th className="text-right px-4 py-3 font-medium">+/− latente</th>
                    <th className="text-right px-4 py-3 font-medium">Fraîcheur</th>
                    <th className="text-right px-4 py-3 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.positionId} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/portefeuille/${p.positionId}`}
                          className="font-medium text-primary hover:text-accent transition-colors"
                        >
                          {p.name}
                        </Link>
                        {p.ticker && (
                          <div className="text-xs text-muted">{p.ticker}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="muted">{ASSET_CLASS_LABELS[p.assetClass] ?? p.assetClass}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right financial-value">
                        {formatQuantity(p.quantity, 8)}
                      </td>
                      <td className="px-4 py-3 text-right financial-value text-secondary">
                        {formatCurrency(p.averagePrice, p.currency, { decimals: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right financial-value">
                        {p.currentPrice !== null
                          ? formatCurrency(p.currentPrice, p.currency, { decimals: 2 })
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right financial-value font-medium text-primary">
                        {p.marketValue !== null ? formatCurrency(p.marketValue, p.currency, { compact: true }) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.unrealizedPnL !== null ? (
                          <div>
                            <div className={`financial-value font-medium ${p.unrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                              {formatCurrency(p.unrealizedPnL, p.currency, { compact: true, sign: true })}
                            </div>
                            {p.unrealizedPnLPct !== null && (
                              <div className={`text-xs ${p.unrealizedPnL >= 0 ? 'text-accent' : 'text-danger'}`}>
                                {formatPercent(p.unrealizedPnLPct, { sign: true })}
                              </div>
                            )}
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.priceFreshAt ? (
                          <div title={p.priceSource ? `Source : ${p.priceSource}` : undefined}>
                            <div className={`text-xs ${p.priceStale ? 'text-warning' : 'text-secondary'}`}>
                              {new Date(p.priceFreshAt).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </div>
                            {p.priceSource && (
                              <div className="text-[10px] text-muted leading-none mt-0.5">
                                {p.priceSource}
                              </div>
                            )}
                          </div>
                        ) : <span className="text-muted text-xs">jamais</span>}
                      </td>
                      <td className="px-4 py-3">
                        {editDataById.has(p.positionId) && (
                          <PositionRowActions
                            data={editDataById.get(p.positionId)!}
                            envelopes={envelopes ?? []}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
