/**
 * Tests du moteur TWR par enveloppe (V2.4 P0.7).
 *
 * Vérifie :
 *   - Groupement par envelopeId
 *   - Filtre minHoldingDays
 *   - Pas de mélange inter-enveloppes
 *   - Flag extrapole < 365 j
 */
import { describe, it, expect } from 'vitest'
import {
  computeTwrPerEnvelope,
  type EnvelopeTwrResult,
} from '../twr-per-envelope'
import type {
  TransactionForTwr,
  PositionForSegments,
} from '../transaction-segments'

const ASOF = new Date('2026-06-02')

function findEnv(results: EnvelopeTwrResult[], envelopeId: string): EnvelopeTwrResult | undefined {
  return results.find((r) => r.envelopeId === envelopeId)
}

describe('computeTwrPerEnvelope — groupement', () => {
  it('groupe positions par envelopeId et calcule un TWR par enveloppe', () => {
    // 1 PEA avec ETF World (purchase 100 @ 100 il y a ~1.5 an, MV 12 000)
    // 1 CTO avec action Tesla (purchase 50 @ 200 il y a ~1 an, MV 12 500)
    const transactions: TransactionForTwr[] = [
      { executedAt: '2024-12-15', type: 'purchase', positionId: 'P1', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
      { executedAt: '2025-06-01', type: 'purchase', positionId: 'P2', quantity:  50, unitPriceEur: 200, amountEur: 10_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P1', currentMvEur: 12_000, currentQuantity: 100, envelopeId: 'env-pea' },
      { positionId: 'P2', currentMvEur: 12_500, currentQuantity:  50, envelopeId: 'env-cto' },
    ]

    const results = computeTwrPerEnvelope({
      transactions,
      positions,
      envelopeLabels: new Map([
        ['env-pea', 'PEA'],
        ['env-cto', 'CTO'],
      ]),
      asOfDate: ASOF,
    })

    // 2 enveloppes attendues
    expect(results).toHaveLength(2)

    const pea = findEnv(results, 'env-pea')
    expect(pea?.envelopeLabel).toBe('PEA')
    expect(pea?.holdingDays).toBeGreaterThan(500)  // ~1.5 an
    expect(pea?.twrAnnualisePct).toBeGreaterThan(0)
    expect(pea?.extrapole).toBe(false)  // > 365 j

    const cto = findEnv(results, 'env-cto')
    expect(cto?.envelopeLabel).toBe('CTO')
    expect(cto?.holdingDays).toBeGreaterThanOrEqual(365)  // ~1 an
  })

  it('positions sans envelopeId sont groupées sous null (« Sans enveloppe »)', () => {
    const transactions: TransactionForTwr[] = [
      { executedAt: '2024-06-01', type: 'purchase', positionId: 'P_orphan', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P_orphan', currentMvEur: 11_000, currentQuantity: 100, envelopeId: null },
    ]
    const results = computeTwrPerEnvelope({
      transactions,
      positions,
      envelopeLabels: new Map(),
      asOfDate: ASOF,
    })
    expect(results).toHaveLength(1)
    expect(results[0]!.envelopeId).toBeNull()
    expect(results[0]!.envelopeLabel).toBe('Sans enveloppe')
  })
})

describe('computeTwrPerEnvelope — filtre minHoldingDays', () => {
  it('exclut les enveloppes dont l\'historique est < 90 j', () => {
    const transactions: TransactionForTwr[] = [
      // Enveloppe créée il y a 30 j → exclue
      { executedAt: '2026-05-03', type: 'purchase', positionId: 'P_fresh', quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
      // Enveloppe créée il y a ~1 an → conservée
      { executedAt: '2025-06-01', type: 'purchase', positionId: 'P_old',   quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P_fresh', currentMvEur: 1_500, currentQuantity: 10, envelopeId: 'env-fresh' },
      { positionId: 'P_old',   currentMvEur: 1_200, currentQuantity: 10, envelopeId: 'env-old' },
    ]
    const results = computeTwrPerEnvelope({
      transactions,
      positions,
      envelopeLabels: new Map(),
      asOfDate: ASOF,
    })
    expect(results.find((r) => r.envelopeId === 'env-fresh')).toBeUndefined()
    expect(results.find((r) => r.envelopeId === 'env-old')).toBeDefined()
  })

  it('le seuil est paramétrable via minHoldingDays', () => {
    const transactions: TransactionForTwr[] = [
      { executedAt: '2025-12-01', type: 'purchase', positionId: 'P', quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P', currentMvEur: 1_200, currentQuantity: 10, envelopeId: 'env' },
    ]
    // ~6 mois d'historique : exclu si seuil 200 j, inclus si seuil 90 j (défaut)
    const strict = computeTwrPerEnvelope({
      transactions, positions, envelopeLabels: new Map(), asOfDate: ASOF, minHoldingDays: 200,
    })
    expect(strict).toHaveLength(0)
    const lax = computeTwrPerEnvelope({
      transactions, positions, envelopeLabels: new Map(), asOfDate: ASOF, minHoldingDays: 90,
    })
    expect(lax).toHaveLength(1)
  })
})

describe('computeTwrPerEnvelope — extrapolation', () => {
  it('flag extrapole = true si holdingDays ∈ [90, 365)', () => {
    const transactions: TransactionForTwr[] = [
      { executedAt: '2026-01-01', type: 'purchase', positionId: 'P', quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P', currentMvEur: 1_100, currentQuantity: 10, envelopeId: 'env' },
    ]
    const results = computeTwrPerEnvelope({
      transactions, positions, envelopeLabels: new Map(), asOfDate: ASOF,
    })
    expect(results).toHaveLength(1)
    expect(results[0]!.extrapole).toBe(true)  // ~5 mois
  })

  it('flag extrapole = false si holdingDays >= 365', () => {
    const transactions: TransactionForTwr[] = [
      { executedAt: '2024-06-01', type: 'purchase', positionId: 'P', quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P', currentMvEur: 1_200, currentQuantity: 10, envelopeId: 'env' },
    ]
    const results = computeTwrPerEnvelope({
      transactions, positions, envelopeLabels: new Map(), asOfDate: ASOF,
    })
    expect(results[0]!.extrapole).toBe(false)
  })
})

describe('computeTwrPerEnvelope — pas de mélange inter-enveloppes', () => {
  it('les transactions sont strictement filtrées par positionId de l\'enveloppe', () => {
    // PEA gagnant +50 %, CTO perdant −20 %. Si on mélangeait, ça lisserait.
    const transactions: TransactionForTwr[] = [
      { executedAt: '2024-06-01', type: 'purchase', positionId: 'P_pea', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
      { executedAt: '2024-06-01', type: 'purchase', positionId: 'P_cto', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P_pea', currentMvEur: 15_000, currentQuantity: 100, envelopeId: 'env-pea' },
      { positionId: 'P_cto', currentMvEur:  8_000, currentQuantity: 100, envelopeId: 'env-cto' },
    ]
    const results = computeTwrPerEnvelope({
      transactions, positions, envelopeLabels: new Map(), asOfDate: ASOF,
    })
    const pea = findEnv(results, 'env-pea')!
    const cto = findEnv(results, 'env-cto')!
    expect(pea.twrCumulePct).toBeGreaterThan(40)  // ~+50 %
    expect(cto.twrCumulePct).toBeLessThan(-10)    // ~-20 %
    // Aucune ne doit prendre une valeur intermédiaire (= preuve de la séparation).
  })
})
