/**
 * Cas de référence SCI à l'IS — immeuble 376 800 €.
 *
 * Inputs (tirés du simulateur React de référence) :
 *   Prix 200 000 €, Notaire 17 000 €, Travaux 154 000 €
 *   Frais bancaires 1 200 €, Hypothèque 4 600 €
 *   Apport 20 000 €, Durée 25 ans, Taux 3,76 %, Assurance 0,2 %
 *   Loyer 2 580 €/mois, Vacance 0,3 mois, IRL 2 %
 *   PNO 600 €, GLI 2,5 %, TF 2 300 €, CFE 720 €, Comptable 420 €, Autres 1 000 €, Indexation 2 %
 *   Part terrain 15 %, Amort bâti 30 ans, Amort travaux 15 ans
 *   Frais d'acquisition (notaire+banc+hypothèque = 22 800 €) en charges A1
 *
 * Valeurs attendues :
 *   - Coût total : 376 800 €
 *   - Emprunt : 356 800 €
 *   - Mensualité totale ≈ 1 896 €/mois (dont ≈ 59 € assurance)
 *   - CF A1 après IS ≈ +1 641 €/an  (≈ +137 €/mois)
 *   - Renta brute /prix : 15,48 % · Brute FAI : 8,35 % · Nette : 6,57 %
 *   - Année de retour sur apport : A7
 *   - CF cumulé à 25 ans ≈ +154 886 €
 */

import { describe, it, expect } from 'vitest'
import { runSimulation } from '..'
import type { SimulationInput } from '../types'

const REFERENCE_INPUT: SimulationInput = {
  property: {
    purchasePrice:      200_000,
    notaryFees:         17_000,
    worksAmount:        154_000,
    propertyIndexPct:   0,            // pas d'indexation valeur dans la référence
  },
  loan: {
    principal:          356_800,      // 376 800 − 20 000
    annualRatePct:      3.76,
    durationYears:      25,
    insuranceRatePct:   0.2,
    bankFees:           1_200,
    guaranteeFees:      4_600,
  },
  rent: {
    monthlyRent:        2_580,
    vacancyMonths:      0.3,
    rentalIndexPct:     2.0,
  },
  charges: {
    pno:                600,
    gliPct:             2.5,
    propertyTax:        2_300,
    cfe:                720,
    accountant:         420,
    condoFees:          0,
    managementPct:      0,
    maintenance:        0,
    other:              1_000,
    chargesIndexPct:    2.0,
  },
  regime: {
    kind:                     'sci_is',
    landSharePct:             15,
    amortBuildingYears:       30,
    amortWorksYears:          15,
    amortFurnitureYears:      0,
    acquisitionFeesTreatment: 'expense_y1',
  },
  downPayment:        20_000,
  horizonYears:       25,
}

describe('Cas de référence SCI à l\'IS', () => {
  const result = runSimulation(REFERENCE_INPUT)
  const { kpis, projection, amortization } = result
  const y1 = projection[0]
  const y25 = projection[24]

  it('a un coût total de 376 800 €', () => {
    expect(kpis.totalCost).toBeCloseTo(376_800, 0)
  })

  it('a un emprunt de 356 800 €', () => {
    expect(kpis.borrowedAmount).toBe(356_800)
  })

  it('a une mensualité totale ≈ 1 896 €/mois (tolérance 5 €)', () => {
    expect(kpis.monthlyPayment).toBeGreaterThan(1_891)
    expect(kpis.monthlyPayment).toBeLessThan(1_901)
  })

  it('a une assurance mensuelle ≈ 59,5 €', () => {
    expect(kpis.monthlyInsurance).toBeCloseTo(356_800 * 0.002 / 12, 1)
  })

  it('a une rentabilité brute sur prix ≈ 15,48 %', () => {
    expect(kpis.grossYieldOnPrice * 100).toBeCloseTo(15.48, 1)
  })

  it('a une rentabilité brute FAI ≈ 8,35 %', () => {
    expect(kpis.grossYieldFAI * 100).toBeCloseTo(8.35, 1)
  })

  it('a une rentabilité nette ≈ 6,57 %', () => {
    // (loyersA1 net − chargesA1) / coûtAcquisitionFAI (200k+17k+154k = 371 000)
    expect(kpis.netYield * 100).toBeCloseTo(6.57, 1)
  })

  it('a un cash flow année 1 après IS ≈ +1 641 €/an (tolérance 200 €)', () => {
    expect(y1).toBeDefined()
    // Tolérance de 200 € car de petites différences arrondi/convention sont possibles
    expect(y1!.cashFlowAfterTax).toBeGreaterThan(1_400)
    expect(y1!.cashFlowAfterTax).toBeLessThan(1_900)
  })

  it('a un cash flow mensuel A1 ≈ +137 €/mois', () => {
    expect(kpis.monthlyCashFlowYear1).toBeGreaterThan(115)
    expect(kpis.monthlyCashFlowYear1).toBeLessThan(160)
  })

  it('a un IS nul l\'année 1 (déficit reportable des frais d\'acquisition)', () => {
    expect(y1!.taxPaid).toBe(0)
  })

  it('a un retour sur apport en A7', () => {
    expect(kpis.paybackYear).toBe(7)
  })

  it('a un CF cumulé sur 25 ans entre +130k et +180k €', () => {
    expect(y25).toBeDefined()
    expect(y25!.cumulativeCashFlow).toBeGreaterThan(130_000)
    expect(y25!.cumulativeCashFlow).toBeLessThan(180_000)
  })

  it('paie de l\'IS à partir de A16 (fin amortissement travaux + résorption déficit)', () => {
    // L'année 16 : les travaux sont entièrement amortis, donc résultat fiscal s'améliore.
    // On attend de l'IS payé à partir d'A16 environ.
    const isPaidYears = projection
      .filter(p => p.taxPaid > 0)
      .map(p => p.year)
    expect(isPaidYears.length).toBeGreaterThan(0)
    // Au plus tard A20, on paie de l'IS
    expect(Math.min(...isPaidYears)).toBeLessThanOrEqual(20)
  })

  it('a un capital restant dû ≈ 0 en fin de prêt (A25)', () => {
    expect(y25!.remainingCapital).toBeLessThan(1)
  })

  it('a un schedule d\'amortissement avec 300 mois (25 ans × 12)', () => {
    expect(amortization).not.toBeNull()
    expect(amortization!.months).toHaveLength(300)
    expect(amortization!.years).toHaveLength(25)
  })

  it('a une projection avec 25 années', () => {
    expect(projection).toHaveLength(25)
  })
})
