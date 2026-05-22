/**
 * Tests d'agrégation multi-crédit (principal + PTZ).
 */

import { describe, it, expect } from 'vitest'
import { aggregateLoans } from '../multi-credit'
import { buildAmortizationSchedule } from '../amortization'
import type { LoanInput } from '../types'

const PRINCIPAL: LoanInput = {
  principal:        200_000,
  annualRatePct:    3.65,
  durationYears:    20,
  insuranceRatePct: 0.2,
  bankFees:         800,
  guaranteeFees:    1_500,
  startDate:        new Date('2024-01-01'),
}

const PTZ: LoanInput = {
  principal:        40_000,
  annualRatePct:    0,        // PTZ : taux zéro
  durationYears:    25,
  insuranceRatePct: 0,
  bankFees:         0,
  guaranteeFees:    0,
  startDate:        new Date('2024-01-01'),
}

describe('aggregateLoans — multi-crédit', () => {
  it('renvoie zéro pour un tableau vide', () => {
    const agg = aggregateLoans([])
    expect(agg.totalMonthly).toBe(0)
    expect(agg.schedule.months).toHaveLength(0)
  })

  it('un seul crédit → résultat équivalent à buildAmortizationSchedule', () => {
    const agg  = aggregateLoans([PRINCIPAL])
    const ref  = buildAmortizationSchedule(PRINCIPAL)
    expect(agg.totalMonthly).toBeCloseTo(ref.totalMonthly, 2)
    expect(agg.totalInterest).toBeCloseTo(ref.totalInterest, 2)
    expect(agg.schedule.months).toHaveLength(ref.months.length)
  })

  it('principal + PTZ : somme des mensualités correcte', () => {
    const refPrincipal = buildAmortizationSchedule(PRINCIPAL)
    const refPtz       = buildAmortizationSchedule(PTZ)
    const agg          = aggregateLoans([PRINCIPAL, PTZ])

    // Mensualité totale = mensualité principal + mensualité PTZ (taux 0 → linéaire)
    const expectedMonthly = refPrincipal.monthlyPayment + refPtz.monthlyPayment
    expect(agg.schedule.monthlyPayment).toBeCloseTo(expectedMonthly, 2)
    // PTZ 0 % → 40 000 / 300 mois = 133,33 €/mois sans assurance
    expect(refPtz.monthlyPayment).toBeCloseTo(40_000 / 300, 2)
  })

  it('principal + PTZ : nombre de mois = durée du prêt le plus long (25 ans → 300 mois)', () => {
    const agg = aggregateLoans([PRINCIPAL, PTZ])
    expect(agg.schedule.months).toHaveLength(300)
  })

  it('principal + PTZ : CRD agrégé > 0 à la date de début, < principal cumulé à 5 ans', () => {
    const at5y = new Date('2029-01-01')
    const agg  = aggregateLoans([PRINCIPAL, PTZ], at5y)
    // Capital cumulé initial = 240 000, à 5 ans il doit avoir baissé
    expect(agg.totalRemainingCapital).toBeLessThan(240_000)
    expect(agg.totalRemainingCapital).toBeGreaterThan(0)
  })

  it('après expiration du prêt principal (>20 ans), seul le PTZ contribue', () => {
    const agg = aggregateLoans([PRINCIPAL, PTZ])
    const month250 = agg.schedule.months[249]   // mois 250 = an 21
    expect(month250).toBeDefined()
    // Le principal est soldé → balance ne reflète que le PTZ restant
    const refPtz = buildAmortizationSchedule(PTZ)
    expect(month250!.remainingCapital).toBeCloseTo(
      refPtz.months[249]!.remainingCapital,
      0,
    )
  })

  it('totalCost = somme des coûts individuels', () => {
    const ref1 = buildAmortizationSchedule(PRINCIPAL)
    const ref2 = buildAmortizationSchedule(PTZ)
    const agg  = aggregateLoans([PRINCIPAL, PTZ])
    expect(agg.totalCost).toBeCloseTo(ref1.totalCost + ref2.totalCost, 2)
  })

  // V3.2 — Invariant clé pour MultiCreditList : la mensualité affichée
  // par ligne (= buildAmortizationSchedule(loan).totalMonthly) DOIT
  // sommer exactement au totalMonthly de aggregateLoans. Sinon la somme
  // visuelle des lignes ne colle pas avec le total affiché en bas.
  // (Bug D1-M01 corrigé en V3.2 via le calcul server-side de `monthly`
  // par crédit.)
  it('V3.2 — sum(individualSchedule.totalMonthly) === aggregateLoans.totalMonthly', () => {
    const individuals = [PRINCIPAL, PTZ].map(buildAmortizationSchedule)
    const sumMonthly  = individuals.reduce((s, x) => s + x.totalMonthly, 0)
    const agg         = aggregateLoans([PRINCIPAL, PTZ])
    expect(sumMonthly).toBeCloseTo(agg.totalMonthly, 6)
  })
})
