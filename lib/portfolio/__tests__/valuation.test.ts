import { describe, it, expect } from 'vitest'
import { valuePortfolio } from '../valuation'
import type { InstrumentInput, PositionInput, PriceInput } from '../types'

// ─── Fixtures helpers ─────────────────────────────────────────────────────

const I = (id: string, over: Partial<InstrumentInput> = {}): InstrumentInput => ({
  id, ticker: 'TST', isin: null, name: 'Test', assetClass: 'equity', valuationFrequency: 'daily',
  subclass: null, currency: 'EUR', sector: null, geography: null, ...over,
})

const P = (id: string, instrumentId: string, over: Partial<PositionInput> = {}): PositionInput => ({
  id, instrumentId, envelopeId: null, quantity: 10, averagePrice: 100,
  currency: 'EUR', acquisitionDate: '2025-01-01', status: 'active',
  broker: null, ...over,
})

const PR = (instrumentId: string, over: Partial<PriceInput> = {}): PriceInput => ({
  instrumentId, price: 110, currency: 'EUR',
  pricedAt: new Date().toISOString(), source: 'test',
  confidence: 'high', ...over,
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('valuePortfolio — base cases', () => {
  it('valorise une position simple en gain', () => {
    const r = valuePortfolio([P('p1', 'i1')], [I('i1')], [PR('i1')])

    expect(r.positions).toHaveLength(1)
    const v = r.positions[0]!
    expect(v.costBasis).toBe(1000)
    expect(v.marketValue).toBe(1100)
    expect(v.unrealizedPnL).toBe(100)
    expect(v.unrealizedPnLPct).toBeCloseTo(10)
    expect(v.priceStale).toBe(false)

    expect(r.summary.positionsCount).toBe(1)
    expect(r.summary.totalCostBasis).toBe(1000)
    expect(r.summary.totalMarketValue).toBe(1100)
    expect(r.summary.totalUnrealizedPnLPct).toBeCloseTo(10)
  })

  it('valorise une position en perte', () => {
    const r = valuePortfolio(
      [P('p1', 'i1')],
      [I('i1')],
      [PR('i1', { price: 80 })],
    )
    expect(r.positions[0]!.unrealizedPnL).toBe(-200)
    expect(r.positions[0]!.unrealizedPnLPct).toBeCloseTo(-20)
  })

  it('ignore une position dont l\'instrument est absent du catalogue', () => {
    const r = valuePortfolio([P('p1', 'missing')], [], [])
    expect(r.positions).toHaveLength(0)
    expect(r.summary.positionsCount).toBe(0)
  })

  it('garde la position listée mais sans market value si pas de prix', () => {
    const r = valuePortfolio([P('p1', 'i1')], [I('i1')], [])
    expect(r.positions).toHaveLength(1)
    expect(r.positions[0]!.marketValue).toBeNull()
    expect(r.positions[0]!.unrealizedPnL).toBeNull()
    expect(r.positions[0]!.unrealizedPnLPct).toBeNull()
    expect(r.summary.totalMarketValue).toBe(0)
    // BUG FIX : pas de prix → pas de fausse perte. PnL = null, pas -100%.
    expect(r.summary.totalUnrealizedPnL).toBeNull()
    expect(r.summary.totalUnrealizedPnLPct).toBeNull()
    expect(r.summary.totalCostBasis).toBe(1000)         // capital investi reel
    expect(r.summary.totalCostBasisValued).toBe(0)      // rien de valorise
    expect(r.summary.valuedPositionsCount).toBe(0)
  })

  it('PnL agregé ne compte que les positions valorisées (mix prix / pas-prix)', () => {
    const r = valuePortfolio(
      [
        P('p1', 'i1', { quantity: 10, averagePrice: 100 }),  // valorisée +10%
        P('p2', 'i2', { quantity: 10, averagePrice: 50 }),   // pas de prix
      ],
      [I('i1'), I('i2')],
      [PR('i1', { price: 110 })],  // seul i1 a un prix
    )
    expect(r.summary.positionsCount).toBe(2)
    expect(r.summary.valuedPositionsCount).toBe(1)
    expect(r.summary.totalCostBasis).toBe(1500)         // 1000 + 500
    expect(r.summary.totalCostBasisValued).toBe(1000)   // p1 only
    expect(r.summary.totalMarketValue).toBe(1100)
    // PnL = 1100 - 1000 = +100 → +10%, PAS calculé sur 1500
    expect(r.summary.totalUnrealizedPnL).toBeCloseTo(100, 6)
    expect(r.summary.totalUnrealizedPnLPct).toBeCloseTo(10, 6)
  })
})

describe('valuePortfolio — edge cases', () => {
  it('gère averagePrice = 0 (PnL en montant ok, % null)', () => {
    const r = valuePortfolio(
      [P('p1', 'i1', { averagePrice: 0 })],
      [I('i1')],
      [PR('i1', { price: 50 })],
    )
    expect(r.positions[0]!.costBasis).toBe(0)
    expect(r.positions[0]!.marketValue).toBe(500)
    expect(r.positions[0]!.unrealizedPnL).toBe(500)
    expect(r.positions[0]!.unrealizedPnLPct).toBeNull()
  })

  it('gère quantity = 0 (toutes les valeurs financières à 0)', () => {
    const r = valuePortfolio(
      [P('p1', 'i1', { quantity: 0 })],
      [I('i1')],
      [PR('i1')],
    )
    expect(r.positions[0]!.costBasis).toBe(0)
    expect(r.positions[0]!.marketValue).toBe(0)
    expect(r.positions[0]!.unrealizedPnL).toBe(0)
  })

  it('marque comme stale un prix vieux de plus de 24h', () => {
    // Pour daily, le seuil est 36h (week-end & jours fériés). Donc 48h doit être stale.
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const r = valuePortfolio(
      [P('p1', 'i1')],
      [I('i1')],
      [PR('i1', { pricedAt: oldDate })],
    )
    expect(r.positions[0]!.priceStale).toBe(true)
    expect(r.summary.freshnessRatio).toBe(0)
  })

  it('marque comme frais un prix recent (daily, < 36h)', () => {
    const r = valuePortfolio([P('p1', 'i1')], [I('i1')], [PR('i1')])
    expect(r.positions[0]!.priceStale).toBe(false)
    expect(r.summary.freshnessRatio).toBe(1)
  })

  it('exclut les positions closed des agrégats', () => {
    const r = valuePortfolio(
      [
        P('p1', 'i1'),
        P('p2', 'i1', { status: 'closed' }),
      ],
      [I('i1')],
      [PR('i1')],
    )
    // 2 positions retournées (pour l'UI), mais agrégats sur 1 seule
    expect(r.positions).toHaveLength(2)
    expect(r.summary.positionsCount).toBe(1)
    expect(r.summary.totalCostBasis).toBe(1000)
  })
})

describe('valuePortfolio — multi-currency', () => {
  it('utilise fxConvert pour valoriser un USD en EUR', () => {
    const fx = (from: string, to: string) => {
      if (from === to) return 1
      if (from === 'USD' && to === 'EUR') return 0.9
      if (from === 'EUR' && to === 'USD') return 1 / 0.9
      return null
    }

    const r = valuePortfolio(
      [P('p1', 'i1', { currency: 'USD', averagePrice: 100, quantity: 10 })],
      [I('i1', { currency: 'USD' })],
      [PR('i1', { currency: 'USD', price: 110 })],
      { referenceCurrency: 'EUR', fxConvert: fx },
    )

    // En devise locale (USD)
    expect(r.positions[0]!.costBasis).toBe(1000)
    expect(r.positions[0]!.marketValue).toBe(1100)

    // En devise ref (EUR) : 1100 * 0.9 = 990
    expect(r.summary.totalMarketValue).toBeCloseTo(990)
    expect(r.summary.totalCostBasis).toBeCloseTo(900)
  })

  it('skip une position si fxConvert renvoie null pour la ref', () => {
    const fx = (from: string, to: string) => (from === to ? 1 : null)

    const r = valuePortfolio(
      [
        P('p-eur', 'i1'),
        P('p-jpy', 'i2', { currency: 'JPY', averagePrice: 1500, quantity: 1 }),
      ],
      [I('i1'), I('i2', { currency: 'JPY' })],
      [PR('i1'), PR('i2', { currency: 'JPY', price: 1600 })],
      { referenceCurrency: 'EUR', fxConvert: fx },
    )

    // EUR contribue, JPY non (pas de taux fourni)
    expect(r.summary.totalMarketValue).toBe(1100)
  })
})

describe('valuePortfolio — allocations', () => {
  it('agrège correctement par classe d\'actif', () => {
    const r = valuePortfolio(
      [
        P('p1', 'i-eq', { quantity: 1, averagePrice: 100 }),
        P('p2', 'i-cr', { quantity: 1, averagePrice: 100 }),
        P('p3', 'i-eq', { quantity: 1, averagePrice: 100 }),
      ],
      [
        I('i-eq', { assetClass: 'equity' }),
        I('i-cr', { assetClass: 'crypto' }),
      ],
      [
        PR('i-eq', { price: 200 }),
        PR('i-cr', { price: 100 }),
      ],
    )

    const byClass = r.summary.allocationByClass
    expect(byClass).toHaveLength(2)

    const equity = byClass.find((c) => c.assetClass === 'equity')!
    expect(equity.value).toBe(400)         // 2 × 200
    expect(equity.weightPct).toBeCloseTo(80)

    const crypto = byClass.find((c) => c.assetClass === 'crypto')!
    expect(crypto.value).toBe(100)
    expect(crypto.weightPct).toBeCloseTo(20)
  })

  it('agrège par enveloppe (null = direct)', () => {
    const r = valuePortfolio(
      [
        P('p1', 'i1', { envelopeId: 'env-pea' }),
        P('p2', 'i1', { envelopeId: 'env-pea' }),
        P('p3', 'i1', { envelopeId: null }),
      ],
      [I('i1')],
      [PR('i1', { price: 100 })],
    )

    const byEnv = r.summary.allocationByEnvelope
    expect(byEnv).toHaveLength(2)

    const pea = byEnv.find((e) => e.envelopeId === 'env-pea')!
    expect(pea.value).toBe(2000)

    const direct = byEnv.find((e) => e.envelopeId === null)!
    expect(direct.value).toBe(1000)
  })
})
