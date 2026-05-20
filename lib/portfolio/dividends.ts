/**
 * Agrégations des dividendes encaissés sur le portefeuille (E3).
 *
 * Tout est calculé sur les transactions de type 'dividend' (cf. enum
 * transaction_type — migration 001). Aucun stockage spécifique : tout
 * dérive des lignes de la table `transactions`.
 *
 * Conventions :
 *   - Fenêtre TTM = 12 mois glissants depuis `now` (paramètre injecté
 *     pour les tests, défaut new Date()).
 *   - Montants bruts (frais NON déduits — convention fiscale FR).
 *   - YoC et YoM en pourcentage (ex: 4.2 pour 4,2 %).
 *   - Pas d'annualisation : si la position est détenue < 12 mois,
 *     le yield reflète la réalité brute, pas une extrapolation.
 *
 * Module pur, browser-safe, aucune dépendance Supabase.
 */

import type { CurrencyCode } from '@/types/database.types'

/** Transaction dividende minimaliste (sous-ensemble de la table transactions). */
export interface DividendTx {
  position_id:  string
  amount:       number       // > 0 (entrée de cash)
  currency:     CurrencyCode
  executed_at:  string       // ISO timestamp
}

/** Position minimaliste pour le calcul des yields. */
export interface DividendPositionContext {
  positionId:   string
  costBasis:    number       // devise position
  marketValue:  number | null
  currency:     CurrencyCode
}

/** Métriques par position. */
export interface DividendMetrics {
  positionId:    string
  /** Total des dividendes encaissés sur les 12 derniers mois (devise position). */
  ttmTotal:      number
  /** Yield on Cost (en %). Null si costBasis ≤ 0. */
  yieldOnCost:   number | null
  /** Yield on Market (en %). Null si marketValue null ou ≤ 0. */
  yieldOnMarket: number | null
}

/** Agrégat portefeuille (devise ref — l'appelant convertit en amont). */
export interface PortfolioDividendSummary {
  ttmTotal:      number
  yieldOnCost:   number | null
  yieldOnMarket: number | null
}

const TTM_WINDOW_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Filtre les transactions sur la fenêtre TTM : `[now - 365j, now]`.
 * Les dates dans le futur sont exclues (pas de projection).
 */
export function filterDividendsTtm(
  txs: readonly DividendTx[],
  now: Date = new Date(),
): DividendTx[] {
  const nowMs   = now.getTime()
  const startMs = nowMs - TTM_WINDOW_MS
  return txs.filter((t) => {
    const tsMs = new Date(t.executed_at).getTime()
    return tsMs >= startMs && tsMs <= nowMs
  })
}

/**
 * Calcule les métriques dividendes pour UNE position. L'appelant doit
 * avoir déjà filtré les dividendes au bon `position_id`.
 */
export function computePositionDividendMetrics(
  txs:      readonly DividendTx[],
  position: DividendPositionContext,
  now:      Date = new Date(),
): DividendMetrics {
  const inWindow = filterDividendsTtm(txs, now)
  const ttmTotal = inWindow.reduce((s, t) => s + t.amount, 0)

  const yieldOnCost =
    position.costBasis > 0 ? (ttmTotal / position.costBasis) * 100 : null

  const yieldOnMarket =
    position.marketValue !== null && position.marketValue > 0
      ? (ttmTotal / position.marketValue) * 100
      : null

  return {
    positionId: position.positionId,
    ttmTotal,
    yieldOnCost,
    yieldOnMarket,
  }
}

/**
 * Agrégat portefeuille. L'appelant fournit le TTM total déjà converti
 * en devise ref + les totaux cost_basis / market_value en devise ref
 * (cohérent avec build-from-db.ts qui a la map FX d'E1).
 */
export function aggregateDividendsForPortfolio(input: {
  ttmTotalRef:         number
  totalCostBasisRef:   number
  totalMarketValueRef: number | null
}): PortfolioDividendSummary {
  const { ttmTotalRef, totalCostBasisRef, totalMarketValueRef } = input
  return {
    ttmTotal: ttmTotalRef,
    yieldOnCost:
      totalCostBasisRef > 0 ? (ttmTotalRef / totalCostBasisRef) * 100 : null,
    yieldOnMarket:
      totalMarketValueRef !== null && totalMarketValueRef > 0
        ? (ttmTotalRef / totalMarketValueRef) * 100
        : null,
  }
}
