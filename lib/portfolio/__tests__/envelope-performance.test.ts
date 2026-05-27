/**
 * Tests E12 / Étape 3 — computeEnvelopePerformance.
 *
 * Helper pur qui agrège par enveloppe les positions valorisées + les
 * snapshots et cash flows pré-bucketés, et calcule TWR / MWR via
 * computeTWR / computeMWR (réutilisés sans modification).
 */

import { describe, it, expect } from 'vitest'
import { computeEnvelopePerformance } from '../envelope-performance'
import type { PositionValuation } from '../types'
import type { ValuePoint, CashFlow } from '../analytics'

function pos(over: Partial<PositionValuation> = {}): PositionValuation {
  return {
    positionId:       'p',
    instrumentId:     'i',
    ticker:           'TST',
    name:             'Test',
    assetClass:       'equity',
    envelopeId:       null,
    quantity:         10,
    averagePrice:     100,
    currency:         'EUR',
    currentPrice:     110,
    priceConfidence:  'high',
    priceFreshAt:     new Date().toISOString(),
    priceStale:       false,
    costBasis:        1000,
    marketValue:      1100,
    unrealizedPnL:    100,
    unrealizedPnLPct: 10,
    priceSource:      'test',
    status:           'active',
    costBasisRef:     1000,
    marketValueRef:   1100,
    unrealizedPnLRef: 100,
    ...over,
  }
}

const EMPTY = {
  envelopeLabels:           {},
  snapshotsByEnvelope:      {},
  cashFlowsByEnvelope:      {},
  realizedPnlTtmByEnvelope: {},
  totalMarketValueRef:      0,
}

describe('computeEnvelopePerformance', () => {
  it('aucune position avec envelopeId → tableau vide', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: null })],
    })
    expect(out).toEqual([])
  })

  it('position inactive ignorée même si elle a un envelopeId', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: 'env-pea', status: 'closed' })],
    })
    expect(out).toEqual([])
  })

  it('une enveloppe valorisée : agrège currentValue / investedValue / PnL', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [
        pos({ positionId: 'p1', envelopeId: 'env-pea',
              costBasisRef: 1000, marketValueRef: 1200, unrealizedPnLRef: 200 }),
        pos({ positionId: 'p2', envelopeId: 'env-pea',
              costBasisRef: 500,  marketValueRef: 600,  unrealizedPnLRef: 100 }),
      ],
      envelopeLabels:      { 'env-pea': 'PEA Bourse Direct' },
      totalMarketValueRef: 1800,
    })
    expect(out).toHaveLength(1)
    const r = out[0]!
    expect(r.envelopeId).toBe('env-pea')
    expect(r.envelopeLabel).toBe('PEA Bourse Direct')
    expect(r.currentValue).toBe(1800)
    expect(r.investedValue).toBe(1500)
    expect(r.unrealizedPnl).toBe(300)
    expect(r.unrealizedPnlPct).toBeCloseTo(20, 4)
    expect(r.weightPct).toBeCloseTo(100, 4)
  })

  it('label absent → fallback sur envelopeId', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: 'env-orphan' })],
      totalMarketValueRef: 1100,
    })
    expect(out[0]!.envelopeLabel).toBe('env-orphan')
  })

  it('plusieurs enveloppes : tri descendant par currentValue', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [
        pos({ positionId: 'p1', envelopeId: 'env-cto', costBasisRef: 5000, marketValueRef: 5500 }),
        pos({ positionId: 'p2', envelopeId: 'env-pea', costBasisRef: 8000, marketValueRef: 9000 }),
      ],
      totalMarketValueRef: 14500,
    })
    expect(out.map((e) => e.envelopeId)).toEqual(['env-pea', 'env-cto'])
  })

  it('TWR : < 2 snapshots → null', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: 'env-pea' })],
      snapshotsByEnvelope: { 'env-pea': [{ date: '2026-01-01', value: 1000 }] },
      totalMarketValueRef: 1100,
    })
    expect(out[0]!.twr).toBeNull()
    expect(out[0]!.mwr).toBeNull()
  })

  it('TWR : ≥ 2 snapshots → calcul délégué à computeTWR', () => {
    // Série triviale sans cash flow : 1000 → 1200 = +20 %
    const snapshots: ValuePoint[] = [
      { date: '2026-01-01', value: 1000 },
      { date: '2026-04-01', value: 1200 },
    ]
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: 'env-pea', costBasisRef: 1000, marketValueRef: 1200 })],
      snapshotsByEnvelope: { 'env-pea': snapshots },
      totalMarketValueRef: 1200,
    })
    expect(out[0]!.twr).toBeCloseTo(0.2, 6)
  })

  it('MWR : neutralisé par un cash flow exact en milieu de période', () => {
    // Apport de 500 entre les deux mesures qui passent de 1000 → 1500.
    // Le rendement réel est 0 (le portefeuille n'a fait que recevoir le cash).
    const snapshots: ValuePoint[] = [
      { date: '2026-01-01', value: 1000 },
      { date: '2026-07-01', value: 1500 },
    ]
    const cashFlows: CashFlow[] = [{ date: '2026-04-01', amount: 500 }]
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: 'env-pea', costBasisRef: 1500, marketValueRef: 1500 })],
      snapshotsByEnvelope: { 'env-pea': snapshots },
      cashFlowsByEnvelope: { 'env-pea': cashFlows },
      totalMarketValueRef: 1500,
    })
    expect(out[0]!.mwr).toBeCloseTo(0, 2)
  })

  it('realizedPnlTtm propagé depuis R6 (avec fallback null si absent)', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [
        pos({ positionId: 'p1', envelopeId: 'env-pea' }),
        pos({ positionId: 'p2', envelopeId: 'env-cto' }),
      ],
      realizedPnlTtmByEnvelope: { 'env-pea': 1234.56 },
      totalMarketValueRef: 2200,
    })
    const pea = out.find((e) => e.envelopeId === 'env-pea')!
    const cto = out.find((e) => e.envelopeId === 'env-cto')!
    expect(pea.realizedPnlTtm).toBeCloseTo(1234.56, 4)
    expect(cto.realizedPnlTtm).toBeNull()
  })

  it('position sans prix : fallback cost_basis sur currentValue, PnL inchangé', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [
        pos({ envelopeId: 'env-av', costBasisRef: 1000,
              marketValueRef: null, unrealizedPnLRef: null }),
      ],
      totalMarketValueRef: 1000,
    })
    const r = out[0]!
    expect(r.currentValue).toBe(1000)       // fallback cost
    expect(r.investedValue).toBe(1000)
    expect(r.unrealizedPnl).toBe(0)
    expect(r.unrealizedPnlPct).toBe(0)
  })

  it('weightPct : 0 si totalMarketValueRef = 0 (pas de division par zéro)', () => {
    const out = computeEnvelopePerformance({
      ...EMPTY,
      positions: [pos({ envelopeId: 'env-pea' })],
      totalMarketValueRef: 0,
    })
    expect(out[0]!.weightPct).toBe(0)
  })
})
