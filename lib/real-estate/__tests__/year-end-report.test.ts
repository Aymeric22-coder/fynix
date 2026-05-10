/**
 * Tests : buildYearEndReport + reportToCsv
 */

import { describe, it, expect } from 'vitest'
import { buildYearEndReport, reportToCsv } from '../year-end-report'
import type { ProjectionYear, AmortizationSchedule } from '../types'
import type { ActualYearData } from '../actual'

function makeProj(p: Partial<ProjectionYear> = {}): ProjectionYear {
  return {
    year: 1, grossRent: 12_000, vacancy: 0, netRent: 12_000,
    charges: 3_000, interest: 4_000, principalRepaid: 3_000,
    insurance: 200, loanPayment: 7_200, amortizations: 0,
    fiscalResult: 4_800, taxableBase: 4_800, taxPaid: 1_440,
    cashFlowBeforeTax: 1_800, cashFlowAfterTax: 360,
    cumulativeCashFlow: 360, remainingCapital: 127_000,
    estimatedValue: 220_000, netPropertyValue: 93_000,
    ...p,
  }
}

function makeActual(p: Partial<ActualYearData> = {}): ActualYearData {
  return {
    year: 2024, rentReceived: 12_000, rentTransactionCount: 12,
    chargesPaid: { taxeFonciere: 1_500, insurance: 350, accountant: 0, cfe: 0, condoFees: 600, maintenance: 200, other: 0, total: 2_650 },
    chargesRecorded: true, loanPaid: 7_200, loanPaymentCount: 12,
    taxPaid: 1_400, feesPaid: 0, valuationAtYearEnd: 225_000,
    cashFlowReal: 1_750,
    ...p,
  }
}

const SCHEDULE_2024: AmortizationSchedule = {
  monthlyPayment: 600, monthlyInsurance: 17, totalMonthly: 617,
  totalInterest: 0, totalInsurance: 0, totalFees: 0, totalCost: 0, aprPct: 0,
  months: [],
  years: [
    { year: 1, interest: 4_000, principal: 3_000, insurance: 200, totalPayment: 7_000, remainingCapital: 127_000 },
  ],
}

describe('buildYearEndReport', () => {

  it('agrège revenus + charges + crédit + amortissement', () => {
    const r = buildYearEndReport(2024, 'pid', 'Maison Dupont', 'foncier_nu',
      makeProj(), makeActual(), SCHEDULE_2024, 2024)
    expect(r.year).toBe(2024)
    expect(r.propertyName).toBe('Maison Dupont')
    expect(r.fiscalRegime).toBe('foncier_nu')
    expect(r.rentReceived).toBe(12_000)
    expect(r.rentVariance).toBe(0)
    expect(r.chargesActual.total).toBe(2_650)
    expect(r.chargesVariance).toBe(-350)
    expect(r.loan!.interestPaid).toBe(4_000)
    expect(r.loan!.principalRepaid).toBe(3_000)
    expect(r.loan!.remainingCapital).toBe(127_000)
  })

  it('flag hasGaps si charges non saisies', () => {
    const actual = makeActual({ chargesRecorded: false, chargesPaid: { taxeFonciere: 0, insurance: 0, accountant: 0, cfe: 0, condoFees: 0, maintenance: 0, other: 0, total: 0 } })
    const r = buildYearEndReport(2024, 'pid', undefined, 'foncier_nu', makeProj(), actual, SCHEDULE_2024, 2024)
    expect(r.hasGaps).toBe(true)
    expect(r.gaps).toContain('charges détaillées non saisies')
  })

  it('flag écart mensualités > 100 €', () => {
    const actual = makeActual({ loanPaid: 7_500 })
    const r = buildYearEndReport(2024, 'pid', undefined, 'foncier_nu', makeProj(), actual, SCHEDULE_2024, 2024)
    expect(r.gaps.some((g) => g.includes('écart mensualités'))).toBe(true)
  })

  it('loan = null si pas de schedule', () => {
    const r = buildYearEndReport(2024, 'pid', undefined, 'foncier_nu', makeProj(), makeActual(), null, 2024)
    expect(r.loan).toBeNull()
  })

  it('flag aucune transaction de loyer si actual = null', () => {
    const r = buildYearEndReport(2024, 'pid', undefined, 'foncier_nu', makeProj(), null, SCHEDULE_2024, 2024)
    expect(r.hasGaps).toBe(true)
    expect(r.gaps).toContain('aucune transaction de loyer')
    expect(r.rentReceived).toBe(0)
  })

  it('amortizationTotal vient de la projection (régime réel)', () => {
    const r = buildYearEndReport(2024, 'pid', undefined, 'sci_is',
      makeProj({ amortizations: 5_500 }), makeActual(), SCHEDULE_2024, 2024)
    expect(r.amortizationTotal).toBe(5_500)
  })
})

describe('reportToCsv', () => {

  it('inclut BOM UTF-8 + en-têtes + sections principales', () => {
    const r = buildYearEndReport(2024, 'pid', 'Maison Dupont', 'foncier_nu',
      makeProj(), makeActual(), SCHEDULE_2024, 2024)
    const csv = reportToCsv(r)
    expect(csv.charCodeAt(0)).toBe(0xFEFF)            // BOM
    expect(csv).toContain('Rapport annuel 2024')
    expect(csv).toContain('Maison Dupont')
    expect(csv).toContain('REVENUS')
    expect(csv).toContain('CHARGES')
    expect(csv).toContain('CRÉDIT')
    expect(csv).toContain('CASH-FLOW')
  })

  it('utilise séparateur ; et décimale virgule (Excel FR)', () => {
    const r = buildYearEndReport(2024, 'pid', 'Test', 'foncier_nu',
      makeProj(), makeActual(), SCHEDULE_2024, 2024)
    const csv = reportToCsv(r)
    expect(csv).toContain(';')
    expect(csv).toContain('12000,00')   // décimale FR
  })

  it('échappe les caractères spéciaux', () => {
    const r = buildYearEndReport(2024, 'pid', 'Bien "Spécial" ; Test', 'foncier_nu',
      makeProj(), makeActual(), SCHEDULE_2024, 2024)
    const csv = reportToCsv(r)
    expect(csv).toContain('"Bien ""Spécial"" ; Test"')
  })

  it('inclut section ALERTES si hasGaps', () => {
    const actual = makeActual({ chargesRecorded: false, chargesPaid: { taxeFonciere: 0, insurance: 0, accountant: 0, cfe: 0, condoFees: 0, maintenance: 0, other: 0, total: 0 } })
    const r = buildYearEndReport(2024, 'pid', 'Test', 'foncier_nu', makeProj(), actual, SCHEDULE_2024, 2024)
    const csv = reportToCsv(r)
    expect(csv).toContain('ALERTES')
    expect(csv).toContain('charges détaillées non saisies')
  })

  it('omet section CRÉDIT si loan = null', () => {
    const r = buildYearEndReport(2024, 'pid', 'Test', 'foncier_nu', makeProj(), makeActual(), null, 2024)
    const csv = reportToCsv(r)
    expect(csv).not.toContain('CRÉDIT')
  })
})
