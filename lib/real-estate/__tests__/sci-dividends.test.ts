import { describe, it, expect } from 'vitest'
import { computeDividendDistribution } from '../fiscal/sci-is'

describe('computeDividendDistribution — CGI art. 200 A', () => {
  it('TMI 11 % : barème plus avantageux que PFU', () => {
    // PFU = 30 %, barème = 11×0.6 + 17.2 = 6.6 + 17.2 = 23.8 %
    const r = computeDividendDistribution({
      netProfitAfterIS: 4_200,
      dividendAmount:   4_200,
      ccaAmount:        0,
      tmiPct:           11,
    })
    expect(r.optimalOption).toBe('bareme')
    expect(r.pfuTax).toBeCloseTo(1_260, 2)        // 4200 × 0,30
    expect(r.netAfterPfu).toBeCloseTo(2_940, 2)
    // Barème = 4200×0,6×0,11 + 4200×0,172 = 277,2 + 722,4 = 999,6
    expect(r.baremeTax).toBeCloseTo(999.6, 1)
    expect(r.netAfterBareme).toBeCloseTo(3_200.4, 1)
  })

  it('TMI 30 % : seuil quasi à égalité (barème encore légèrement meilleur)', () => {
    // Barème = 30×0,6 + 17,2 = 18 + 17,2 = 35,2 % > 30 % PFU
    // Donc PFU optimal à TMI 30 %
    const r = computeDividendDistribution({
      netProfitAfterIS: 5_000, dividendAmount: 5_000, ccaAmount: 0, tmiPct: 30,
    })
    expect(r.optimalOption).toBe('pfu')
    expect(r.netAfterPfu).toBeGreaterThan(r.netAfterBareme)
  })

  it('TMI 41 % : PFU systématiquement plus avantageux', () => {
    // Barème = 41×0,6 + 17,2 = 24,6 + 17,2 = 41,8 % >> 30 % PFU
    const r = computeDividendDistribution({
      netProfitAfterIS: 10_000, dividendAmount: 10_000, ccaAmount: 0, tmiPct: 41,
    })
    expect(r.optimalOption).toBe('pfu')
    expect(r.netAfterPfu).toBeCloseTo(7_000, 2)   // 10000 × 0,70
    expect(r.baremeTax).toBeCloseTo(4_180, 1)
  })

  it('CCA partiellement disponible : capping correct', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS: 4_200, dividendAmount: 0, ccaAmount: 10_000, tmiPct: 30,
    })
    expect(r.ccaReimbursement).toBe(4_200)         // limité au profit
    expect(r.ccaCapped).toBe(true)
    expect(r.ccaAvailable).toBe(10_000)
  })

  it('CCA inférieur au profit : tout est remboursable', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS: 10_000, dividendAmount: 0, ccaAmount: 3_000, tmiPct: 30,
    })
    expect(r.ccaReimbursement).toBe(3_000)
    expect(r.ccaCapped).toBe(false)
  })

  it('dividende négatif → ramené à 0', () => {
    const r = computeDividendDistribution({
      netProfitAfterIS: 5_000, dividendAmount: -100, ccaAmount: 0, tmiPct: 30,
    })
    expect(r.dividendAmount).toBe(0)
    expect(r.pfuTax).toBe(0)
    expect(r.netAfterPfu).toBe(0)
  })
})
