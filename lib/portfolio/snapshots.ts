/**
 * Snapshots du portefeuille — couche pure.
 *
 * Transforme un PortfolioResult (issu du moteur de valorisation) en
 * un Snapshot serialisable pretes a etre persiste en DB.
 */

import type { PortfolioResult } from './types'
import type { AssetClass, CurrencyCode } from '@/types/database.types'

export interface PortfolioSnapshot {
  /** Date ISO yyyy-MM-dd (jour calendaire). */
  snapshotDate:           string
  totalMarketValue:       number
  totalCostBasis:         number
  totalPnL:               number
  totalPnLPct:            number | null
  positionsCount:         number
  valuedCount:            number
  allocationByClass:      Record<string, number>      // ex: { etf: 1234.56, crypto: 200 }
  allocationByEnvelope:   Record<string, number>      // ex: { "uuid-1": 1000, "_direct": 500 }
  referenceCurrency:      CurrencyCode
}

/**
 * Construit un snapshot a partir du resultat de valuation.
 * Utilise la date courante (UTC) sauf si `now` est fourni.
 */
export function computeSnapshot(
  result: PortfolioResult,
  now: Date = new Date(),
): PortfolioSnapshot {
  const snapshotDate = toIsoDate(now)

  const allocationByClass: Record<string, number> = {}
  for (const slice of result.summary.allocationByClass) {
    allocationByClass[slice.assetClass as AssetClass] = round2(slice.value)
  }

  const allocationByEnvelope: Record<string, number> = {}
  for (const slice of result.summary.allocationByEnvelope) {
    const key = slice.envelopeId ?? '_direct'
    allocationByEnvelope[key] = round2(slice.value)
  }

  return {
    snapshotDate,
    totalMarketValue:     round2(result.summary.totalMarketValue),
    totalCostBasis:       round2(result.summary.totalCostBasis),
    totalPnL:             result.summary.totalUnrealizedPnL !== null
                            ? round2(result.summary.totalUnrealizedPnL)
                            : 0,
    totalPnLPct:          result.summary.totalUnrealizedPnLPct !== null
                            ? round4(result.summary.totalUnrealizedPnLPct)
                            : null,
    positionsCount:       result.summary.positionsCount,
    valuedCount:          result.summary.valuedPositionsCount,
    allocationByClass,
    allocationByEnvelope,
    referenceCurrency:    result.summary.referenceCurrency,
  }
}

/** Convertit un Date en ISO date (UTC). */
function toIsoDate(d: Date): string {
  const y  = d.getUTCFullYear()
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round4(n: number): number { return Math.round(n * 10000) / 10000 }
