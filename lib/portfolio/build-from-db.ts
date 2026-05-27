/**
 * Aggrégateur DB → résultats prêts pour l'UI.
 *
 * Charge les positions, instruments, prix et envelopes d'un utilisateur,
 * puis appelle le moteur de valorisation pur. Les analytics historiques
 * sont calculées à partir de `wealth_snapshots` (depuis Sprint 2, I4 finalise).
 *
 * Conversion FX : pré-charge les taux nécessaires (positionCurrency → ref
 * et priceCurrency → positionCurrency) depuis `getFxRate` (cache mémoire +
 * fx_rates DB + Frankfurter API). Les paires introuvables retombent sur
 * un repli 1:1 plutôt que d'exclure silencieusement la position des KPI,
 * et sont remontées dans `summary.excludedForFx` pour avertissement UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AssetClass, ConfidenceLevel, CurrencyCode, PositionStatus, ValuationFrequency,
} from '@/types/database.types'
import {
  valuePortfolio, type ValuationOptions,
} from './valuation'
import type {
  InstrumentInput, PositionInput, PriceInput, PortfolioResult, PortfolioSummary,
} from './types'
import { getFxRate } from '@/lib/providers/fx'
import {
  filterDividendsTtm,
  aggregateDividendsForPortfolio,
  type DividendTx,
  type PortfolioDividendSummary,
} from './dividends'
import {
  computeEnvelopePerformance,
  type EnvelopePerformance,
} from './envelope-performance'
import {
  projectDividends,
  buildDividendCalendar,
  type DividendProjection,
  type CalendarMonth,
} from './dividend-calendar'
import type { ValuePoint, CashFlow } from './analytics'

// ─── DB row types (lecture seule, ce qu'on attend du SELECT) ────────────

interface PositionRow {
  id:               string
  instrument_id:    string
  envelope_id:      string | null
  quantity:         number
  average_price:    number
  currency:         CurrencyCode
  acquisition_date: string | null
  status:           PositionStatus
  broker:           string | null
}

interface InstrumentRow {
  id:                  string
  name:                string
  ticker:              string | null
  isin:                string | null
  asset_class:         AssetClass
  asset_subclass:      string | null
  currency:            CurrencyCode
  sector:              string | null
  geography:           string | null
  valuation_frequency: ValuationFrequency | null
  // Migration 045 — preuve de vie du dernier refresh (cron ou manuel).
  last_refresh_attempted_at: string | null
}

interface PriceRow {
  instrument_id: string
  price:         number
  currency:      CurrencyCode
  priced_at:     string
  source:        string
  confidence:    ConfidenceLevel
}

// ─── Public ─────────────────────────────────────────────────────────────

/** Paire devise non résolue à la conversion, repliée à 1:1 dans le calcul. */
export interface UnresolvedFxPair {
  from:           CurrencyCode
  to:             CurrencyCode
  /** Nombre de positions actives dans la devise `from` impactées par le repli. */
  positionsCount: number
}

/**
 * Agrégat des plus-values réalisées sur les 12 derniers mois (R6).
 *
 * Alimenté par `transactions.realized_pnl` (colonne ajoutée par la
 * migration 039, écrite par `lib/portfolio/movements.ts` lors d'une
 * vente). Toutes les valeurs sont en devise de référence du portefeuille.
 *
 * `byEnvelope` peut contenir la clé spéciale "__no_envelope__" pour
 * regrouper les ventes de positions non rattachées à une enveloppe.
 */
export interface PortfolioRealizedPnlTtm {
  /** Somme toutes enveloppes confondues, en devise ref. */
  total:      number
  /** Détail par enveloppe (clé = envelope_id ou `__no_envelope__`). */
  byEnvelope: Record<string, number>
}

/** Clé utilisée dans `byEnvelope` pour les positions sans enveloppe. */
export const NO_ENVELOPE_KEY = '__no_envelope__'

/**
 * Variante du résumé enrichie des paires FX non résolues.
 *
 * Compatible structurellement avec `PortfolioSummary` (extension stricte),
 * donc consommable tel quel partout où un `PortfolioSummary` est attendu.
 */
