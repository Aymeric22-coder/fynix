/**
 * Tests unitaires de la mécanique d'amortissement de prêt.
 */

import { describe, it, expect } from 'vitest'
import {
  buildAmortizationSchedule,
  computeMonthlyPayment,
  computeRemainingCapitalAt,
} from '../amortization'

describe('computeMonthlyPayment', () => {
  it('renvoie 0 pour un capital nul', () => {
    expect(computeMonthlyPayment(0, 3, 20)).toBe(0)
  })

  it('renvoie 0 pour une durée nulle', () => {
    expect(computeMonthlyPayment(100_000, 3, 0)).toBe(0)
  })

  it('gère le taux 0 (mensualité = capital / nb mois)', () => {
    expect(computeMonthlyPayment(120_000, 0, 10)).toBeCloseTo(120_000 / 120, 2)
  })

  it('calcule la mensualité PMT classique (200 000 € à 3 % sur 20 ans ≈ 1 109,20 €)', () => {
    const m = computeMonthlyPayment(200_000, 3, 20)
    expect(m).toBeCloseTo(1109.20, 0)
  })

  it('cas de référence : 356 800 € à 3,76 % sur 25 ans ≈ 1 836,5 € (hors assurance)', () => {
    const m = computeMonthlyPayment(356_800, 3.76, 25)
    expect(m).toBeGreaterThan(1_830)
    expect(m).toBeLessThan(1_842)
  })
})

describe('buildAmortizationSchedule', () => {
  it('renvoie un schedule vide pour un capital nul', () => {
    const s = buildAmortizationSchedule({
      principal: 0, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
    })
    expect(s.monthlyPayment).toBe(0)
    expect(s.months).toHaveLength(0)
    expect(s.years).toHaveLength(0)
  })

  it('produit n×12 mois pour un prêt de n années', () => {
    const s = buildAmortizationSchedule({
      principal: 100_000, annualRatePct: 3, durationYears: 15,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
    })
    expect(s.months).toHaveLength(15 * 12)
    expect(s.years).toHaveLength(15)
  })

  it('a un capital restant dû ≈ 0 à la fin du prêt', () => {
    const s = buildAmortizationSchedule({
      principal: 100_000, annualRatePct: 4, durationYears: 10,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
    })
    const last = s.months[s.months.length - 1]
    expect(last!.remainingCapital).toBeLessThan(1)
  })

  it('la somme des capital + intérêts ≈ totalCost (hors assurance)', () => {
    const s = buildAmortizationSchedule({
      principal: 200_000, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
    })
    const totalPaid = s.months.reduce((sum, m) => sum + m.interest + m.principal, 0)
    expect(totalPaid).toBeCloseTo(s.monthlyPayment * 240, 0)
  })

  it('intègre l\'assurance constante calculée sur le capital initial', () => {
    const s = buildAmortizationSchedule({
      principal: 100_000, annualRatePct: 3, durationYears: 10,
      insuranceRatePct: 0.3, bankFees: 0, guaranteeFees: 0,
    })
    const expectedInsurance = (100_000 * 0.003) / 12
    expect(s.monthlyInsurance).toBeCloseTo(expectedInsurance, 4)
    s.months.forEach(m => {
      expect(m.insurance).toBeCloseTo(expectedInsurance, 4)
    })
  })
})

describe('computeRemainingCapitalAt', () => {
  it('renvoie 0 pour un prêt à principal 0', () => {
    expect(computeRemainingCapitalAt({
      principal: 0, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
    }, new Date())).toBe(0)
  })

  it('renvoie le principal initial si pas de startDate', () => {
    expect(computeRemainingCapitalAt({
      principal: 100_000, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
    }, new Date())).toBe(100_000)
  })

  it('renvoie le principal initial si la date de simulation est avant le début du prêt', () => {
    const start = new Date(2030, 0, 1)
    const sim = new Date(2025, 0, 1)
    expect(computeRemainingCapitalAt({
      principal: 100_000, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
      startDate: start,
    }, sim)).toBe(100_000)
  })

  it('renvoie ≈ 0 quand la date de simulation est après la fin du prêt', () => {
    const start = new Date(2000, 0, 1)
    const sim = new Date(2030, 0, 1)
    expect(computeRemainingCapitalAt({
      principal: 100_000, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
      startDate: start,
    }, sim)).toBeLessThan(1)
  })

  it('renvoie un capital intermédiaire entre 0 et principal en milieu de prêt', () => {
    const start = new Date(2020, 0, 1)
    const sim = new Date(2025, 0, 1)   // 5 ans plus tard sur un prêt de 20 ans
    const remaining = computeRemainingCapitalAt({
      principal: 100_000, annualRatePct: 3, durationYears: 20,
      insuranceRatePct: 0, bankFees: 0, guaranteeFees: 0,
      startDate: start,
    }, sim)
    expect(remaining).toBeGreaterThan(70_000)  // typique : ~80 % restant à 25 % de la durée
    expect(remaining).toBeLessThan(95_000)
  })
})
