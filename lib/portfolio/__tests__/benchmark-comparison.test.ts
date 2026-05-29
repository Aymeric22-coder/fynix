/**
 * Tests BNCH — comparaison portefeuille vs benchmarks.
 *
 * Couvre : window 1 an exact, window 2 ans (annualise composé),
 * window 30 jours (annualise null), prix manquant a la borne (fallback
 * tolerance ±5j), prix absent hors tolerance (return null).
 */

import { describe, it, expect } from 'vitest'
import {
  computeBenchmarkReturn,
  comparePortfolioToBenchmarks,
  type PricePoint,
  type BenchmarkMeta,
} from '../benchmark-comparison'

const META: BenchmarkMeta = {
  benchmarkId:    'be-1',
  benchmarkLabel: 'MSCI World',
  ticker:         'EUNL.DE',
}

// Serie : prix qui monte de 100 → 110 (=+10 %) entre 2 dates.
function series(points: Array<[string, number]>): PricePoint[] {
  return points.map(([date, price]) => ({ date, price }))
}

describe('computeBenchmarkReturn', () => {
  it('window 1 an exact : annualized = total return', () => {
    const prices = series([
      ['2025-06-15', 100],
      ['2026-06-15', 110],
    ])
    const r = computeBenchmarkReturn(META, prices, '2025-06-15', '2026-06-15')!
    expect(r).not.toBeNull()
    expect(r.totalReturn).toBeCloseTo(10, 6)
    // 365j → annualise == total
    expect(r.annualizedReturn).toBeCloseTo(10, 4)
  })

  it('window 2 ans : annualized < total return (composé)', () => {
    // +21 % sur 2 ans → annualise ≈ 10 % (sqrt(1.21) − 1)
    const prices = series([
      ['2024-06-15', 100],
      ['2026-06-15', 121],
    ])
    const r = computeBenchmarkReturn(META, prices, '2024-06-15', '2026-06-15')!
    expect(r.totalReturn).toBeCloseTo(21, 6)
    expect(r.annualizedReturn).not.toBeNull()
    expect(r.annualizedReturn!).toBeGreaterThan(9.5)
    expect(r.annualizedReturn!).toBeLessThan(10.5)
    expect(r.annualizedReturn!).toBeLessThan(r.totalReturn)  // composé < total
  })

  it('window 30 jours : totalReturn calculé, annualizedReturn null', () => {
    const prices = series([
      ['2026-05-15', 100],
      ['2026-06-14', 103],
    ])
    const r = computeBenchmarkReturn(META, prices, '2026-05-15', '2026-06-14')!
    expect(r.totalReturn).toBeCloseTo(3, 6)
    expect(r.annualizedReturn).toBeNull()  // < 365j
  })

  it('prix manquant pile à la borne → fallback au plus proche dans ±5j', () => {
    // Borne start = 2025-06-15 mais prix dispo au 2025-06-17 (J+2, dans tolérance)
    const prices = series([
      ['2025-06-17', 100],
      ['2026-06-13', 110],  // borne end 2026-06-15, prix J-2
    ])
    const r = computeBenchmarkReturn(META, prices, '2025-06-15', '2026-06-15')!
    expect(r).not.toBeNull()
    expect(r.totalReturn).toBeCloseTo(10, 6)
  })

  it('prix absent même dans la tolérance → null', () => {
    // Borne start 2025-06-15 mais prix le plus proche au 2025-06-25 (J+10 > 5)
    const prices = series([
      ['2025-06-25', 100],
      ['2026-06-15', 110],
    ])
    const r = computeBenchmarkReturn(META, prices, '2025-06-15', '2026-06-15')
    expect(r).toBeNull()
  })

  it('série vide → null', () => {
    expect(computeBenchmarkReturn(META, [], '2025-06-15', '2026-06-15')).toBeNull()
  })

  it('prix de départ ≤ 0 ignoré → null si pas d\'autre point valide', () => {
    const prices = series([
      ['2025-06-15', 0],
      ['2026-06-15', 110],
    ])
    const r = computeBenchmarkReturn(META, prices, '2025-06-15', '2026-06-15')
    expect(r).toBeNull()  // borne start sans prix valide
  })

  it('rendement négatif (marché baissier)', () => {
    const prices = series([
      ['2025-06-15', 120],
      ['2026-06-15', 90],
    ])
    const r = computeBenchmarkReturn(META, prices, '2025-06-15', '2026-06-15')!
    expect(r.totalReturn).toBeCloseTo(-25, 6)
    expect(r.annualizedReturn).toBeCloseTo(-25, 4)
  })
})

describe('comparePortfolioToBenchmarks', () => {
  it('assemble la structure portefeuille + benchmarks', () => {
    const bench = computeBenchmarkReturn(
      META,
      series([['2025-06-15', 100], ['2026-06-15', 110]]),
      '2025-06-15', '2026-06-15',
    )!
    const out = comparePortfolioToBenchmarks({
      portfolioTwr:           12.5,
      portfolioAnnualizedTwr: 12.5,
      windowDays:             365,
      benchmarks:             [bench],
    })
    expect(out.portfolioTwr).toBe(12.5)
    expect(out.portfolioAnnualizedTwr).toBe(12.5)
    expect(out.windowDays).toBe(365)
    expect(out.benchmarks).toHaveLength(1)
    expect(out.benchmarks[0]!.benchmarkLabel).toBe('MSCI World')
    // Le portefeuille (12,5 %) surperforme le MSCI World (10 %)
    expect(out.portfolioTwr).toBeGreaterThan(out.benchmarks[0]!.totalReturn)
  })

  it('liste vide de benchmarks → structure valide', () => {
    const out = comparePortfolioToBenchmarks({
      portfolioTwr: 5, portfolioAnnualizedTwr: null, windowDays: 60, benchmarks: [],
    })
    expect(out.benchmarks).toEqual([])
    expect(out.portfolioAnnualizedTwr).toBeNull()
  })
})
