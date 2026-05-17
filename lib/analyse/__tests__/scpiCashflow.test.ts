import { describe, it, expect } from 'vitest'
import { computeScpiCashflowMonthly, DEFAULT_SCPI_YIELD_PCT } from '../scpiCashflow'

describe('computeScpiCashflowMonthly', () => {
  it('1 SCPI a 60 000 € avec rendement 4 % → 200 €/mois', () => {
    const r = computeScpiCashflowMonthly([
      { market_value: 60_000, cost_basis: 60_000 },
    ])
    expect(r.monthly).toBe(200)
    expect(r.annual).toBe(2400)
    expect(r.positionCount).toBe(1)
  })

  it('aucune SCPI → 0', () => {
    const r = computeScpiCashflowMonthly([])
    expect(r.monthly).toBe(0)
    expect(r.positionCount).toBe(0)
  })

  it('market_value null → fallback cost_basis', () => {
    const r = computeScpiCashflowMonthly([
      { market_value: null, cost_basis: 30_000 },
    ])
    // 30 000 × 4 % / 12 = 100
    expect(r.monthly).toBe(100)
  })

  it('valeur <= 0 ignoree (pas de division)', () => {
    const r = computeScpiCashflowMonthly([
      { market_value: 0,    cost_basis: 0 },
      { market_value: null, cost_basis: null },
      { market_value: 60_000, cost_basis: 60_000 },
    ])
    expect(r.positionCount).toBe(1)
    expect(r.monthly).toBe(200)
  })

  it('rendement custom (yield_pct override)', () => {
    const r = computeScpiCashflowMonthly([
      { market_value: 60_000, cost_basis: 60_000, yield_pct: 6 },
    ])
    // 60 000 × 6 % / 12 = 300
    expect(r.monthly).toBe(300)
  })

  it('rendement defaut documente comme 4 %', () => {
    expect(DEFAULT_SCPI_YIELD_PCT).toBe(4.0)
  })
})
