import { describe, it, expect } from 'vitest'
import { computeHistoricalAnalytics } from '../historical-analytics'

describe('computeHistoricalAnalytics', () => {
  it('renvoie un resultat vide si moins de 2 snapshots', () => {
    const r = computeHistoricalAnalytics([])
    expect(r.totalReturn).toBeNull()
    expect(r.pointsCount).toBe(0)

    const r2 = computeHistoricalAnalytics([
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
    ])
    expect(r2.totalReturn).toBeNull()
    expect(r2.pointsCount).toBe(1)
  })

  it('calcule un rendement simple sans cash flow', () => {
    const r = computeHistoricalAnalytics([
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2026-12-31', total_market_value: 1100 },
    ])
    expect(r.totalReturn).toBeCloseTo(0.10, 4)
    expect(r.pointsCount).toBe(2)
    expect(r.daysCovered).toBe(364)
  })

  it('detecte un drawdown', () => {
    const r = computeHistoricalAnalytics([
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2026-03-01', total_market_value: 1200 },  // pic
      { snapshot_date: '2026-06-01', total_market_value: 900 },   // creux : -25%
      { snapshot_date: '2026-12-31', total_market_value: 1100 },
    ])
    expect(r.maxDrawdown).toBeCloseTo(-0.25, 4)
    expect(r.currentDrawdown).toBeCloseTo(-(1200 - 1100) / 1200, 4)
  })

  it('annualise correctement le rendement', () => {
    // +21% sur 2 ans (730 jours) -> ~10% annualise
    const r = computeHistoricalAnalytics([
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2027-12-31', total_market_value: 1210 },
    ])
    expect(r.annualizedReturn).toBeCloseTo(0.10, 2)
  })

  it('tri implicite : ordre des inputs ne change rien', () => {
    const ordered = computeHistoricalAnalytics([
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2026-12-31', total_market_value: 1100 },
    ])
    const shuffled = computeHistoricalAnalytics([
      { snapshot_date: '2026-12-31', total_market_value: 1100 },
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
    ])
    expect(ordered.totalReturn).toBeCloseTo(shuffled.totalReturn!, 6)
  })
})
