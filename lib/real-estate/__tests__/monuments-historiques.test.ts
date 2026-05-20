import { describe, it, expect } from 'vitest'
import { computeMH } from '../fiscal/incentives/monuments-historiques'

const FUTURE_YEAR = new Date().getFullYear() + 10
const PAST_YEAR   = new Date().getFullYear() - 5

describe('computeMH — CGI art. 156 I-3°', () => {
  it('Classé MH, travaux 200 000 €, TMI 41 % : économie 82 000 €', () => {
    const r = computeMH({
      classification:      'classe',
      occupancy:           'owner_occupied',
      worksAmount:         200_000,
      annualCharges:       0,
      annualRentHC:        0,
      acquisitionYear:     2020,
      conservationEndYear: FUTURE_YEAR,
      tmiPct:              41,
    })
    expect(r.eligible).toBe(true)
    expect(r.deductibleWorks).toBe(200_000)
    expect(r.taxSavingWorks).toBeCloseTo(82_000, 1)
    expect(r.effectiveRate).toBeCloseTo(0.41, 2)
  })

  it('TMI 45 % avec travaux 150 000 € : économie 67 500 €', () => {
    const r = computeMH({
      classification:      'inscrit',
      occupancy:           'owner_occupied',
      worksAmount:         150_000,
      annualCharges:       0,
      annualRentHC:        0,
      acquisitionYear:     2022,
      conservationEndYear: FUTURE_YEAR,
      tmiPct:              45,
    })
    expect(r.totalTaxSaving).toBeCloseTo(67_500, 1)
  })

  it('Bailleur : charges courantes aussi déductibles', () => {
    const r = computeMH({
      classification:      'classe',
      occupancy:           'rented',
      worksAmount:         100_000,
      annualCharges:       8_000,
      annualRentHC:        15_000,
      acquisitionYear:     2022,
      conservationEndYear: FUTURE_YEAR,
      tmiPct:              30,
    })
    expect(r.deductibleCharges).toBe(8_000)
    expect(r.taxSavingCharges).toBeCloseTo(2_400, 1)        // 8000 × 30 %
    expect(r.totalTaxSaving).toBeCloseTo(30_000 + 2_400, 1) // 100k × 30 % + 2400
  })

  it('Occupant pur : charges non prises en compte', () => {
    const r = computeMH({
      classification:      'inscrit',
      occupancy:           'owner_occupied',
      worksAmount:         50_000,
      annualCharges:       5_000,
      annualRentHC:        0,
      acquisitionYear:     2022,
      conservationEndYear: FUTURE_YEAR,
      tmiPct:              30,
    })
    expect(r.deductibleCharges).toBe(0)
    expect(r.totalTaxSaving).toBeCloseTo(50_000 * 0.30, 1)
  })

  it('Période de conservation expirée → ineligible', () => {
    const r = computeMH({
      classification:      'classe',
      occupancy:           'owner_occupied',
      worksAmount:         100_000,
      annualCharges:       0,
      annualRentHC:        0,
      acquisitionYear:     2005,
      conservationEndYear: PAST_YEAR,
      tmiPct:              30,
    })
    expect(r.eligible).toBe(false)
    expect(r.ineligibilityReasons[0]).toContain('expir')
  })

  it('notSubjectToNichesCap est toujours true (MH hors plafond)', () => {
    const r = computeMH({
      classification:      'classe',
      occupancy:           'owner_occupied',
      worksAmount:         500_000,
      annualCharges:       0,
      annualRentHC:        0,
      acquisitionYear:     2024,
      conservationEndYear: FUTURE_YEAR,
      tmiPct:              45,
    })
    expect(r.notSubjectToNichesCap).toBe(true)
    // Même avec 500k × 45 % = 225 000 €, pas de cap appliqué
    expect(r.totalTaxSaving).toBeCloseTo(225_000, 0)
  })

  it('warning15Years déclenché si conservation < 3 ans restants', () => {
    const r = computeMH({
      classification:      'classe',
      occupancy:           'owner_occupied',
      worksAmount:         50_000,
      annualCharges:       0,
      annualRentHC:        0,
      acquisitionYear:     2008,
      conservationEndYear: new Date().getFullYear() + 2,
      tmiPct:              30,
    })
    expect(r.warning15Years).toBe(true)
  })
})
