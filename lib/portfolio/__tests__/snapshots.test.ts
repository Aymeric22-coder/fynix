import { describe, it, expect } from 'vitest'
import { computeSnapshot } from '../snapshots'
import type { PortfolioResult } from '../types'

function fakeResult(over: Partial<PortfolioResult['summary']> = {}): PortfolioResult {
  return {
    positions: [],
    summary: {
      positionsCount:        2,
      valuedPositionsCount:  2,
      totalCostBasis:        1000,
      totalCostBasisValued:  1000,
      totalMarketValue:      1234.56,
      totalUnrealizedPnL:    234.56,
      totalUnrealizedPnLPct: 23.456,
      freshnessRatio:        1,
      allocationByClass: [
        { assetClass: 'etf',    value: 1000.50, weightPct: 81 },
        { assetClass: 'crypto', value: 234.06,  weightPct: 19 },
      ],
      allocationByEnvelope: [
        { envelopeId: 'env-pea', value: 1000,    weightPct: 81 },
        { envelopeId: null,      value: 234.56,  weightPct: 19 },
      ],
      referenceCurrency:     'EUR',
      ...over,
    },
  }
}

describe('computeSnapshot', () => {
  it('aplatit le PortfolioResult en snapshot serialisable', () => {
    const now = new Date('2026-05-11T10:00:00Z')
    const s = computeSnapshot(fakeResult(), now)

    expect(s.snapshotDate).toBe('2026-05-11')
    expect(s.totalMarketValue).toBe(1234.56)
    expect(s.totalCostBasis).toBe(1000)
    expect(s.totalPnL).toBe(234.56)
    expect(s.totalPnLPct).toBeCloseTo(23.456, 3)
    expect(s.positionsCount).toBe(2)
    expect(s.valuedCount).toBe(2)
    expect(s.referenceCurrency).toBe('EUR')
  })

  it('mappe l\'allocation par classe en record { classe: valeur }', () => {
    const s = computeSnapshot(fakeResult())
    expect(s.allocationByClass).toEqual({ etf: 1000.50, crypto: 234.06 })
  })

  it('remplace envelopeId=null par _direct dans la map', () => {
    const s = computeSnapshot(fakeResult())
    expect(s.allocationByEnvelope['env-pea']).toBe(1000)
    expect(s.allocationByEnvelope['_direct']).toBe(234.56)
  })

  it('gere PnL null (pas de position valorisee)', () => {
    const s = computeSnapshot(fakeResult({
      totalUnrealizedPnL:    null,
      totalUnrealizedPnLPct: null,
    }))
    expect(s.totalPnL).toBe(0)
    expect(s.totalPnLPct).toBeNull()
  })

  it('utilise UTC pour la date du snapshot (pas timezone locale)', () => {
    // 23h59 UTC le 11 = encore le 11, pas le 12 meme si fuseau local en avance
    const s = computeSnapshot(fakeResult(), new Date('2026-05-11T23:59:00Z'))
    expect(s.snapshotDate).toBe('2026-05-11')
  })
})
