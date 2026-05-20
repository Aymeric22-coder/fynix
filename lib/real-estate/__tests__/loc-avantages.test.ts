import { describe, it, expect } from 'vitest'
import {
  computeLocAvantages,
  LOC_AVANTAGES_RATES,
  LOC_AVANTAGES_RENT_DISCOUNT,
} from '../fiscal/incentives/loc-avantages'

const SIX_YEARS_LATER = (start: Date) => {
  const d = new Date(start)
  d.setFullYear(d.getFullYear() + 6)
  return d
}

describe('computeLocAvantages — CGI art. 199 tricies', () => {
  it('Loc2, décote 27 % < 30 % : non conforme avec écart €/an', () => {
    const start = new Date('2024-01-01')
    const r = computeLocAvantages({
      convention:          'loc2',
      annualRentHC:        9_600,           // 800 €/mois × 12
      marketRentAnnual:    13_200,          // 1 100 €/mois × 12
      conventionStartDate: start,
      conventionEndDate:   SIX_YEARS_LATER(start),
      tmiPct:              30,
    })
    expect(r.rentDiscountActual).toBeCloseTo(0.2727, 3)
    expect(r.rentIsCompliant).toBe(false)
    expect(r.eligible).toBe(false)
    // Loyer cible loc2 = 70 % × 13200 = 9240 — baisse nécessaire 360 €/an
    expect(r.rentReductionNeededEur).toBeCloseTo(360, 0)
  })

  it('Loc2, décote 30 % : conforme, réduction 35 % des loyers', () => {
    const start = new Date('2024-01-01')
    const r = computeLocAvantages({
      convention:          'loc2',
      annualRentHC:        9_240,           // exactement 70 % marché
      marketRentAnnual:    13_200,
      conventionStartDate: start,
      conventionEndDate:   SIX_YEARS_LATER(start),
      tmiPct:              30,
    })
    expect(r.rentIsCompliant).toBe(true)
    expect(r.annualTaxReduction).toBeCloseTo(9_240 * 0.35, 1)
    expect(r.totalTaxReduction).toBeCloseTo(9_240 * 0.35 * 6, 1)
    expect(r.eligible).toBe(true)
  })

  it('Loc3 sur 6 ans : totalTaxReduction = annualTaxReduction × 6', () => {
    const start = new Date('2024-01-01')
    const r = computeLocAvantages({
      convention:          'loc3',
      annualRentHC:        6_600,           // 55 % marché
      marketRentAnnual:    12_000,
      conventionStartDate: start,
      conventionEndDate:   SIX_YEARS_LATER(start),
      tmiPct:              30,
    })
    expect(r.rentIsCompliant).toBe(true)
    expect(r.annualTaxReduction).toBeCloseTo(6_600 * 0.65, 1)
    expect(r.totalTaxReduction).toBeCloseTo(6_600 * 0.65 * 6, 1)
  })

  it('Durée convention < 6 ans : inéligible', () => {
    const start = new Date('2024-01-01')
    const end   = new Date('2027-01-01')
    const r = computeLocAvantages({
      convention:          'loc1',
      annualRentHC:        10_000,
      marketRentAnnual:    12_000,          // 17 % décote OK pour loc1
      conventionStartDate: start,
      conventionEndDate:   end,
      tmiPct:              30,
    })
    expect(r.eligible).toBe(false)
    expect(r.ineligibilityReasons.some(reason => reason.includes('6 ans'))).toBe(true)
  })

  it('Loc1, décote 17 % et 6 ans : netGainVsFreeLetting positif si réduction > manque', () => {
    const start = new Date('2024-01-01')
    const r = computeLocAvantages({
      convention:          'loc1',
      annualRentHC:        10_000,
      marketRentAnnual:    12_000,          // décote 16,67 %
      conventionStartDate: start,
      conventionEndDate:   SIX_YEARS_LATER(start),
      tmiPct:              30,
    })
    // réduction = 10000 × 15 % = 1500, manque = 2000 → net = -500
    expect(r.annualTaxReduction).toBeCloseTo(1_500, 1)
    expect(r.netGainVsFreeLetting).toBeCloseTo(-500, 1)
  })

  it('expose les taux et décotes par convention', () => {
    expect(LOC_AVANTAGES_RATES.loc1).toBe(0.15)
    expect(LOC_AVANTAGES_RATES.loc3).toBe(0.65)
    expect(LOC_AVANTAGES_RENT_DISCOUNT.loc2).toBe(0.30)
  })
})
