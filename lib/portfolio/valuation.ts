/**
 * Moteur de valorisation pur — Portefeuille universel.
 *
 * 100% fonctionnel, sans dépendance Supabase / Next.js / fetch.
 * Reçoit en entrée :
 *   - un set de positions
 *   - un set d'instruments
 *   - un set de prix (1 par instrumentId)
 *   - une fonction de conversion FX
 *
 * Produit :
 *   - chaque position enrichie (PositionValuation)
 *   - les agrégats portefeuille (PortfolioSummary)
 *
 * Toutes les valeurs scalaires renvoyées sont dans la devise de référence
 * passée en option, sauf marketValue / costBasis / unrealizedPnL au niveau
 * de la position qui restent dans la devise de la position (l'UI affiche
 * les deux : montant local + équivalent ref dans le résumé).
 */

import type {
  AssetClass, ConfidenceLevel, CurrencyCode,
} from '@/types/database.types'
import type {
  InstrumentInput, PositionInput, PriceInput,
  PositionValuation, PortfolioSummary, PortfolioResult,
} from './types'
import { freshThresholdMs } from './freshness'

// ─── Options ─────────────────────────────────────────────────────────────────

export interface ValuationOptions {
  /** Devise de référence pour tous les agrégats. Défaut : 'EUR'. */
  referenceCurrency?: CurrencyCode
  /**
   * Fonction de conversion synchrone : retourne le facteur multiplicateur
   * pour passer de `from` vers `to`. Si elle renvoie null, la position
   * n'est pas comptabilisée dans les agrégats convertis (mais reste
   * affichée dans sa devise locale).
   *
   * Si non fournie, on suppose toutes les devises = ref (1:1).
   */
  fxConvert?: (from: CurrencyCode, to: CurrencyCode) => number | null
  /** Date de référence pour évaluer la fraîcheur. Défaut : Date.now(). */
  now?: Date
}

// ─── API publique ────────────────────────────────────────────────────────────

/**
 * Valorise un set de positions.
 *
 * Garanties :
 *   - Pas de division par zéro (averagePrice = 0 → unrealizedPnLPct = null).
 *   - Une position dont l'instrument n'est pas trouvé est ignorée.
 *   - Une position sans prix conserve marketValue/PnL = null mais reste
 *     listée pour signaler le trou de couverture à l'utilisateur.
 */
export function valuePortfolio(
  positions:   PositionInput[],
  instruments: InstrumentInput[],
  prices:      PriceInput[],
  options:     ValuationOptions = {},
): PortfolioResult {
  const ref     = options.referenceCurrency ?? 'EUR'
  const fx      = options.fxConvert ?? ((from, to) => (from === to ? 1 : null))
  const nowMs   = (options.now ?? new Date()).getTime()

  const instrumentsById = new Map(instruments.map((i) => [i.id, i]))
  const pricesByInstrId = new Map(prices.map((p) => [p.instrumentId, p]))

  const valuations: PositionValuation[] = []

  for (const pos of positions) {
    const inst = instrumentsById.get(pos.instrumentId)
    if (!inst) continue  // catalogue désynchronisé : on ignore plutôt que de crasher

    const price = pricesByInstrId.get(pos.instrumentId) ?? null
    const valuation = valueSinglePosition(pos, inst, price, fx, nowMs)
    valuations.push(valuation)
  }

  const summary = aggregate(valuations, positions, instrumentsById, ref, fx)

  return { positions: valuations, summary }
}

// ─── Valorisation unitaire ───────────────────────────────────────────────────

