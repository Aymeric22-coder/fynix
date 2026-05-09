/**
 * Tests : compareActualToSimulation
 *  - écarts loyers/charges/cashflow correctement calculés
 *  - status 'no_data' / 'partial' / 'tracked'
 *  - alignement année calendaire ↔ index projection
 *  - valuation null gérée
 *  - classifyVariance income vs expense
 */

import { describe, it, expect } from 'vitest'
import { compareActualToSimulation, classifyVariance } from '../compare'
import type { SimulationResult, ProjectionYear } from '../types'
import type { ActualDataResult, ActualYearData } from '../actual'

// ─── Helpers ──────────────────────────────────────────────────────────

function makeProjection(years: Partial<ProjectionYear>[]): ProjectionYear[] {
  return years.map((y, i) => ({
    year:               i + 1,
    grossRent:          0,
    vacancy:            0,
    netRent:            0,
    charges:            0,
    interest:           0,
    principalRepaid:    0,
    insurance:          0,
    loanPayment:        0,
    amortizations:      0,
    fiscalResult:       0,
    taxableBase:        0,
    taxPaid:            0,
    cashFlowBeforeTax:  0,
    cashFlowAfterTax:   0,
    cumulativeCashFlow: 0,
    remainingCapital:   0,
    estimatedValue:     0,
    netPropertyValue:   0,
    ...y,
  }))
}

function makeSimulation(projection: ProjectionYear[]): SimulationResult {
  return {
    amortization: null,
    projection,
    kpis: {
      totalCost:               0,
      borrowedAmount:          0,
      downPayment:             0,
      monthlyPayment:          0,
      monthlyInsurance:        0,
      grossYieldOnPrice:       0,
      grossYieldFAI:           0,
      netYield:                0,
      netNetYield:             0,
      monthlyCashFlowYear1:    0,
      annualCashFlowYear1:     0,
      currentNetPropertyValue: 0,
      leverageRatio:           0,
      paybackYear:             null,
    },
  }
}

function makeActualYear(year: number, p: Partial<ActualYearData> = {}): ActualYearData {
  return {
    year,
    rentReceived:         0,
    rentTransactionCount: 0,
    chargesPaid: { taxeFonciere: 0, insurance: 0, accountant: 0, cfe: 0, condoFees: 0, maintenance: 0, other: 0, total: 0 },
    chargesRecorded:      false,
    loanPaid:             0,
    loanPaymentCount:     0,
    taxPaid:              0,
    feesPaid:             0,
    valuationAtYearEnd:   null,
    cashFlowReal:         0,
    ...p,
  }
}

function makeActual(years: ActualYearData[]): ActualDataResult {
  return {
    years,
    firstYear: years[0]?.year ?? null,
    lastYear:  years[years.length - 1]?.year ?? null,
    isEmpty:   years.length === 0,
  }
}

// ─── Tests : compareActualToSimulation ──────────────────────────────