export interface PortfolioSummaryWithFx extends PortfolioSummary {
  /** Vide si toutes les paires ont été résolues. */
  excludedForFx:       UnresolvedFxPair[]
  /** Agrégat dividendes 12 mois glissants (E3). En devise ref. */
  dividends:           PortfolioDividendSummary
  /**
   * Plus-values réalisées 12 mois glissants (R6). `null` si aucune vente
   * portant un `realized_pnl` non nul sur la période.
   */
  realizedPnlTtm:      PortfolioRealizedPnlTtm | null
  /**
   * Performance détaillée par enveloppe (E12 / Étape 3) :
   * currentValue, investedValue, unrealizedPnl, realizedPnlTtm, TWR, MWR.
   * Vide tant que l'utilisateur n'a pas d'enveloppe avec position active.
   */
  envelopePerformance: EnvelopePerformance[]
  /**
   * Projection annuelle dividendes + calendrier des prochains versements
   * sur 12 mois glissants (DCAL). `null` si aucune position avec dividende
   * TTM (pas de projection possible). Tous les montants en devise ref.
   */
  dividendCalendar:    {
    projections:              DividendProjection[]
    calendar:                 CalendarMonth[]
    /** SUM des annualProjectionRef de toutes les projections. */
    totalAnnualProjectionRef: number
  } | null
}

export interface PortfolioResultWithFx {
  positions: PortfolioResult['positions']
  summary:   PortfolioSummaryWithFx
}

/**
 * Options publiques pour `buildPortfolioFromDb`.
 * `fxConvert` est volontairement omis : la construction est gérée
 * en interne à partir de `getFxRate` (cache mémoire + DB + API).
 */
export interface BuildOptions extends Omit<ValuationOptions, 'now' | 'fxConvert'> {
  now?: Date
}

const fxKey = (from: CurrencyCode, to: CurrencyCode) => `${from}/${to}`

/**
 * Construit le résultat portefeuille pour un utilisateur.
 *
 * Étapes :
 *  1. Charge les positions actives + closed du user (RLS appliquée)
 *  2. Charge les instruments référencés (table partagée, lecture publique)
 *  3. Charge le dernier prix par instrument via la vue / DISTINCT ON (priced_at)
 *  4. Précharge les taux de change nécessaires en parallèle.
 *  5. Délègue au moteur pur valuePortfolio avec un fxConvert tolérant
 *     (fallback 1:1 + tracking des paires manquantes).
 */
