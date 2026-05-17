import { describe, it, expect } from 'vitest'
import {
  normalizeSnapshotSeries,
  checkSeriesMatchesLive,
  type SnapshotPoint,
} from '../normalize-snapshots'

const TODAY = new Date('2026-05-17T12:00:00Z')

function pt(date: string, mv: number, cb: number): SnapshotPoint {
  return { snapshot_date: date, total_market_value: mv, total_cost_basis: cb, total_pnl: mv - cb }
}

describe('normalizeSnapshotSeries', () => {
  it('série vide → un seul point live aujourd\'hui', () => {
    const out = normalizeSnapshotSeries([], {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    }, { now: TODAY })
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      snapshot_date: '2026-05-17',
      total_market_value: 56_500,
      total_cost_basis:   53_800,
      total_pnl:          2_700,
    })
  })

  it('append un point live si dernier snapshot < aujourd\'hui', () => {
    const series = [pt('2026-05-11', 45_000, 45_000), pt('2026-05-15', 50_000, 50_000)]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    }, { now: TODAY })
    expect(out).toHaveLength(3)
    expect(out[2]!.snapshot_date).toBe('2026-05-17')
    expect(out[2]!.total_market_value).toBe(56_500)
    expect(out[2]!.total_cost_basis).toBe(53_800)
  })

  it('remplace le snapshot du jour s\'il diverge des KPI live', () => {
    const series = [pt('2026-05-17', 50_000, 50_000)]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    }, { now: TODAY })
    expect(out).toHaveLength(1)
    expect(out[0]!.total_market_value).toBe(56_500)
    expect(out[0]!.total_cost_basis).toBe(53_800)
  })

  it('conserve le snapshot du jour s\'il colle aux KPI (pas de mutation inutile)', () => {
    const series = [pt('2026-05-17', 56_500, 53_800)]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500.3, totalCostBasis: 53_800.2, totalUnrealizedPnL: 2_700.1,
    }, { now: TODAY })
    expect(out).toHaveLength(1)
    // Drift cumulé 0.5 € < tolérance 1 € → conserve le point original (PnL recalculé)
    expect(out[0]!.total_market_value).toBe(56_500)
  })

  it('le DERNIER point correspond exactement aux KPI live', () => {
    const series = [pt('2026-05-11', 45_000, 45_000), pt('2026-05-12', 44_000, 46_000)]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    }, { now: TODAY })
    const last = out[out.length - 1]!
    expect(last.total_market_value).toBe(56_500)
    expect(last.total_cost_basis).toBe(53_800)
    expect(last.total_pnl).toBe(2_700)
  })

  it('force la monotonie croissante du cost_basis', () => {
    // Cas : début à 45k (positions partielles), milieu à 30k (snapshot foireux),
    // fin à 53.8k. Le cost_basis affiché doit être 45 → 45 → 53.8.
    const series = [pt('2026-05-11', 45_000, 45_000), pt('2026-05-12', 30_000, 30_000)]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    }, { now: TODAY })
    expect(out.map((p) => p.total_cost_basis)).toEqual([45_000, 45_000, 53_800])
  })

  it('cost_basis monotone : aucun point ne descend', () => {
    const series = [
      pt('2026-05-11', 10_000, 10_000),
      pt('2026-05-12', 20_000, 20_000),
      pt('2026-05-13', 15_000, 15_000),  // drop → doit rester à 20k
      pt('2026-05-14', 22_000, 22_000),
    ]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 30_000, totalCostBasis: 25_000, totalUnrealizedPnL: 5_000,
    }, { now: TODAY })
    const costs = out.map((p) => p.total_cost_basis)
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]!)
    }
  })

  it('relève market_value sous cost_basis uniquement quand l\'origine était au fallback', () => {
    // Snapshot d'origine : mv = cb (position sans prix, fallback). Après monotonie
    // forcée du cb, mv ne doit pas se retrouver sous le cb.
    const series = [
      pt('2026-05-11', 45_000, 45_000),       // fallback (mv == cb)
      pt('2026-05-12', 30_000, 30_000),       // fallback (mv == cb), cb sera relevé à 45k
    ]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    }, { now: TODAY })
    expect(out[1]!.total_cost_basis).toBe(45_000)
    expect(out[1]!.total_market_value).toBe(45_000) // relevé pour ne pas être sous le cb corrigé
    expect(out[1]!.total_pnl).toBe(0)
  })

  it('préserve les vraies moins-values latentes (mv brut < cb brut)', () => {
    // Position réellement valorisée en perte : mv < cb. Le running max sur le
    // cost_basis ne doit PAS écraser cette moins-value.
    const series = [
      pt('2026-05-11', 50_000, 50_000),
      pt('2026-05-12', 47_000, 50_000),  // vraie perte de -3k
    ]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 49_000, totalCostBasis: 50_000, totalUnrealizedPnL: -1_000,
    }, { now: TODAY })
    expect(out[1]!.total_market_value).toBe(47_000)
    expect(out[1]!.total_pnl).toBe(-3_000)
  })

  it('PnL recalculé = MV − CB sur tous les points', () => {
    const series = [pt('2026-05-11', 45_000, 45_000), pt('2026-05-12', 48_000, 46_000)]
    const out = normalizeSnapshotSeries(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: null,
    }, { now: TODAY })
    for (const p of out) {
      expect(p.total_pnl).toBeCloseTo(p.total_market_value - p.total_cost_basis, 2)
    }
  })

  it('totalUnrealizedPnL null → utilise MV − CB pour le point live', () => {
    const out = normalizeSnapshotSeries([], {
      totalMarketValue: 100, totalCostBasis: 80, totalUnrealizedPnL: null,
    }, { now: TODAY })
    expect(out[0]!.total_pnl).toBe(20)
  })
})

describe('checkSeriesMatchesLive', () => {
  it('null si dernier point matche les KPI', () => {
    const series = [pt('2026-05-17', 56_500, 53_800)]
    expect(
      checkSeriesMatchesLive(series, {
        totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
      }),
    ).toBeNull()
  })

  it('message d\'erreur si dérive > tolérance', () => {
    const series = [pt('2026-05-17', 45_000, 45_000)]
    const msg = checkSeriesMatchesLive(series, {
      totalMarketValue: 56_500, totalCostBasis: 53_800, totalUnrealizedPnL: 2_700,
    })
    expect(msg).toContain('désynchronisé')
  })

  it('série vide → message explicite', () => {
    expect(
      checkSeriesMatchesLive([], { totalMarketValue: 0, totalCostBasis: 0, totalUnrealizedPnL: null }),
    ).toBe('série vide')
  })
})
