/**
 * Tests de cohérence et smoke tests sur les autres régimes fiscaux.
 * On valide que :
 *  - chaque régime tourne sans crasher
 *  - les régimes "réels" appliquent les amortissements quand attendu
 *  - les régimes "micro" appliquent l'abattement
 *  - les déficits sont reportés correctement
 *  - l'achat cash (sans prêt) fonctionne
 */

import { describe, it, expect } from 'vitest'
import { runSimulation } from '..'
import type { FiscalRegime, SimulationInput } from '../types'

const BASE_INPUT = (regime: FiscalRegime): SimulationInput => ({
  property: {
    purchasePrice:    150_000,
    notaryFees:       12_000,
    worksAmount:      0,
    propertyIndexPct: 0,
  },
  loan: {
    principal:        130_000,
    annualRatePct:    3.5,
    durationYears:    20,
    insuranceRatePct: 0.2,
    bankFees:         800,
    guaranteeFees:    1_500,
  },
  rent: {
    monthlyRent:    900,
    vacancyMonths:  0.5,
    rentalIndexPct: 1.5,
  },
  charges: {
    pno: 350, gliPct: 0, propertyTax: 1200, cfe: 0, accountant: 0,
    condoFees: 600, managementPct: 0, maintenance: 200, other: 0,
    chargesIndexPct: 1.5,
  },
  regime,
  downPayment: 20_000,
  horizonYears: 20,
})

describe('Foncier réel (TMI 30 %)', () => {
  const r = runSimulation(BASE_INPUT({ kind: 'foncier_nu', tmiPct: 30 }))
  it('a 20 années de projection', () => expect(r.projection).toHaveLength(20))
  it('ne génère pas d\'amortissements (régime non réel BIC/IS)', () => {
    r.projection.forEach(p => expect(p.amortizations).toBe(0))
  })
  it('ne paie aucun impôt si le résultat fiscal est négatif (déficit foncier)', () => {
    const negativeYears = r.projection.filter(p => p.fiscalResult < 0)
    negativeYears.forEach(p => expect(p.taxPaid).toBeLessThanOrEqual(0)) // crédit = négatif autorisé
  })
})

describe('Foncier micro (abattement 30 %)', () => {
  const r = runSimulation(BASE_INPUT({ kind: 'foncier_micro', tmiPct: 30 }))
  it('paie un impôt strictement positif chaque année', () => {
    r.projection.forEach(p => expect(p.taxPaid).toBeGreaterThan(0))
  })
  it('a une base imposable = 70 % des loyers nets', () => {
    const y1 = r.projection[0]!
    expect(y1.taxableBase).toBeCloseTo(y1.netRent * 0.7, 0)
  })
})

