import { describe, it, expect } from 'vitest'
import {
  computePinel,
  pinelRentCoefficient,
  PINEL_RATE_CLASSIC,
  PINEL_RATE_PLUS,
  GLOBAL_TAX_NICHE_CAP,
} from '../fiscal/incentives/pinel'
import { runSimulation } from '..'
import type { SimulationInput } from '../types'

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

// ─────────────────────────────────────────────────────────────────────
//  Propagation Pinel/Denormandie dans la projection (hotfix Sprint 3)
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit un SimulationInput dont l'IR foncier_micro est ajustable
 * pour tester le plafonnement de la réduction Pinel.
 *
 * foncier_micro : taxPaid = netRent × 0,7 × (TMI + 17,2) / 100
 * Avec TMI 30 → coefficient effectif = 0,7 × 0,472 ≈ 0,3304
 *   → pour viser un IR cible, on calibre monthlyRent.
 */
function makeBaseInput(monthlyRent: number, tmiPct = 30): SimulationInput {
  return {
    property: {
      purchasePrice:    200_000, notaryFees: 0, worksAmount: 0,
      propertyIndexPct: 0,
    },
    rent: { monthlyRent, vacancyMonths: 0, rentalIndexPct: 0 },
    charges: {
      pno: 0, gliPct: 0, propertyTax: 0, cfe: 0, accountant: 0,
      condoFees: 0, managementPct: 0, maintenance: 0, other: 0,
      chargesIndexPct: 0,
    },
    regime: { kind: 'foncier_micro', tmiPct },
    downPayment: 0,
    horizonYears: 1,
  }
}

describe('Propagation Pinel dans la projection (taxPaid + taxReductionApplied)', () => {
  it('réduction > IR : taxPaid borné à 0, taxReductionApplied = IR brut (excédent perdu)', () => {
    // Calibre l'input pour IR Y1 ≈ 3 200 €
    // foncier_micro coef = 0,7 × 0,472 = 0,3304 → netRent annuel = 3 200 / 0,3304 = 9 686 €
    // monthlyRent ≈ 807 €
    const inputNoIncentive = makeBaseInput(807)
    const noIncentive = runSimulation(inputNoIncentive)
    const baseIR = noIncentive.projection[0]!.taxPaid
    expect(baseIR).toBeCloseTo(3_200, -1)  // ordre de grandeur

    // Maintenant on applique une réduction Pinel+ supérieure à l'IR
    const withIncentive = runSimulation({
      ...inputNoIncentive,
      incentiveReductionPerYear: [4_760],   // Pinel+ 12 ans typique
    })
    const y1 = withIncentive.projection[0]!
    expect(y1.taxPaid).toBe(0)                          // borné à 0
    expect(y1.taxReductionApplied).toBeCloseTo(baseIR, 5) // plafonnée à l'IR
    // Cash flow remonte d'autant
    expect(y1.cashFlowAfterTax).toBeCloseTo(noIncentive.projection[0]!.cashFlowAfterTax + baseIR, 5)
  })

  it('réduction < IR : taxPaid = IR − réduction, taxReductionApplied = réduction exacte', () => {
    // Calibre pour IR ≈ 8 000 € → netRent annuel ≈ 24 213 € → monthlyRent ≈ 2 018 €
    const inputNoIncentive = makeBaseInput(2_018)
    const noIncentive = runSimulation(inputNoIncentive)
    const baseIR = noIncentive.projection[0]!.taxPaid
    expect(baseIR).toBeCloseTo(8_000, -1)

    const withIncentive = runSimulation({
      ...inputNoIncentive,
      incentiveReductionPerYear: [3_333],   // Pinel classique 9 ans typique
    })
    const y1 = withIncentive.projection[0]!
    expect(y1.taxReductionApplied).toBeCloseTo(3_333, 5)
    expect(y1.taxPaid).toBeCloseTo(baseIR - 3_333, 5)
    expect(y1.taxPaid).toBeGreaterThan(0)
  })

  it('pas de incentiveReductionPerYear : comportement identique à avant le hotfix', () => {
    const noIncentive = runSimulation(makeBaseInput(900))
    expect(noIncentive.projection[0]!.taxReductionApplied).toBe(0)
  })
})
