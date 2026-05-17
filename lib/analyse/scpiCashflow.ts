/**
 * Estimation du cashflow mensuel SCPI (Sprint 2 — D6).
 *
 * Avant : `/api/snapshots/route.ts` documentait `TODO Phase 2 : ajouter les
 * revenus SCPI`. Les positions SCPI etaient stockees mais leur rendement
 * distribue n'etait pas integre au snapshot.
 *
 * Apres : on applique un rendement de distribution par defaut (4 %/an,
 * mediane du marche SCPI rendement) sur la valeur de marche de chaque
 * position SCPI active.
 *
 * Pure (pas d'I/O). Le caller fait le query Supabase puis appelle.
 */

/** Rendement distribue annuel par defaut sur les SCPI (mediane marche FR). */
export const DEFAULT_SCPI_YIELD_PCT = 4.0

export interface ScpiPositionLike {
  /** Valeur de marche actuelle (€). Si null/undefined, on retombe sur cost basis. */
  market_value:  number | null
  /** PRU pondere : quantite × moyenne (€). */
  cost_basis:    number | null
  /** Override du rendement (% annuel). Si null, on utilise le defaut. */
  yield_pct?:    number | null
}

export interface ScpiCashflowResult {
  /** Cashflow mensuel total estime (€). */
  monthly:       number
  /** Cashflow annuel (= monthly × 12). */
  annual:        number
  /** Nombre de positions SCPI prises en compte. */
  positionCount: number
}

export function computeScpiCashflowMonthly(
  positions: ReadonlyArray<ScpiPositionLike>,
): ScpiCashflowResult {
  let annual = 0
  let count  = 0
  for (const p of positions) {
    const value = p.market_value ?? p.cost_basis ?? 0
    if (value <= 0) continue
    const yieldPct = p.yield_pct ?? DEFAULT_SCPI_YIELD_PCT
    annual += value * (yieldPct / 100)
    count++
  }
  const monthly = annual / 12
  return {
    monthly:       Math.round(monthly * 100) / 100,
    annual:        Math.round(annual * 100) / 100,
    positionCount: count,
  }
}
