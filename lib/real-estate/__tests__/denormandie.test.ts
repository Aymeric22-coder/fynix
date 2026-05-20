import { describe, it, expect } from 'vitest'
import {
  computeDenormandie,
  DENORMANDIE_WORKS_MIN_RATIO,
} from '../fiscal/incentives/denormandie'

describe('computeDenormandie — CGI art. 199 novovicies (Denormandie)', () => {
  it('Travaux 27 % du total : éligible avec taux Pinel+', () => {
    const r = computeDenormandie({
      duration:      9,
      zone:          'A',
      purchasePrice: 150_000,
      worksAmount:   55_000,        // 55 / 205 = 26,8 % > 25 %
      surfaceM2:     50,
      startYear:     2024,
      annualRentHC:  6_000,
      tmiPct:        30,
    })
    expect(r.worksRatio).toBeCloseTo(55_000 / 205_000, 4)
    expect(r.worksEligible).toBe(true)
    expect(r.worksGapEur).toBe(0)
    expect(r.eligible).toBe(true)
    // Taux Pinel+ 9 ans = 18 % sur (150k + 55k = 205k, plafond OK)
    expect(r.taxReductionTotal).toBeCloseTo(205_000 * 0.18, 1)
  })

  it('Travaux 21 % du total : non éligible avec écart calculé', () => {
    const r = computeDenormandie({
      duration:      9,
      zone:          'A',
      purchasePrice: 150_000,
      worksAmount:   40_000,        // 40 / 190 = 21,1 % < 25 %
      surfaceM2:     50,
      startYear:     2024,
      annualRentHC:  6_000,
      tmiPct:        30,
    })
    expect(r.worksEligible).toBe(false)
    // Travaux requis = 25 % × 190 000 = 47 500 → manque 7 500
    expect(r.worksGapEur).toBeCloseTo(7_500, 0)
    expect(r.eligible).toBe(false)
    expect(r.ineligibilityReasons[0]).toContain('25 %')
  })

  it('Plafond 300 000 € appliqué sur prix + travaux', () => {
    const r = computeDenormandie({
      duration:      12,
      zone:          'A_bis',
      purchasePrice: 280_000,
      worksAmount:   80_000,        // total 360k → cap 300k
      surfaceM2:     60,
      startYear:     2024,
      annualRentHC:  10_000,
      tmiPct:        30,
    })
    expect(r.effectiveBase).toBe(300_000)
    // 12 ans Pinel+ = 21 %
    expect(r.taxReductionTotal).toBeCloseTo(300_000 * 0.21, 1)
  })

  it('expose la constante 25 %', () => {
    expect(DENORMANDIE_WORKS_MIN_RATIO).toBe(0.25)
  })

  it('Zone B2 : reste inéligible même si travaux conformes (Denormandie suit Pinel)', () => {
    const r = computeDenormandie({
      duration:      9,
      zone:          'B2',
      purchasePrice: 100_000,
      worksAmount:   40_000,        // 28,6 % OK
      surfaceM2:     50,
      startYear:     2024,
      annualRentHC:  5_000,
      tmiPct:        30,
    })
    expect(r.worksEligible).toBe(true)
    expect(r.eligible).toBe(false)
    // Doit contenir l'erreur de zone
    expect(r.ineligibilityReasons.some(reason => reason.includes('B2'))).toBe(true)
  })
})