describe('compareActualToSimulation — status & elapsedYears', () => {

  it('renvoie no_data si aucune donnée réelle', () => {
    const sim = makeSimulation(makeProjection([{ netRent: 12_000 }]))
    const actual = makeActual([])
    const r = compareActualToSimulation(sim, actual, 2024)
    expect(r.status).toBe('no_data')
    expect(r.trackedYears).toBe(0)
    expect(r.years).toHaveLength(0)   // pas de années écoulées en l'absence de réel
  })

  it('renvoie tracked si toutes les années écoulées sont remplies', () => {
    const sim = makeSimulation(makeProjection([
      { netRent: 12_000 }, { netRent: 12_240 }, { netRent: 12_485 },
    ]))
    const startYear = new Date().getUTCFullYear() - 2  // simulation a démarré il y a 2 ans
    const actual = makeActual([
      makeActualYear(startYear,     { rentReceived: 12_000 }),
      makeActualYear(startYear + 1, { rentReceived: 12_240 }),
      makeActualYear(startYear + 2, { rentReceived: 12_485 }),  // année courante
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.status).toBe('tracked')
    expect(r.elapsedYears).toBe(3)
    expect(r.trackedYears).toBe(3)
  })

  it('renvoie partial si seulement certaines années écoulées sont remplies', () => {
    const sim = makeSimulation(makeProjection([
      { netRent: 12_000 }, { netRent: 12_240 }, { netRent: 12_485 },
    ]))
    const startYear = new Date().getUTCFullYear() - 2
    const actual = makeActual([
      makeActualYear(startYear, { rentReceived: 12_000 }),
      // year+1 manquant
      // year+2 manquant
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.status).toBe('partial')
  })
})

describe('compareActualToSimulation — calculs de variance', () => {

  it('calcule la variance loyers correctement', () => {
    const sim = makeSimulation(makeProjection([{ netRent: 12_000 }]))
    const startYear = new Date().getUTCFullYear()
    const actual = makeActual([
      makeActualYear(startYear, { rentReceived: 12_500 }),  // +500 vs prévu
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.years[0]!.rent.simulated).toBe(12_000)
    expect(r.years[0]!.rent.actual).toBe(12_500)
    expect(r.years[0]!.rent.variance).toBe(500)
    expect(r.years[0]!.rent.variancePct).toBeCloseTo(4.166, 2)  // 500 / 12000 × 100
  })

  it('calcule la variance charges (négative = mieux)', () => {
    const sim = makeSimulation(makeProjection([{ charges: 3_000 }]))
    const startYear = new Date().getUTCFullYear()
    const actual = makeActual([
      makeActualYear(startYear, {
        chargesPaid: { taxeFonciere: 1_500, insurance: 350, accountant: 0, cfe: 0, condoFees: 600, maintenance: 200, other: 0, total: 2_650 },
      }),
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.years[0]!.charges.simulated).toBe(3_000)
    expect(r.years[0]!.charges.actual).toBe(2_650)
    expect(r.years[0]!.charges.variance).toBe(-350)
  })

  it('calcule la variance cash-flow avant impôts', () => {
    const sim = makeSimulation(makeProjection([
      { netRent: 12_000, charges: 3_000, loanPayment: 7_000, cashFlowBeforeTax: 2_000 },
    ]))
    const startYear = new Date().getUTCFullYear()
    const actual = makeActual([
      makeActualYear(startYear, {
        rentReceived: 11_500,  // 500 manquant
        chargesPaid: { taxeFonciere: 0, insurance: 0, accountant: 0, cfe: 0, condoFees: 0, maintenance: 0, other: 3_000, total: 3_000 },
        loanPaid:     7_000,
      }),
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    // CF réel avant impôts = 11500 - 3000 - 7000 = 1500
    expect(r.years[0]!.cashFlow.actual).toBe(1_500)
    expect(r.years[0]!.cashFlow.simulated).toBe(2_000)
    expect(r.years[0]!.cashFlow.variance).toBe(-500)
  })

  it('cumule les variances sur plusieurs années', () => {
    const sim = makeSimulation(makeProjection([
      { netRent: 12_000 }, { netRent: 12_240 },
    ]))
    const startYear = new Date().getUTCFullYear() - 1
    const actual = makeActual([
      makeActualYear(startYear,     { rentReceived: 12_500 }),  // +500
      makeActualYear(startYear + 1, { rentReceived: 12_000 }),  // -240
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.totals.rentVariance).toBe(500 - 240)
  })
})

describe('compareActualToSimulation — valorisation', () => {

  it('renvoie variance valuation si valuationAtYearEnd est défini', () => {
    const sim = makeSimulation(makeProjection([{ estimatedValue: 220_000 }]))
    const startYear = new Date().getUTCFullYear()
    const actual = makeActual([
      makeActualYear(startYear, { valuationAtYearEnd: 235_000 }),
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.years[0]!.valuation.simulated).toBe(220_000)
    expect(r.years[0]!.valuation.actual).toBe(235_000)
    expect(r.years[0]!.valuation.variance).toBe(15_000)
  })

  it('renvoie null pour valuation si pas de saisie', () => {
    const sim = makeSimulation(makeProjection([{ estimatedValue: 220_000 }]))
    const startYear = new Date().getUTCFullYear()
    const actual = makeActual([
      makeActualYear(startYear, { rentReceived: 12_000 }),  // pas de valuationAtYearEnd
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.years[0]!.valuation.actual).toBeNull()
    expect(r.years[0]!.valuation.variance).toBeNull()
  })
})

describe('compareActualToSimulation — alignement années', () => {

  it('aligne année calendaire avec index projection', () => {
    const sim = makeSimulation(makeProjection([
      { netRent: 1000 }, { netRent: 2000 }, { netRent: 3000 },
    ]))
    const startYear = 2024
    const actual = makeActual([
      makeActualYear(2025, { rentReceived: 2050 }),  // 2025 = année 2 de la simulation
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    const y2025 = r.years.find((y) => y.year === 2025)!
    expect(y2025.simYearIndex).toBe(2)
    expect(y2025.rent.simulated).toBe(2000)
    expect(y2025.rent.variance).toBe(50)
  })
})

describe('compareActualToSimulation — variancePct edge cases', () => {

  it('renvoie variancePct = null quand simulated = 0', () => {
    const sim = makeSimulation(makeProjection([{ netRent: 0 }]))
    const startYear = new Date().getUTCFullYear()
    const actual = makeActual([
      makeActualYear(startYear, { rentReceived: 500 }),
    ])
    const r = compareActualToSimulation(sim, actual, startYear)
    expect(r.years[0]!.rent.variancePct).toBeNull()
  })
})

// ─── Tests : classifyVariance ────────────────────────────────────────

describe('classifyVariance', () => {

  it('income — variance positive = positive', () => {
    expect(classifyVariance(500, 10_000, 'income')).toBe('positive')
  })

  it('income — variance négative significative = negative', () => {
    expect(classifyVariance(-2_000, 10_000, 'income')).toBe('negative')
  })

  it('expense — variance négative = positive (on a moins payé)', () => {
    expect(classifyVariance(-200, 1_000, 'expense')).toBe('positive')
  })

  it('expense — variance positive = negative (on a plus payé)', () => {
    expect(classifyVariance(200, 1_000, 'expense')).toBe('negative')
  })

  it('renvoie neutral si écart < threshold (5 % par défaut)', () => {
    expect(classifyVariance(50, 10_000, 'income')).toBe('neutral')   // 0.5 %
    expect(classifyVariance(-30, 1_000, 'expense')).toBe('neutral')  // 3 %
  })

  it('renvoie neutral pour simulated = 0 et actual = 0', () => {
    expect(classifyVariance(0, 0, 'income')).toBe('neutral')
  })
})
