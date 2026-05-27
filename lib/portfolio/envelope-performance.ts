/**
 * Performance par enveloppe (Étape 3 / E12).
 *
 * Pour chaque enveloppe (PEA, CTO, AV, PER…) ayant au moins une position
 * active, calcule :
 *   - currentValue / investedValue / unrealizedPnl en devise ref
 *   - realizedPnlTtm (déjà agrégé en amont par R6)
 *   - TWR (Time-Weighted Return) depuis les snapshots par enveloppe
 *   - MWR (Money-Weighted Return / IRR) depuis snapshots + cash flows filtrés
 *
 * Seuils (cf. brief utilisateur) :
 *   - TWR : ≥ 2 snapshots requis (contrat `computeTWR`) → sinon null.
 *   - MWR : ≥ 2 ValuePoints requis par `computeMWR` (un point initial +
 *           un final). En dessous → null. Note : le user a évoqué
 *           "1 cash flow + 1 valeur finale" comme cas plancher, mais le
 *           moteur `computeMWR` (réutilisé sans modification, cf. règle
 *           du brief) traite V_0 comme un apport au temps 0 et nécessite
 *           strictement 2 ValuePoints — sinon il retourne null lui-même.
 *
 * Module pur : aucune dépendance Supabase / Next.js. Toutes les
 * conversions FX vers devise ref sont supposées déjà faites par l'appelant
 * (cf. `PositionValuation.costBasisRef` / `marketValueRef`).
 */

import type { PositionValuation } from './types'
import type { ValuePoint, CashFlow } from './analytics'
import { computeTWR, computeMWR } from './analytics'

export interface EnvelopePerformance {
  envelopeId:       string
  envelopeLabel:    string
  /** Valeur de marché courante (devise ref). Fallback cost_basis si pas de prix. */
  currentValue:     number
  /** Cost basis cumulé (devise ref). */
  investedValue:    number
  /** PV/MV latente = SUM(marketValueRef − costBasisRef) sur les positions valorisées. */
  unrealizedPnl:    number
  /** = unrealizedPnl / investedValue × 100. 0 si investedValue = 0 (pas de position). */
  unrealizedPnlPct: number
  /**
   * PV réalisée sur 12 mois glissants (déjà calculée par R6 dans
   * `summary.realizedPnlTtm.byEnvelope`). `null` si aucune vente avec
   * realized_pnl non nul sur la période.
   */
  realizedPnlTtm:   number | null
  /** Time-Weighted Return total. `null` si < 2 snapshots. */
  twr:              number | null
  /** Money-Weighted Return (IRR annualisé). `null` si < 2 snapshots. */
  mwr:              number | null
  /** Part de la valeur totale du portefeuille (toutes enveloppes confondues). */
  weightPct:        number
}

export interface ComputeEnvelopePerformanceInput {
  /** Positions enrichies (devise ref disponible) issues de `valuePortfolio`. */
  positions:                PositionValuation[]
  /** envelope_id → libellé affichable (FinancialEnvelope.name). */
  envelopeLabels:           Record<string, string>
  /** envelope_id → série chronologique de valeurs (devise ref). */
  snapshotsByEnvelope:      Record<string, ValuePoint[]>
  /** envelope_id → cash flows filtrés (déjà inversés vs transactions.amount). */
  cashFlowsByEnvelope:      Record<string, CashFlow[]>
  /** envelope_id → realized_pnl TTM (devise ref) déjà calculé par R6. */
  realizedPnlTtmByEnvelope: Record<string, number>
  /** Valeur totale du portefeuille en devise ref (pour `weightPct`). */
  totalMarketValueRef:      number
}

export function computeEnvelopePerformance(
  args: ComputeEnvelopePerformanceInput,
): EnvelopePerformance[] {
  const byEnvelope = new Map<string, PositionValuation[]>()
  for (const p of args.positions) {
    if (p.status !== 'active') continue
    if (p.envelopeId === null)  continue
    const arr = byEnvelope.get(p.envelopeId) ?? []
    arr.push(p)
    byEnvelope.set(p.envelopeId, arr)
  }

  const out: EnvelopePerformance[] = []
  for (const [envelopeId, posList] of byEnvelope) {
    let currentValue       = 0
    let investedValue      = 0
    let unrealizedPnl      = 0
    let investedForPctOnly = 0  // cost basis des positions valorisées (pour le % cohérent)

    for (const p of posList) {
      investedValue += p.costBasisRef
      if (p.marketValueRef !== null) {
        currentValue       += p.marketValueRef
        unrealizedPnl      += p.unrealizedPnLRef ?? 0
        investedForPctOnly += p.costBasisRef
      } else {
        // Fallback cost_basis pour la valeur effective de l'allocation
        // (cohérent avec valuation.ts). Pas d'impact sur unrealizedPnl.
        currentValue       += p.costBasisRef
      }
    }

    const unrealizedPnlPct =
      investedForPctOnly > 0 ? (unrealizedPnl / investedForPctOnly) * 100 : 0

    const snapshots = args.snapshotsByEnvelope[envelopeId] ?? []
    const cashFlows = args.cashFlowsByEnvelope[envelopeId] ?? []

    // Seuil ≥ 2 snapshots pour TWR comme pour MWR (contrat des moteurs
    // `computeTWR` / `computeMWR` qui exigent au moins un point initial
    // et un point final). En dessous → null sans erreur.
    const twr = snapshots.length >= 2 ? computeTWR(snapshots, cashFlows) : null
    const mwr = snapshots.length >= 2 ? computeMWR(snapshots, cashFlows) : null

    const weightPct =
      args.totalMarketValueRef > 0
        ? (currentValue / args.totalMarketValueRef) * 100
        : 0

    out.push({
      envelopeId,
      envelopeLabel:    args.envelopeLabels[envelopeId] ?? envelopeId,
      currentValue,
      investedValue,
      unrealizedPnl,
      unrealizedPnlPct,
      realizedPnlTtm:   args.realizedPnlTtmByEnvelope[envelopeId] ?? null,
      twr,
      mwr,
      weightPct,
    })
  }

  // Tri descendant par valeur courante : la plus grosse enveloppe en haut.
  return out.sort((a, b) => b.currentValue - a.currentValue)
}
