/**
 * Diagnostic : log les valeurs précises du cas de référence pour validation visuelle.
 * Ne fait pas d'assertion stricte — le seul objectif est d'imprimer les chiffres réels.
 */

import { describe, it } from 'vitest'
import { runSimulation } from '..'
import type { SimulationInput } from '../types'

const REF: SimulationInput = {
  property: {
    purchasePrice: 200_000, notaryFees: 17_000, worksAmount: 154_000,
    propertyIndexPct: 0,
  },
  loan: {
    principal: 356_800, annualRatePct: 3.76, durationYears: 25,
    insuranceRatePct: 0.2, bankFees: 1_200, guaranteeFees: 4_600,
  },
  rent: { monthlyRent: 2_580, vacancyMonths: 0.3, rentalIndexPct: 2.0 },
  charges: {
    pno: 600, gliPct: 2.5, propertyTax: 2_300, cfe: 720, accountant: 420,
    condoFees: 0, managementPct: 0, maintenance: 0, other: 1_000,
    chargesIndexPct: 2.0,
  },
  regime: {
    kind: 'sci_is', landSharePct: 15, amortBuildingYears: 30,
    amortWorksYears: 15, amortFurnitureYears: 0,
    acquisitionFeesTreatment: 'expense_y1',
  },
  downPayment: 20_000, horizonYears: 25,
}

describe('DIAGNOSTIC — Cas de référence SCI IS (valeurs réelles)', () => {
  it('affiche les KPIs et les années clés', () => {
    const r = runSimulation(REF)
    const k = r.kpis
    const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
    const pct = (n: number) => (n * 100).toFixed(2) + ' %'

    console.log('\n══════════════ KPIs ══════════════')
    console.log(`  Coût total opération     : ${fmt(k.totalCost)}             [attendu 376 800 €]`)
    console.log(`  Emprunt                   : ${fmt(k.borrowedAmount)}              [attendu 356 800 €]`)
    console.log(`  Mensualité totale         : ${fmt(k.monthlyPayment)}                  [attendu ≈ 1 896 €]`)
    console.log(`  ├─ Capital + intérêts    : ${fmt(k.monthlyPayment - k.monthlyInsurance)}`)
    console.log(`  └─ Assurance             : ${fmt(k.monthlyInsurance)}                       [attendu ≈ 59 €]`)
    console.log(`  Renta brute /prix         : ${pct(k.grossYieldOnPrice)}                  [attendu 15,48 %]`)
    console.log(`  Renta brute FAI           : ${pct(k.grossYieldFAI)}                  [attendu 8,35 %]`)
    console.log(`  Renta nette               : ${pct(k.netYield)}                  [attendu 6,57 %]`)
    console.log(`  Renta nette-nette         : ${pct(k.netNetYield)}`)
    console.log(`  CF mensuel A1             : ${fmt(k.monthlyCashFlowYear1)}                     [attendu ≈ 137 €]`)
    console.log(`  CF annuel A1              : ${fmt(k.annualCashFlowYear1)}                  [attendu ≈ 1 641 €]`)
    console.log(`  Année retour apport       : A${k.paybackYear}                          [attendu A7]`)

    console.log('\n══════════════ Années clés ══════════════')
    const yKey = [1, 5, 10, 15, 16, 20, 25]
    console.log('  Année │  Loyers nets │   Charges  │  Intérêts  │ Capital R. │  Amort.    │ Résultat F.│   IS       │  CF a/IS   │   Cumul    │ Cap. rest.')
    console.log('  ──────┼──────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼────────────┼─────────────')
    for (const y of yKey) {
      const p = r.projection[y - 1]!
      const pad = (s: string, n: number) => s.padStart(n, ' ')
      console.log(
        `   A${pad(String(y), 2)}  │ ${pad(fmt(p.netRent), 12)} │ ${pad(fmt(p.charges), 10)} │ ${pad(fmt(p.interest), 10)} │ ${pad(fmt(p.principalRepaid), 10)} │ ${pad(fmt(p.amortizations), 10)} │ ${pad(fmt(p.fiscalResult), 10)} │ ${pad(fmt(p.taxPaid), 10)} │ ${pad(fmt(p.cashFlowAfterTax), 10)} │ ${pad(fmt(p.cumulativeCashFlow), 10)} │ ${pad(fmt(p.remainingCapital), 10)}`,
      )
    }
    console.log('')
  })
})