export async function buildPortfolioFromDb(
  supabase: SupabaseClient,
  userId:   string,
  options:  BuildOptions = {},
): Promise<PortfolioResultWithFx> {
  const ref = (options.referenceCurrency ?? 'EUR') as CurrencyCode

  // 1. Positions de l'utilisateur (toutes statuses, l'agrégateur filtre lui-même)
  const { data: posRows, error: posErr } = await supabase
    .from('positions')
    .select('id, instrument_id, envelope_id, quantity, average_price, currency, acquisition_date, status, broker')
    .eq('user_id', userId)

  if (posErr) {
    console.error('[portfolio] failed to load positions', posErr)
    return emptyResult(ref)
  }

  const positions = (posRows ?? []) as PositionRow[]
  if (positions.length === 0) return emptyResult(ref)

  // 2. Instruments référencés
  const ids = Array.from(new Set(positions.map((p) => p.instrument_id)))
  const { data: instRows, error: instErr } = await supabase
    .from('instruments')
    // SELECT * pour tolerer un schema partiel (migration 013 pas encore appliquee).
    // On lit valuation_frequency avec fallback 'daily' si la colonne n'existe pas.
    .select('*')
    .in('id', ids)

  if (instErr) {
    console.error('[portfolio] failed to load instruments', instErr)
    return emptyResult(ref)
  }

  const instruments = (instRows ?? []) as InstrumentRow[]

  // 3. Dernier prix par instrument
  // On charge tous les prix puis on garde le plus récent par instrument.
  // Pour un grand portfolio on optimisera avec une vue SQL DISTINCT ON.
  const { data: priceRows } = await supabase
    .from('instrument_prices')
    .select('instrument_id, price, currency, priced_at, source, confidence')
    .in('instrument_id', ids)
    .order('priced_at', { ascending: false })

  const latestByInstrument = new Map<string, PriceRow>()
  for (const row of (priceRows ?? []) as PriceRow[]) {
    if (!latestByInstrument.has(row.instrument_id)) {
      latestByInstrument.set(row.instrument_id, row)
    }
  }

  // 3.bis — Dividendes encaissés (transactions type='dividend'). E3.
  const { data: divRows } = await supabase
    .from('transactions')
    .select('position_id, amount, currency, executed_at')
    .eq('user_id', userId)
    .eq('transaction_type', 'dividend')

  const allDividends: DividendTx[] = (divRows ?? []) as DividendTx[]

  // 3.ter — Plus-values réalisées 12 mois glissants (R6). On agrège côté JS :
  // Supabase JS n'expose pas de GROUP BY confortable, mais le volume reste
  // faible (les ventes d'un utilisateur sur 12 mois). On joint sur positions
  // pour récupérer l'envelope_id, et on convertit en devise ref via fxConvert
  // (défini plus bas — l'agrégation finale est faite après la résolution FX).
  const ttmCutoffIso = new Date(
    (options.now ?? new Date()).getTime() - 365 * 24 * 60 * 60 * 1000,
  ).toISOString()
  const { data: realizedRows } = await supabase
    .from('transactions')
    .select('realized_pnl, currency, executed_at, position:positions!position_id(envelope_id)')
    .eq('user_id', userId)
    .eq('transaction_type', 'sale')
    .not('realized_pnl', 'is', null)
    .gte('executed_at', ttmCutoffIso)

  interface RealizedRow {
    realized_pnl: number | null
    currency:     CurrencyCode
    executed_at:  string
    position:     { envelope_id: string | null } | { envelope_id: string | null }[] | null
  }
  const realizedSales: RealizedRow[] = (realizedRows ?? []) as RealizedRow[]

  // 3.quart — Performance par enveloppe (Étape 3 / E12). On charge en parallèle :
  //   - Labels des enveloppes (financial_envelopes.name)
  //   - Snapshots par enveloppe (portfolio_snapshots WHERE envelope_id IS NOT NULL)
  //   - Cash flows par enveloppe via JOIN transactions → positions (envelope_id
  //     n'existe PAS sur transactions — c'est positions.envelope_id qui porte
  //     l'info, d'où le foreign join).
  const [
    { data: envelopeNameRows },
    { data: envelopeSnapshotRows },
    { data: envelopeCashFlowRows },
  ] = await Promise.all([
    supabase
      .from('financial_envelopes')
      .select('id, name')
      .eq('user_id', userId),
    supabase
      .from('portfolio_snapshots')
      .select('envelope_id, snapshot_date, total_market_value')
      .eq('user_id', userId)
      .not('envelope_id', 'is', null)
      .order('snapshot_date', { ascending: true }),
    supabase
      .from('transactions')
      .select('transaction_type, amount, executed_at, position:positions!position_id(envelope_id)')
      .eq('user_id', userId)
      .in('transaction_type', ['purchase', 'sale'])
      .not('position_id', 'is', null),
  ])

  interface EnvNameRow      { id: string; name: string }
  interface EnvSnapRow      { envelope_id: string; snapshot_date: string; total_market_value: number }
  interface EnvCashFlowRow  {
    transaction_type: 'purchase' | 'sale'
    amount:           number
    executed_at:      string
    position:         { envelope_id: string | null } | { envelope_id: string | null }[] | null
  }

  const envelopeLabels: Record<string, string> = {}
  for (const e of (envelopeNameRows ?? []) as EnvNameRow[]) {
    envelopeLabels[e.id] = e.name
  }

  // Bucket des snapshots par envelope_id
  const snapshotsByEnvelope: Record<string, ValuePoint[]> = {}
  for (const s of (envelopeSnapshotRows ?? []) as EnvSnapRow[]) {
    const arr = snapshotsByEnvelope[s.envelope_id] ?? []
    arr.push({ date: s.snapshot_date, value: Number(s.total_market_value) })
    snapshotsByEnvelope[s.envelope_id] = arr
  }

  // Bucket des cash flows par envelope_id, en respectant la convention
  // `CashFlow.amount` (positif = apport, inversion vs transactions.amount —
  // cf. lib/portfolio/cash-flows.ts).
  const cashFlowsByEnvelope: Record<string, CashFlow[]> = {}
  for (const t of (envelopeCashFlowRows ?? []) as EnvCashFlowRow[]) {
    const posRel  = Array.isArray(t.position) ? t.position[0] ?? null : t.position
    const envId   = posRel?.envelope_id ?? null
    if (envId === null) continue
    const arr = cashFlowsByEnvelope[envId] ?? []
    arr.push({
      date:   t.executed_at.slice(0, 10),
      amount: -Number(t.amount),
    })
    cashFlowsByEnvelope[envId] = arr
  }
  // Tri chronologique des cash flows par enveloppe (le helper TWR/MWR
  // trie en interne, mais on garde le contrat propre).
  for (const arr of Object.values(cashFlowsByEnvelope)) {
    arr.sort((a, b) => a.date.localeCompare(b.date))
  }

  // 4. Mapping vers les types purs
  const positionInputs: PositionInput[] = positions.map((p) => ({
    id:              p.id,
    instrumentId:    p.instrument_id,
    envelopeId:      p.envelope_id,
    quantity:        Number(p.quantity),
    averagePrice:    Number(p.average_price),
    currency:        p.currency,
    acquisitionDate: p.acquisition_date,
    status:          p.status,
    broker:          p.broker,
  }))

  const instrumentInputs: InstrumentInput[] = instruments.map((i) => ({
    id:                     i.id,
    ticker:                 i.ticker,
    isin:                   i.isin,
    name:                   i.name,
    assetClass:             i.asset_class,
    subclass:               i.asset_subclass,
    currency:               i.currency,
    sector:                 i.sector,
    geography:              i.geography,
    valuationFrequency:     i.valuation_frequency ?? 'daily',
    lastRefreshAttemptedAt: i.last_refresh_attempted_at ?? null,
  }))

  const priceInputs: PriceInput[] = Array.from(latestByInstrument.values()).map((p) => ({
    instrumentId: p.instrument_id,
    price:        Number(p.price),
    currency:     p.currency,
    pricedAt:     p.priced_at,
    source:       p.source,
    confidence:   p.confidence,
  }))

  // 5. Pré-chargement FX. On collecte les paires nécessaires :
  //    - (positionCurrency → ref)         : aggrégat en devise de référence.
  //    - (priceCurrency → positionCurrency): conversion locale quand le prix
  //      arrive dans une devise différente de la position (provider qui
  //      renvoie un cross USD au lieu du local par exemple).
  const positionCurrencyByInstrumentId = new Map<string, CurrencyCode>()
  for (const p of positionInputs) {
    positionCurrencyByInstrumentId.set(p.instrumentId, p.currency)
  }

  const neededPairs = new Set<string>()
  for (const p of positionInputs) {
    if (p.currency !== ref) neededPairs.add(fxKey(p.currency, ref))
  }
  for (const pr of priceInputs) {
    const posCcy = positionCurrencyByInstrumentId.get(pr.instrumentId)
    if (posCcy && pr.currency !== posCcy) {
      neededPairs.add(fxKey(pr.currency, posCcy))
    }
  }
  // Dividendes : pairs (divCurrency → ref) pour le total TTM en devise ref.
  for (const d of allDividends) {
    if (d.currency !== ref) neededPairs.add(fxKey(d.currency, ref))
  }
  // Ventes TTM : conversion realized_pnl (devise position) → devise ref.
  for (const s of realizedSales) {
    if (s.currency !== ref) neededPairs.add(fxKey(s.currency, ref))
  }

  // Résolution en parallèle. Une erreur (cache miss + API down par
  // exemple) laisse la paire absente du map → fallback 1:1 + tracking.
  const fxMap = new Map<string, number>()
  await Promise.all(
    Array.from(neededPairs).map(async (key) => {
      const [from, to] = key.split('/') as [CurrencyCode, CurrencyCode]
      try {
        const rate = await getFxRate(from, to)
        if (Number.isFinite(rate) && rate > 0) fxMap.set(key, rate)
      } catch {
        // Volontairement silencieux : remonté via excludedForFx ci-dessous.
      }
    }),
  )

  // 6. fxConvert tolérant : enregistre les paires non résolues plutôt
  //    que de retourner null (qui ferait disparaître la position).
  const unresolved = new Map<string, { from: CurrencyCode; to: CurrencyCode }>()
  const fxConvert = (from: CurrencyCode, to: CurrencyCode): number => {
    if (from === to) return 1
    const key = fxKey(from, to)
    const rate = fxMap.get(key)
    if (rate !== undefined) return rate
    unresolved.set(key, { from, to })
    return 1  // Repli : on conserve la position quitte à signaler le biais à l'UI.
  }

  const result = valuePortfolio(positionInputs, instrumentInputs, priceInputs, {
    ...options,
    fxConvert,
  })

  // 7. Compose la liste des paires non résolues + le nb de positions impactées.
  const activeByCurrency = new Map<CurrencyCode, number>()
  for (const p of positionInputs) {
    if (p.status !== 'active') continue
    activeByCurrency.set(p.currency, (activeByCurrency.get(p.currency) ?? 0) + 1)
  }

  const excludedForFx: UnresolvedFxPair[] = Array.from(unresolved.values()).map(
    ({ from, to }) => ({
      from,
      to,
      positionsCount: activeByCurrency.get(from) ?? 0,
    }),
  )

  // 8. Agrégat dividendes (E3). TTM converti en devise ref via fxConvert.
  //    fxConvert ne retourne JAMAIS null (fallback 1:1 + tracking dans
  //    `unresolved`), donc aucun risque de NaN sur d.amount * factor.
  const nowForTtm = options.now ?? new Date()
  const ttmDivs   = filterDividendsTtm(allDividends, nowForTtm)
  let ttmTotalRef = 0
  for (const d of ttmDivs) {
    ttmTotalRef += d.amount * fxConvert(d.currency, ref)
  }
  const dividends = aggregateDividendsForPortfolio({
    ttmTotalRef,
    totalCostBasisRef:   result.summary.totalCostBasis,
    totalMarketValueRef: result.summary.totalMarketValue || null,
  })

  // 9. Agrégat plus-values réalisées 12 mois glissants (R6).
  //    On convertit chaque vente en devise ref puis on agrège par enveloppe.
  //    Le filtre `realized_pnl IS NOT NULL` est déjà côté SQL ; ici on récupère
  //    juste le nombre et on regroupe.
  let realizedPnlTtm: PortfolioRealizedPnlTtm | null = null
  if (realizedSales.length > 0) {
    const byEnvelope: Record<string, number> = {}
    let total = 0
    for (const s of realizedSales) {
      // Postgres garantit non-null via le filtre `.not('realized_pnl', 'is', null)`,
      // mais on reste défensif côté type (le client TS n'affine pas le filtre).
      const pnl = s.realized_pnl
      if (pnl === null) continue
      // Supabase peut renvoyer la relation embarquée comme objet OU tableau
      // selon la résolution du foreign key — on normalise les deux formes.
      const posRel = Array.isArray(s.position) ? s.position[0] ?? null : s.position
      const envelopeKey = posRel?.envelope_id ?? NO_ENVELOPE_KEY
      const valueRef    = pnl * fxConvert(s.currency, ref)
      byEnvelope[envelopeKey] = (byEnvelope[envelopeKey] ?? 0) + valueRef
      total += valueRef
    }
    realizedPnlTtm = { total, byEnvelope }
  }

  // 10. Performance par enveloppe (Étape 3 / E12).
  //     Les positions ont été enrichies par `valuePortfolio` ci-dessus avec
  //     costBasisRef / marketValueRef / unrealizedPnLRef → on peut agréger
  //     par enveloppe sans refaire de FX. realizedPnlTtm.byEnvelope (R6)
  //     est passé tel quel — `__no_envelope__` est simplement ignoré par
  //     le helper qui n'itère que sur les enveloppes réelles.
  const realizedPnlTtmByEnvelopeMap: Record<string, number> = {}
  if (realizedPnlTtm) {
    for (const [k, v] of Object.entries(realizedPnlTtm.byEnvelope)) {
      if (k !== '__no_envelope__') realizedPnlTtmByEnvelopeMap[k] = v
    }
  }
  const envelopePerformance = computeEnvelopePerformance({
    positions:                result.positions,
    envelopeLabels,
    snapshotsByEnvelope,
    cashFlowsByEnvelope,
    realizedPnlTtmByEnvelope: realizedPnlTtmByEnvelopeMap,
    totalMarketValueRef:      result.summary.totalMarketValue,
  })

  // 11. Projection dividendes + calendrier (DCAL).
  //     Toutes les conversions FX sont faites ici en pre-traitement pour
  //     que le module pur `dividend-calendar` ne manipule que des devises
  //     ref. Les tickers sont joints depuis les instruments deja charges.
  let dividendCalendar: PortfolioSummaryWithFx['dividendCalendar'] = null
  if (allDividends.length > 0) {
    // (a) Index ticker par positionId (via instrumentId).
    const tickerByInstrumentId = new Map<string, string>()
    for (const inst of instrumentInputs) {
      tickerByInstrumentId.set(inst.id, inst.ticker ?? '')
    }
    const dcalPositions: { id: string; ticker: string }[] = []
    for (const p of positionInputs) {
      if (p.status !== 'active') continue
      dcalPositions.push({
        id:     p.id,
        ticker: tickerByInstrumentId.get(p.instrumentId) ?? '',
      })
    }

    // (b) Groupement des dividendes par positionId + conversion en devise ref.
    //     Les dividendes sans position_id (NULL en DB) ne peuvent etre
    //     projetes — on les exclut silencieusement.
    const dividendsByPosition: Record<string, { date: string; amountRef: number }[]> = {}
    for (const d of allDividends) {
      if (!d.position_id) continue
      const amountRef = d.amount * fxConvert(d.currency, ref)
      const arr = dividendsByPosition[d.position_id] ?? []
      arr.push({ date: d.executed_at.slice(0, 10), amountRef })
      dividendsByPosition[d.position_id] = arr
    }

    // (c) Projection.
    const projections = projectDividends({
      positions:           dcalPositions,
      dividendsByPosition,
      now:                 nowForTtm,
    })

    if (projections.length > 0) {
      // (d) Calendrier. `confirmedDividends` = les versements TTM reels
      //     en devise ref (meme conversion que ci-dessus).
      const confirmedDividends = ttmDivs
        .filter((d) => !!d.position_id)
        .map((d) => ({
          positionId: d.position_id,
          date:       d.executed_at.slice(0, 10),
          amountRef:  d.amount * fxConvert(d.currency, ref),
        }))

      const calendar = buildDividendCalendar({
        projections,
        confirmedDividends,
        monthCount: 12,
        now:        nowForTtm,
      })

      const totalAnnualProjectionRef =
        projections.reduce((s, p) => s + p.annualProjectionRef, 0)

      dividendCalendar = { projections, calendar, totalAnnualProjectionRef }
    }
  }

  return {
    positions: result.positions,
    summary:   {
      ...result.summary,
      excludedForFx,
      dividends,
      realizedPnlTtm,
      envelopePerformance,
      dividendCalendar,
    },
  }
}

function emptyResult(ref: CurrencyCode): PortfolioResultWithFx {
  return {
    positions: [],
    summary: {
      positionsCount:        0,
      valuedPositionsCount:  0,
      totalCostBasis:        0,
      totalCostBasisValued:  0,
      totalMarketValue:      0,
      totalUnrealizedPnL:    null,
      totalUnrealizedPnLPct: null,
      freshnessRatio:        0,
      allocationByClass:     [],
      allocationByEnvelope:  [],
      referenceCurrency:     ref,
      excludedForFx:         [],
      dividends: {
        ttmTotal:      0,
        yieldOnCost:   null,
        yieldOnMarket: null,
      },
      realizedPnlTtm:        null,
      envelopePerformance:   [],
      dividendCalendar:      null,
    },
  }
}
