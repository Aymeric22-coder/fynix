/**
 * Tests E3 — calculs dividendes & yields TTM.
 *
 * Couvre :
 *   - Filtrage fenêtre 12 mois glissants (bords inclus, futur exclu).
 *   - YoC / YoM standards.
 *   - Edge cases : 0 dividende, cost_basis nul, market_value null.
 *   - Agrégat portefeuille.
 */

import { describe, it, expect } from 'vitest'
import {
  filterDividendsTtm,
  computePositionDividendMetrics,
  aggregateDividendsForPortfolio,
  type DividendTx,
  type DividendPositionContext,
} from '../dividends'

const NOW = new Date('2026-06-15T12:00:00Z')

function tx(over: Partial<DividendTx> & { executed_at: string }): DividendTx {
  return {
    position_id: 'pos-1',
    amount:      10,
    currency:    'EUR',
    ...over,
  }
}

const POSITION: DividendPositionContext = {
  positionId:  'pos-1',
  costBasis:   1000,
  marketValue: 1200,
  currency:    'EUR',
}

describe('filterDividendsTtm', () => {
  it('garde uniquement les tx dans la fenêtre [now-365j, now]', () => {
    const out = filterDividendsTtm(
      [
        tx({ executed_at: '2025-06-16T00:00:00Z' }),  // 364j en arrière → IN
        tx({ executed_at: '2025-06-14T00:00:00Z' }),  // 366j en arrière → OUT
        tx({ executed_at: '2026-06-14T00:00:00Z' }),  // hier → IN
        tx({ executed_at: '2026-06-16T00:00:00Z' }),  // demain → OUT (futur)
      ],
      NOW,
    )
    expect(out).toHaveLength(2)
  })
})

describe('computePositionDividendMetrics', () => {
  it('Cas A — 3 dividendes dans la fenêtre : somme + yields corrects', () => {
    const m = computePositionDividendMetrics(
      [
        tx({ executed_at: '2026-01-15T00:00:00Z', amount: 12 }),
        tx({ executed_at: '2026-04-15T00:00:00Z', amount: 12 }),
        tx({ executed_at: '2026-06-01T00:00:00Z', amount: 16 }),
      ],
      POSITION,
      NOW,
    )
    expect(m.ttmTotal).toBe(40)
    expect(m.yieldOnCost).toBeCloseTo(4, 10)              // 40/1000 × 100
    expect(m.yieldOnMarket).toBeCloseTo(40/1200*100, 10)  // ≈3,333 %
  })

  it('Cas B — Dividende vieux de plus de 12 mois : exclu', () => {
    const m = computePositionDividendMetrics(
      [
        tx({ executed_at: '2024-01-15T00:00:00Z', amount: 100 }),  // > 365j
        tx({ executed_at: '2026-01-15T00:00:00Z', amount: 30 }),
      ],
      POSITION,
      NOW,
    )
    expect(m.ttmTotal).toBe(30)
  })

  it('Cas C — Aucun dividende : zéros explicites (pas null)', () => {
    const m = computePositionDividendMetrics([], POSITION, NOW)
    expect(m.ttmTotal).toBe(0)
    expect(m.yieldOnCost).toBe(0)
    expect(m.yieldOnMarket).toBe(0)
  })

  it('Cas D — cost_basis = 0 : YoC = null, YoM reste calculé', () => {
    const m = computePositionDividendMetrics(
      [tx({ executed_at: '2026-01-15T00:00:00Z', amount: 30 })],
      { ...POSITION, costBasis: 0 },
      NOW,
    )
    expect(m.ttmTotal).toBe(30)
    expect(m.yieldOnCost).toBeNull()
    expect(m.yieldOnMarket).toBeCloseTo(30/1200*100, 10)
  })

  it('Cas E — market_value null : YoM = null, YoC reste calculé', () => {
    const m = computePositionDividendMetrics(
      [tx({ executed_at: '2026-01-15T00:00:00Z', amount: 30 })],
      { ...POSITION, marketValue: null },
      NOW,
    )
    expect(m.ttmTotal).toBe(30)
    expect(m.yieldOnCost).toBeCloseTo(3, 10)
    expect(m.yieldOnMarket).toBeNull()
  })
})

describe('aggregateDividendsForPortfolio', () => {
  it('agrège correctement les 3 métriques en devise ref', () => {
    const a = aggregateDividendsForPortfolio({
      ttmTotalRef:         500,
      totalCostBasisRef:   10000,
      totalMarketValueRef: 12000,
    })
    expect(a.ttmTotal).toBe(500)
    expect(a.yieldOnCost).toBeCloseTo(5, 10)
    expect(a.yieldOnMarket).toBeCloseTo(500/12000*100, 10)
  })

  it('null si dénominateur ≤ 0 ou market_value null', () => {
    const a = aggregateDividendsForPortfolio({
      ttmTotalRef:         500,
      totalCostBasisRef:   0,
      totalMarketValueRef: null,
    })
    expect(a.ttmTotal).toBe(500)
    expect(a.yieldOnCost).toBeNull()
    expect(a.yieldOnMarket).toBeNull()
  })
})
