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
 * Variante du résumé enrichie des paires FX non résolues.
 *
 * Compatible structurellement avec `PortfolioSummary` (extension stricte),
 * donc consommable tel quel partout où un `PortfolioSummary` est attendu.
 */
export interface PortfolioSummaryWithFx extends PortfolioSummary {
  /** Vide si toutes les paires ont été résolues. */
  excludedForFx: UnresolvedFxPair[]
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
    id:                 i.id,
    ticker:             i.ticker,
    isin:               i.isin,
    name:               i.name,
    assetClass:         i.asset_class,
    subclass:           i.asset_subclass,
    currency:           i.currency,
    sector:             i.sector,
    geography:          i.geography,
    valuationFrequency: i.valuation_frequency ?? 'daily',
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

  return {
    positions: result.positions,
    summary:   { ...result.summary, excludedForFx },
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
    },
  }
}