function valueSinglePosition(
  pos:    PositionInput,
  inst:   InstrumentInput,
  price:  PriceInput | null,
  fx:     NonNullable<ValuationOptions['fxConvert']>,
  nowMs:  number,
): PositionValuation {
  const costBasis = pos.quantity * pos.averagePrice

  // Conversion du prix dans la devise de la position si nécessaire
  let currentPriceLocal: number | null = null
  let priceFresh = false
  let confidence: ConfidenceLevel = 'low'
  let priceFreshAt: string | null = null
  let priceSource:  string | null = null

  if (price && price.price > 0) {
    const factor = fx(price.currency, pos.currency)
    if (factor !== null) {
      currentPriceLocal = price.price * factor
    }
    priceFreshAt = price.pricedAt
    priceSource  = price.source
    confidence   = price.confidence
    // Seuil de fraîcheur dépend de la fréquence de valorisation de l'instrument :
    // un fonds mensuel reste frais 35j, une SCPI trimestrielle ~100j, etc.
    const threshold = freshThresholdMs(inst.valuationFrequency)
    if (threshold === Number.POSITIVE_INFINITY) {
      priceFresh = true  // 'manual' : jamais stale
    } else {
      const ageMs = nowMs - new Date(price.pricedAt).getTime()
      priceFresh  = ageMs >= 0 && ageMs <= threshold
    }
  }

  const marketValue       = currentPriceLocal !== null ? pos.quantity * currentPriceLocal : null
  const unrealizedPnL     = marketValue !== null ? marketValue - costBasis : null
  const unrealizedPnLPct  =
    marketValue !== null && costBasis > 0
      ? (unrealizedPnL! / costBasis) * 100
      : null

  return {
    positionId:       pos.id,
    instrumentId:     inst.id,
    ticker:           inst.ticker,
    name:             inst.name,
    assetClass:       inst.assetClass,
    envelopeId:       pos.envelopeId,
    quantity:         pos.quantity,
    averagePrice:     pos.averagePrice,
    currency:         pos.currency,
    currentPrice:     currentPriceLocal,
    priceConfidence:  confidence,
    priceFreshAt,
    priceStale:       !priceFresh,
    costBasis,
    marketValue,
    unrealizedPnL,
    unrealizedPnLPct,
    priceSource,
    status:           pos.status,
  }
}

// ─── Agrégats ────────────────────────────────────────────────────────────────

function aggregate(
  valuations: PositionValuation[],
  positions:  PositionInput[],
  _byId:      Map<string, InstrumentInput>,
  ref:        CurrencyCode,
  fx:         NonNullable<ValuationOptions['fxConvert']>,
): PortfolioSummary {
  // On filtre sur les positions actives pour les agrégats financiers.
  const actives = valuations.filter((v) => v.status === 'active')

  let totalCostBasisRef       = 0  // toutes positions actives (capital investi)
  let totalCostBasisValuedRef = 0  // positions avec un prix (base pour +/-)
  let totalMarketValueRef     = 0
  let freshCount              = 0
  let valuedCount             = 0

  const byClass    = new Map<AssetClass, number>()
  const byEnvelope = new Map<string | null, number>()

  for (const v of actives) {
    const factor = fx(v.currency, ref)
    if (factor === null) continue  // impossible de convertir → on saute

    const costRef = v.costBasis * factor
    totalCostBasisRef += costRef

    if (v.marketValue !== null) {
      const mv = v.marketValue * factor
      totalMarketValueRef     += mv
      totalCostBasisValuedRef += costRef
      valuedCount++
      if (!v.priceStale) freshCount++
      byClass.set(v.assetClass, (byClass.get(v.assetClass) ?? 0) + mv)
      byEnvelope.set(v.envelopeId, (byEnvelope.get(v.envelopeId) ?? 0) + mv)
    }
  }

  // +/- latente : SEULEMENT sur les positions valorisées, sinon null
  // (on ne peut pas inventer une perte sur un titre dont on ignore le prix)
  const totalUnrealizedPnL =
    valuedCount > 0 ? totalMarketValueRef - totalCostBasisValuedRef : null
  const totalUnrealizedPnLPct =
    valuedCount > 0 && totalCostBasisValuedRef > 0
      ? ((totalMarketValueRef - totalCostBasisValuedRef) / totalCostBasisValuedRef) * 100
      : null

  const allocationByClass = Array.from(byClass.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      weightPct: totalMarketValueRef > 0 ? (value / totalMarketValueRef) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  const allocationByEnvelope = Array.from(byEnvelope.entries())
    .map(([envelopeId, value]) => ({
      envelopeId,
      value,
      weightPct: totalMarketValueRef > 0 ? (value / totalMarketValueRef) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    positionsCount:        actives.length,
    valuedPositionsCount:  valuedCount,
    totalCostBasis:        totalCostBasisRef,
    totalCostBasisValued:  totalCostBasisValuedRef,
    totalMarketValue:      totalMarketValueRef,
    totalUnrealizedPnL,
    totalUnrealizedPnLPct,
    freshnessRatio:        valuedCount > 0 ? freshCount / valuedCount : 0,
    allocationByClass,
    allocationByEnvelope,
    referenceCurrency:     ref,
  }
}