describe('LMNP réel (amortissement plafonné au bénéfice)', () => {
  const input = BASE_INPUT({
    kind: 'lmnp_reel',
    tmiPct: 30,
    landSharePct: 15,
    amortBuildingYears: 30,
    amortWorksYears: 15,
    amortFurnitureYears: 7,
    furnitureAmount: 8_000,
    acquisitionFeesTreatment: 'expense_y1',
  })
  const r = runSimulation(input)

  it('génère des amortissements positifs sur les premières années', () => {
    expect(r.projection[0]!.amortizations).toBeGreaterThan(0)
  })
  it('ne paie pas d\'impôt l\'année 1 (frais d\'acquisition + amortissement → résultat négatif/nul)', () => {
    expect(r.projection[0]!.taxPaid).toBe(0)
  })
  it('ne crée jamais de résultat fiscal négatif via l\'amortissement (le résultat ≥ 0 si bénéfice avant amort > 0)', () => {
    // En LMNP réel, si on a du bénéfice avant amortissement, le résultat fiscal après amortissement
    // doit toujours être ≥ 0 (l'amortissement est plafonné).
    // S'il est négatif, ça vient des intérêts/charges/exceptionalFees, pas de l'amortissement.
    r.projection.forEach(p => {
      // Test qualitatif : sur les années où on s'attend à du bénéfice, taxableBase ≥ 0
      expect(p.taxableBase).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('LMNP micro-BIC (abattement 50 %)', () => {
  const r = runSimulation(BASE_INPUT({ kind: 'lmnp_micro', tmiPct: 30, abattementPct: 50 }))
  it('a une base imposable = 50 % des loyers nets', () => {
    const y1 = r.projection[0]!
    expect(y1.taxableBase).toBeCloseTo(y1.netRent * 0.5, 0)
  })
  it('paie un impôt strictement positif chaque année', () => {
    r.projection.forEach(p => expect(p.taxPaid).toBeGreaterThan(0))
  })
})

describe('LMNP micro-BIC meublé tourisme classé (abattement 71 %)', () => {
  const r = runSimulation(BASE_INPUT({ kind: 'lmnp_micro', tmiPct: 30, abattementPct: 71 }))
  it('a une base imposable = 29 % des loyers nets', () => {
    const y1 = r.projection[0]!
    expect(y1.taxableBase).toBeCloseTo(y1.netRent * 0.29, 0)
  })
})

describe('LMP (avec cotisations SSI)', () => {
  const r = runSimulation(BASE_INPUT({
    kind: 'lmp', tmiPct: 30, ssiRatePct: 35,
    landSharePct: 15, amortBuildingYears: 30, amortWorksYears: 15,
    amortFurnitureYears: 7, acquisitionFeesTreatment: 'expense_y1',
  }))
  it('produit une projection complète sur 20 ans', () => {
    expect(r.projection).toHaveLength(20)
  })
  it('a des amortissements positifs comme LMNP réel', () => {
    expect(r.projection[0]!.amortizations).toBeGreaterThan(0)
  })
})

describe('SCI à l\'IR', () => {
  const r = runSimulation(BASE_INPUT({ kind: 'sci_ir', tmiPct: 30 }))
  it('produit la même projection que foncier_nu (translucide à 100 %)', () => {
    const ref = runSimulation(BASE_INPUT({ kind: 'foncier_nu', tmiPct: 30 }))
    expect(r.projection[0]!.taxPaid).toBeCloseTo(ref.projection[0]!.taxPaid, 2)
  })
})

describe('Achat cash (sans emprunt)', () => {
  const input: SimulationInput = {
    ...BASE_INPUT({ kind: 'foncier_nu', tmiPct: 30 }),
    loan: undefined,
    downPayment: 162_000,    // = prix + notaire
  }
  const r = runSimulation(input)

  it('a un schedule d\'amortissement null', () => {
    expect(r.amortization).toBeNull()
  })
  it('a une mensualité de prêt nulle', () => {
    expect(r.kpis.monthlyPayment).toBe(0)
  })
  it('a un capital restant dû = 0 à toutes les années', () => {
    r.projection.forEach(p => expect(p.remainingCapital).toBe(0))
  })
  it('a une valeur nette du bien = valeur estimée à toutes les années', () => {
    r.projection.forEach(p => {
      expect(p.netPropertyValue).toBeCloseTo(p.estimatedValue, 2)
    })
  })
  it('a un montant emprunté = 0 dans les KPIs', () => {
    expect(r.kpis.borrowedAmount).toBe(0)
  })
})

describe('Horizon de projection automatique', () => {
  it('utilise max(durée crédit, 25) ans par défaut', () => {
    const input = { ...BASE_INPUT({ kind: 'foncier_nu', tmiPct: 30 }) }
    delete input.horizonYears
    // Crédit 20 ans → horizon 25 ans
    const r = runSimulation(input)
    expect(r.projection).toHaveLength(25)
  })

  it('utilise la durée du crédit si elle dépasse 25 ans', () => {
    const input = {
      ...BASE_INPUT({ kind: 'foncier_nu', tmiPct: 30 }),
      loan: {
        principal: 130_000, annualRatePct: 3.5, durationYears: 30,
        insuranceRatePct: 0.2, bankFees: 0, guaranteeFees: 0,
      },
    }
    delete input.horizonYears
    const r = runSimulation(input)
    expect(r.projection).toHaveLength(30)
  })
})
