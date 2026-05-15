import { describe, it, expect } from 'vitest'
import { computePositionMovement, type PositionSnapshot } from '../movements'

const baseBefore: PositionSnapshot = {
  quantity:     100,
  averagePrice: 50,
  currency:     'EUR',
  instrumentId: 'instr-1',
  positionId:   'pos-1',
}

describe('computePositionMovement', () => {
  it('rien ne change → null', () => {
    expect(computePositionMovement({
      before: baseBefore,
      after:  { quantity: 100, averagePrice: 50 },
    })).toBeNull()
  })

  it('seul le PRU change (qty identique) → null (correction comptable pure)', () => {
    expect(computePositionMovement({
      before: baseBefore,
      after:  { quantity: 100, averagePrice: 55 },
    })).toBeNull()
  })

  it('qty augmente : génère un purchase au prix déduit de la moyenne pondérée', () => {
    // old: 100 × 50 = 5000. new: 150 × 60 = 9000. delta_cost = 4000 sur 50 parts = 80€/part
    const r = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 150, averagePrice: 60 },
    })
    expect(r).not.toBeNull()
    expect(r?.type).toBe('purchase')
    expect(r?.quantity).toBe(50)
    expect(r?.unitPrice).toBe(80)
    expect(r?.amount).toBe(-4000)
    expect(r?.currency).toBe('EUR')
  })

  it('qty augmente sans changer le PRU : unit_price = ancien PRU', () => {
    // old: 100 × 50. new: 120 × 50. delta_cost = 1000 sur 20 = 50
    const r = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 120, averagePrice: 50 },
    })
    expect(r?.unitPrice).toBe(50)
    expect(r?.amount).toBe(-1000)
  })

  it('qty diminue : génère une sale au dernier prix de marché si fourni', () => {
    const r = computePositionMovement({
      before:          baseBefore,
      after:           { quantity: 80, averagePrice: 50 },
      lastMarketPrice: 70,
    })
    expect(r?.type).toBe('sale')
    expect(r?.quantity).toBe(20)
    expect(r?.unitPrice).toBe(70)
    expect(r?.amount).toBe(1400)  // entrée de cash, positif
  })

  it('qty diminue sans prix marché : fallback ancien PRU', () => {
    const r = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 80, averagePrice: 50 },
    })
    expect(r?.type).toBe('sale')
    expect(r?.unitPrice).toBe(50)
    expect(r?.amount).toBe(1000)
  })

  it('qty diminue, lastMarketPrice à 0 ou négatif : fallback PRU', () => {
    const r1 = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 80, averagePrice: 50 },
      lastMarketPrice: 0,
    })
    expect(r1?.unitPrice).toBe(50)

    const r2 = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 80, averagePrice: 50 },
      lastMarketPrice: null,
    })
    expect(r2?.unitPrice).toBe(50)
  })

  it('tolérance EPSILON : delta de 1e-9 ne déclenche pas de mouvement', () => {
    expect(computePositionMovement({
      before: baseBefore,
      after:  { quantity: 100 + 1e-9, averagePrice: 50 },
    })).toBeNull()
  })

  it('after.currency override before.currency', () => {
    const r = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 150, averagePrice: 60, currency: 'USD' },
    })
    expect(r?.currency).toBe('USD')
  })

  it('executedAt explicite est propagé', () => {
    const d = new Date('2025-01-15T10:00:00Z')
    const r = computePositionMovement({
      before:     baseBefore,
      after:      { quantity: 150, averagePrice: 60 },
      executedAt: d,
    })
    expect(r?.executedAt).toBe(d)
  })

  it('instrumentId et positionId sont conservés depuis before', () => {
    const r = computePositionMovement({
      before: baseBefore,
      after:  { quantity: 80, averagePrice: 50 },
    })
    expect(r?.instrumentId).toBe('instr-1')
    expect(r?.positionId).toBe('pos-1')
  })
})
