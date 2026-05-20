import { describe, it, expect } from 'vitest'
import {
  computePinel,
  pinelRentCoefficient,
  PINEL_RATE_CLASSIC,
  PINEL_RATE_PLUS,
  GLOBAL_TAX_NICHE_CAP,
} from '../fiscal/incentives/pinel'

describe('computePinel — CGI art. 199 novovicies', () => {
  it('Pinel classique 9 ans / zone A : réduction = prix × 12 %', () => {
    const r = computePinel({
      isPinelPlus:   false,
      duration:      9,
      zone:          'A',
      purchasePrice: 250_000,
      surfaceM2:     50,
      startYear:     2024,
      annualRentHC:  6_000,    // 500 €/mois — sous le plafond
      tmiPct:        30,
    })
    // Base = min(250 000, 50 × 5500 = 275 000) = 250 000
    expect(r.effectiveBase).toBe(250_000)
    expect(r.taxReductionTotal).toBeCloseTo(30_000, 2)     // 12 %
    expect(r.taxReductionPerYear).toBeCloseTo(30_000 / 9, 2)
    expect(r.eligible).toBe(true)
  })

  it('Pinel+ 12 ans : taux 21 %', () => {
    const r = computePinel({
      isPinelPlus:   true,
      duration:      12,
      zone:          'A_bis',
      purchasePrice: 280_000,
      surfaceM2:     60,
      startYear:     2024,
      annualRentHC:  10_000,
      tmiPct:        30,
    })
    // Base = min(280 000, 60×5500=330 000, 300 000) = 280 000
    expect(r.effectiveBase).toBe(280_000)
    expect(r.taxReductionTotal).toBeCloseTo(280_000 * 0.21, 2)
  })

  it('Double plafonnement : prix > 300 000 ET surface limitante', () => {
    const r = computePinel({
      isPinelPlus:   true,
      duration:      12,
      zone:          'A_bis',
      purchasePrice: 320_000,
      surfaceM2:     50,        // 50 × 5500 = 275 000 < 300 000
      startYear:     2024,
      annualRentHC:  10_000,
      tmiPct:        30,
    })
    // Base = min(320k → cap 300k, 275k) = 275 000
    expect(r.effectiveBase).toBe(275_000)
  })

  it('Zone B2 : ineligible avec raison claire', () => {
    const r = computePinel({
      isPinelPlus:   false,
      duration:      9,
      zone:          'B2',
      purchasePrice: 200_000,
      surfaceM2:     50,
      startYear:     2024,
      annualRentHC:  6_000,
      tmiPct:        30,
    })
    expect(r.eligible).toBe(false)
    expect(r.ineligibilityReasons[0]).toContain('B2')
  })

  it('Loyer trop élevé : non conforme avec écart calculé', () => {
    const r = computePinel({
      isPinelPlus:   false,
      duration:      6,
      zone:          'A',
      purchasePrice: 250_000,
      surfaceM2:     50,
      startYear:     2024,
      annualRentHC:  20_000,    // ~1 666 €/mois — au-dessus du plafond
      tmiPct:        30,
    })
    expect(r.rentIsCompliant).toBe(false)
    expect(r.rentGapMonthlyEur).toBeGreaterThan(0)
    expect(r.eligible).toBe(false)
  })

  it('Plafond niches fiscales : signal si réduction annuelle > 10 000 €', () => {
    // Pinel+ 6 ans sur prix 300 000 → 300 000 × 12 % = 36 000 € / 6 ans = 6 000 €/an : OK
    // Mais pour dépasser 10k/an, il faudrait... impossible avec Pinel seul.
    // Le warning sert quand on cumule plusieurs Pinel.
    const r = computePinel({
      isPinelPlus:   true,
      duration:      6,
      zone:          'A',
      purchasePrice: 300_000,
      surfaceM2:     60,
      startYear:     2024,
      annualRentHC:  9_000,
      tmiPct:        30,
    })
    // 300 000 × 12 % / 6 = 6 000 €/an < 10 000 → pas de warning
    expect(r.warningNichesCap).toBe(false)
    expect(r.yearByYear[0]!.reductionIR).toBeLessThanOrEqual(GLOBAL_TAX_NICHE_CAP)
  })

  it('Coefficient de pondération du loyer : formule réglementaire', () => {
    // surface = 50 m² → 0,7 + 19/50 = 1,08 (plafonné à 1,2 si très petit)
    expect(pinelRentCoefficient(50)).toBeCloseTo(1.08, 2)
    // surface très grande → 0,7 + 19/200 = 0,795
    expect(pinelRentCoefficient(200)).toBeCloseTo(0.795, 3)
    // surface très petite → plafonné à 1,2
    expect(pinelRentCoefficient(15)).toBe(1.2)
  })

  it('expose les taux Pinel classique vs Pinel+', () => {
    expect(PINEL_RATE_CLASSIC[6]).toBe(0.09)
    expect(PINEL_RATE_CLASSIC[12]).toBe(0.14)
    expect(PINEL_RATE_PLUS[12]).toBe(0.21)
  })
})
