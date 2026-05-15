/**
 * Aggrégateur DB → résultats prêts pour l'UI.
 *
 * Charge les positions, instruments, prix et envelopes d'un utilisateur,
 * puis appelle le moteur de valorisation pur. Les analytics historiques
 * sont calculées à partir des `patrimony_snapshots` (à brancher en Phase 5
 * avec un snapshot par classe d'actif).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AssetClass, ConfidenceLevel, CurrencyCode, PositionStatus, ValuationFrequency,
} from '@/types/database.types'
import {
  valuePortfolio, type ValuationOptions,
} from './valuation'
import type {
  InstrumentInput, PositionInput, PriceInput, PortfolioResult,
} from './types'

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

export interface BuildOptions extends Omit<ValuationOptions, 'now'> {
  now?: Date
}

/**
 * Construit le résultat portefeuille pour un utilisateur.
 *
 * Étapes :
 *  1. Charge les positions actives + closed du user (RLS appliquée)
 *  2. Charge les instruments référencés (table partagée, lecture publique)
 *  3. Charge le dernier prix par instrument via la vue / DISTINCT ON (priced_at)
 *  4. Délègue au moteur pur valuePortfolio.
 */
export async function buildPortfolioFromDb(
  supabase: SupabaseClient,
  userId:   string,
  options:  BuildOptions = {},
): Promise<PortfolioResult> {
  // 1. Positions de l'utilisateur (toutes statuses, l'agrégateur filtre lui-même)
  const { data: posRows, error: posErr } = await supabase
    .from('positions')
    .select('id, instrument_id, envelope_id, quantity, average_price, currency, acquisition_date, status, broker')
    .eq('user_id', userId)

  if (posErr) {
    console.error('[portfolio] failed to load positions', posErr)
    return emptyResult(options.referenceCurrency ?? 'EUR')
  }

  const positions = (posRows ?? []) as PositionRow[]
  if (positions.length === 0) return emptyResult(options.referenceCurrency ?? 'EUR')

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
    return emptyResult(options.referenceCurrency ?? 'EUR')
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

  // 4. Mapping vers les types purs + délégation
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

  return valuePortfolio(positionInputs, instrumentInputs, priceInputs, options)
}

function emptyResult(ref: CurrencyCode): PortfolioResult {
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
    },
  }
}
