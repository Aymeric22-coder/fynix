/**
 * Couche d'adaptation snapshots → indicateurs analytics.
 *
 * Convertit les snapshots DB en ValuePoint pour les fonctions pures
 * de `lib/portfolio/analytics.ts`. Cash flows non gérés ici (pour le
 * moment) — donc TWR/MWR sont approximés sur la valeur brute, ce qui
 * est correct pour un buy-and-hold sans apports ultérieurs.
 *
 * Si pas assez de données, renvoie null pour chaque indicateur (l'UI
 * affiche "—").
 */

import {
  computeTWR, computeMWRDetailed, annualizeReturn, computeDrawdown,
  computeVolatility, computeSharpe,
} from './analytics'
import type { CashFlow, ValuePoint } from './analytics'
import { resolveMwrDisplay, type MwrDisplay } from './mwr-display'

export interface SnapshotRow {
  snapshot_date:      string
  total_market_value: number
}

export interface HistoricalAnalytics {
  /** Rendement total time-weighted sur la période (TWR, décimal). */
  totalReturn:        number | null
  /** Rendement annualisé (TWR). */
  annualizedReturn:   number | null
  /** Rendement money-weighted (MWR/IRR, annualisé). null si pas de cash flows. */
  moneyWeightedReturn: number | null
  /**
   * MWR prêt pour l'affichage (SPRINT 2) : valeur absolue de la période sur
   * fenêtre < 180 j, annualisée au-delà, + libellé contextuel. null si pas de
   * cash flows. L'UI consomme ce champ ; `moneyWeightedReturn` reste l'IRR brut.
   */
  moneyWeightedDisplay: MwrDisplay | null
  /** Drawdown courant (négatif ou 0). */
  currentDrawdown:    number | null
  /** Drawdown maximum atteint (négatif ou 0). */
  maxDrawdown:        number | null
  /** Volatilité annualisée (décimal). */
  volatility:         number | null
  /** Sharpe ratio (rf = 0 par défaut). */
  sharpe:             number | null
  /** Nombre de snapshots utilisés. */
  pointsCount:        number
  /** Durée couverte en jours. */
  daysCovered:        number
  /** Nombre de cash flows pris en compte. */
  cashFlowsCount:     number
}

const EMPTY: HistoricalAnalytics = {
  totalReturn:          null,
  annualizedReturn:     null,
  moneyWeightedReturn:  null,
  moneyWeightedDisplay: null,
  currentDrawdown:     null,
  maxDrawdown:         null,
  volatility:          null,
  sharpe:              null,
  pointsCount:         0,
  daysCovered:         0,
  cashFlowsCount:      0,
}

/**
 * Calcule les indicateurs historiques à partir des snapshots du portefeuille.
 * Si des cash flows (apports/retraits) sont fournis, TWR et MWR sont calculés
 * avec en plus la précision sur les contributions de capital.
 * Robuste : si pas assez de données, renvoie un résultat partiellement null.
 */
export function computeHistoricalAnalytics(
  rows:       SnapshotRow[],
  cashFlows:  CashFlow[] = [],
): HistoricalAnalytics {
  if (rows.length < 2) return { ...EMPTY, pointsCount: rows.length, cashFlowsCount: cashFlows.length }

  const sorted: ValuePoint[] = [...rows]
    .map((r) => ({ date: r.snapshot_date, value: r.total_market_value }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const startMs = new Date(sorted[0]!.date + 'T00:00:00Z').getTime()
  const endMs   = new Date(sorted[sorted.length - 1]!.date + 'T00:00:00Z').getTime()
  const days    = Math.max(1, Math.round((endMs - startMs) / 86400000))

  // Filtre les cash flows dans la fenêtre de snapshots (inclusif)
  const startDate = sorted[0]!.date
  const endDate   = sorted[sorted.length - 1]!.date
  const flowsInRange = cashFlows.filter(
    (f) => f.date >= startDate && f.date <= endDate,
  )

  const totalReturn         = computeTWR(sorted, flowsInRange)
  const annualizedReturn    = totalReturn !== null && days > 0
    ? annualizeReturn(totalReturn, days)
    : null
  const mwrDetailed         = flowsInRange.length > 0
    ? computeMWRDetailed(sorted, flowsInRange)
    : null  // pas de MWR pertinent sans cash flow
  const moneyWeightedReturn  = mwrDetailed?.annualized ?? null
  const moneyWeightedDisplay = resolveMwrDisplay(mwrDetailed)
  const dd                  = computeDrawdown(sorted)
  const volatility          = computeVolatility(sorted, flowsInRange)
  const sharpe              = computeSharpe(sorted, flowsInRange, 0)

  return {
    totalReturn,
    annualizedReturn,
    moneyWeightedReturn,
    moneyWeightedDisplay,
    currentDrawdown:  dd.current,
    maxDrawdown:      dd.max,
    volatility,
    sharpe,
    pointsCount:      sorted.length,
    daysCovered:      days,
    cashFlowsCount:   flowsInRange.length,
  }
}
