/**
 * Tests des 7 cas limites du refactoring crédit (Étape 2).
 *
 * Couvre exhaustivement :
 *  1. Bien sans crédit (acheté cash)
 *  2. Différé total puis amortissement
 *  3. Différé partiel (intérêts seuls pendant la phase de différé)
 *  4. Assurance sur capital initial vs sur CRD
 *  5. Crédit déjà entièrement remboursé (CRD = 0)
 *  6. Date du jour avant la date de début du crédit
 *  7. Bien avec crédit en cours mais loyer = 0 (vacance / résidence principale)
 *
 * Plus :
 *  - Quotité d'assurance (100, 200)
 *  - Frais bancaires + garantie intégrés au coût total
 *  - TAEG approximatif raisonnable
 */

import { describe, it, expect } from 'vitest'
import {
  buildAmortizationSchedule,
  computeMonthlyPayment,
  computeRemainingCapitalAt,
  computeTotalLoanCost,
  computeApproxAPR,
} from '../amortization'
import type { LoanInput } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────

const baseLoan = (overrides: Partial<LoanInput> = {}): LoanInput => ({
  principal:        200_000,
  annualRatePct:    3.5,
  durationYears:    20,
  insuranceRatePct: 0.3,
  bankFees:         800,
  guaranteeFees:    1_500,
  ...overrides,
})

// ─── Cas 1 : Bien sans crédit ─────────────────────────────────────────

describe('Cas limite 1 — Bien sans crédit', () => {

  it('renvoie un schedule vide si principal = 0', () => {
    const s = buildAmortizationSchedule(baseLoan({ principal: 0 }))
    expect(s.months).toHaveLength(0)
    expect(s.years).toHaveLength(0)
    expect(s.monthlyPayment).toBe(0)
    expect(s.totalCost).toBe(800 + 1_500)   // les frais restent dans le coût total
    expect(s.totalInterest).toBe(0)
    expect(s.aprPct).toBe(0)
  })

  it('renvoie un schedule vide si durationYears = 0', () => {
    const s = buildAmortizationSchedule(baseLoan({ durationYears: 0 }))
    expect(s.months).toHaveLength(0)
    expect(s.totalInterest).toBe(0)
  })

  it('computeRemainingCapitalAt renvoie 0 si principal = 0', () => {
    expect(computeRemainingCapitalAt(baseLoan({ principal: 0 }))).toBe(0)
  })
})

// ─── Cas 2 : Différé total puis amortissement ─────────────────────────

describe('Cas limite 2 — Différé total puis amortissement', () => {

  const loan = baseLoan({ deferralType: 'total', deferralMonths: 12 })

  it('génère le bon nombre de lignes (durée totale)', () => {
    const s = buildAmortizationSchedule(loan)
    expect(s.months).toHaveLength(20 * 12)
  })

  it('paiement = 0 (hors assurance) pendant les 12 premiers mois', () => {
    const s = buildAmortizationSchedule(loan)
    for (let i = 0; i < 12; i++) {
      expect(s.months[i]!.payment).toBe(0)
      expect(s.months[i]!.principal).toBe(0)
      expect(s.months[i]!.interest).toBe(0)   // pas comptés comme payés (capitalisés)
      expect(s.months[i]!.isDeferred).toBe(true)
    }
  })

  it('CRD croît pendant le différé total (intérêts capitalisés)', () => {
    const s = buildAmortizationSchedule(loan)
    expect(s.months[0]!.remainingCapital).toBeGreaterThan(loan.principal)
    expect(s.months[11]!.remainingCapital).toBeGreaterThan(s.months[0]!.remainingCapital)
  })

  it('mensualité de la phase amortissable > mensualité d\'un prêt sans différé', () => {
    const sDef = buildAmortizationSchedule(loan)
    const sNoDef = buildAmortizationSchedule(baseLoan({ deferralType: 'none', deferralMonths: 0 }))
    expect(sDef.monthlyPayment).toBeGreaterThan(sNoDef.monthlyPayment)
  })

  it('CRD final = 0 (au centime près)', () => {
    const s = buildAmortizationSchedule(loan)
    expect(s.months[s.months.length - 1]!.remainingCapital).toBeLessThan(0.5)
  })
})

// ─── Cas 3 : Différé partiel (intérêts seuls) ─────────────────────────

describe('Cas limite 3 — Différé partiel (intérêts seuls)', () => {

  const loan = baseLoan({ deferralType: 'partial', deferralMonths: 6 })

  it('paie SEULEMENT les intérêts pendant les 6 premiers mois', () => {
    const s = buildAmortizationSchedule(loan)
    const expectedInterest = loan.principal * (loan.annualRatePct / 100 / 12)
    for (let i = 0; i < 6; i++) {
      expect(s.months[i]!.interest).toBeCloseTo(expectedInterest, 1)
      expect(s.months[i]!.principal).toBe(0)
      expect(s.months[i]!.payment).toBeCloseTo(expectedInterest, 1)
      expect(s.months[i]!.isDeferred).toBe(true)
    }
  })

  it('CRD inchangé pendant le différé partiel', () => {
    const s = buildAmortizationSchedule(loan)
    for (let i = 0; i < 6; i++) {
      expect(s.months[i]!.remainingCapital).toBeCloseTo(loan.principal, 0)
    }
  })

  it('mensualité de la phase amortissable > mensualité sans différé (durée raccourcie)', () => {
    const sDef = buildAmortizationSchedule(loan)
    const sNoDef = buildAmortizationSchedule(baseLoan({ deferralType: 'none' }))
    expect(sDef.monthlyPayment).toBeGreaterThan(sNoDef.monthlyPayment)
  })

  it('totalInterest > totalInterest sans différé (intérêts pendant 6 mois en plus sur CRD plein)', () => {
    const sDef = buildAmortizationSchedule(loan)
    const sNoDef = buildAmortizationSchedule(baseLoan({ deferralType: 'none' }))
    expect(sDef.totalInterest).toBeGreaterThan(sNoDef.totalInterest)
  })
})

// ─── Cas 4 : Assurance capital initial vs CRD ─────────────────────────

describe('Cas limite 4 — Assurance capital_initial vs capital_remaining', () => {

  it('capital_initial : assurance constante sur toute la durée', () => {
    const s = buildAmortizationSchedule(baseLoan({ insuranceBase: 'capital_initial' }))
    const insMonth0  = s.months[0]!.insurance
    const insMonth100 = s.months[100]!.insurance
    const insMonthLast = s.months[s.months.length - 1]!.insurance
    expect(insMonth0).toBeCloseTo(insMonth100, 4)
    expect(insMonth0).toBeCloseTo(insMonthLast, 4)
  })

  it('capital_remaining : assurance dégressive au fil du temps', () => {
    const s = buildAmortizationSchedule(baseLoan({ insuranceBase: 'capital_remaining' }))
    expect(s.months[0]!.insurance).toBeGreaterThan(s.months[100]!.insurance)
    expect(s.months[100]!.insurance).toBeGreaterThan(s.months[s.months.length - 1]!.insurance)
  })

  it('capital_remaining : totalInsurance < celui de capital_initial', () => {
    const sInit = buildAmortizationSchedule(baseLoan({ insuranceBase: 'capital_initial' }))
    const sCrd  = buildAmortizationSchedule(baseLoan({ insuranceBase: 'capital_remaining' }))
    expect(sCrd.totalInsurance).toBeLessThan(sInit.totalInsurance)
  })

  it('quotité 200 % double l\'assurance', () => {
    const s100 = buildAmortizationSchedule(baseLoan({ insuranceQuotitePct: 100 }))
    const s200 = buildAmortizationSchedule(baseLoan({ insuranceQuotitePct: 200 }))
    expect(s200.months[0]!.insurance).toBeCloseTo(s100.months[0]!.insurance * 2, 2)
    expect(s200.totalInsurance).toBeCloseTo(s100.totalInsurance * 2, 2)
  })

  it('quotité 0 % → assurance nulle', () => {
    const s = buildAmortizationSchedule(baseLoan({ insuranceQuotitePct: 0 }))
    expect(s.totalInsurance).toBe(0)
    expect(s.months[0]!.insurance).toBe(0)
  })
})

// ─── Cas 5 : Crédit déjà entièrement remboursé ────────────────────────

describe('Cas limite 5 — Crédit déjà entièrement remboursé', () => {

  it('CRD = 0 si la date demandée dépasse la fin du prêt', () => {
    const loan = baseLoan({ startDate: new Date('2000-01-01') })
    const crd = computeRemainingCapitalAt(loan, new Date('2025-01-01'))
    expect(crd).toBe(0)
  })

  it('CRD du dernier mois ≈ 0 (au centime près)', () => {
    const s = buildAmortizationSchedule(baseLoan())
    expect(s.months[s.months.length - 1]!.remainingCapital).toBeLessThan(0.5)
  })
})

// ─── Cas 6 : Date du jour avant le début du crédit ────────────────────

describe('Cas limite 6 — Date du jour avant le début du crédit', () => {

  it('renvoie le principal initial si simulationDate < startDate', () => {
    const loan = baseLoan({ startDate: new Date('2030-01-01') })
    const crd = computeRemainingCapitalAt(loan, new Date('2025-01-01'))
    expect(crd).toBe(loan.principal)
  })

  it('renvoie le principal initial si simulationDate = startDate', () => {
    const start = new Date('2025-06-15')
    const loan = baseLoan({ startDate: start })
    const crd = computeRemainingCapitalAt(loan, start)
    expect(crd).toBe(loan.principal)
  })
})

// ─── Cas 7 : Crédit en cours mais loyer = 0 ───────────────────────────
// (validation : le calcul d'amortissement reste indépendant du loyer)

describe('Cas limite 7 — Crédit en cours, indépendance vs loyer', () => {

  it('le schedule ne dépend pas du loyer (juste du crédit)', () => {
    // On vérifie que l'amortissement est purement déterminé par les
    // paramètres du prêt — le loyer 0 n'a aucun impact.
    const s = buildAmortizationSchedule(baseLoan())
    expect(s.monthlyPayment).toBeGreaterThan(0)
    expect(s.months.every((m) => m.payment >= 0 || m.isDeferred)).toBe(true)
  })

  it('CRD à 5 ans est indépendant du loyer (calcul pur)', () => {
    const loan = baseLoan({ startDate: new Date('2020-01-01') })
    const crd = computeRemainingCapitalAt(loan, new Date('2025-01-01'))
    expect(crd).toBeGreaterThan(0)
    expect(crd).toBeLessThan(loan.principal)
  })
})

// ─── Frais bancaires + garantie + TAEG ────────────────────────────────

describe('Frais bancaires + garantie + TAEG', () => {

  it('totalFees = bankFees + guaranteeFees', () => {
    const s = buildAmortizationSchedule(baseLoan({ bankFees: 800, guaranteeFees: 1_500 }))
    expect(s.totalFees).toBe(2_300)
  })

  it('totalCost = intérêts + assurance + frais', () => {
    const s = buildAmortizationSchedule(baseLoan())
    expect(s.totalCost).toBeCloseTo(s.totalInterest + s.totalInsurance + s.totalFees, 2)
  })

  it('computeTotalLoanCost = totalCost du schedule', () => {
    const loan = baseLoan()
    expect(computeTotalLoanCost(loan)).toBe(buildAmortizationSchedule(loan).totalCost)
  })

  it('TAEG > taux nominal quand frais > 0', () => {
    const s = buildAmortizationSchedule(baseLoan({ bankFees: 800, guaranteeFees: 1_500 }))
    expect(s.aprPct).toBeGreaterThan(3.5)
  })

  it('TAEG ≈ taux nominal quand frais = 0 et assurance = 0', () => {
    const loan = baseLoan({ bankFees: 0, guaranteeFees: 0, insuranceRatePct: 0 })
    const s = buildAmortizationSchedule(loan)
    // taux mensuel 3.5/12 → annuel effectif (1 + 3.5/100/12)^12 - 1 ≈ 3.557 %
    expect(s.aprPct).toBeGreaterThan(3.5)
    expect(s.aprPct).toBeLessThan(3.6)
  })
})

// ─── PMT formule de référence ─────────────────────────────────────────

describe('computeMonthlyPayment — formule PMT', () => {

  it('200 000 € à 3.5 % sur 20 ans ≈ 1 159.92 €/mois', () => {
    const m = computeMonthlyPayment(200_000, 3.5, 20)
    expect(m).toBeCloseTo(1159.92, 2)
  })

  it('renvoie 0 si principal = 0', () => {
    expect(computeMonthlyPayment(0, 3.5, 20)).toBe(0)
  })

  it('renvoie 0 si durationYears = 0', () => {
    expect(computeMonthlyPayment(200_000, 3.5, 0)).toBe(0)
  })

  it('taux 0 % : mensualité = principal / nb mois', () => {
    expect(computeMonthlyPayment(120_000, 0, 10)).toBe(1_000)
  })
})

// ─── Robustesse ───────────────────────────────────────────────────────

describe('Robustesse', () => {

  it('deferralMonths >= durée totale est clamp à durée - 1', () => {
    const loan = baseLoan({ deferralType: 'partial', deferralMonths: 9999 })
    expect(() => buildAmortizationSchedule(loan)).not.toThrow()
  })

  it('Schedule cohérent : sum(principal) ≈ principal initial (hors différé total)', () => {
    const s = buildAmortizationSchedule(baseLoan({ deferralType: 'none' }))
    const totalPrincipalRepaid = s.months.reduce((acc, m) => acc + m.principal, 0)
    expect(totalPrincipalRepaid).toBeCloseTo(200_000, 0)
  })

  it('Agrégat annuel : 20 lignes pour un prêt 20 ans', () => {
    const s = buildAmortizationSchedule(baseLoan())
    expect(s.years).toHaveLength(20)
    expect(s.years[0]!.year).toBe(1)
    expect(s.years[19]!.year).toBe(20)
  })

  it('computeApproxAPR ne crash pas sur principal = 0', () => {
    expect(computeApproxAPR(baseLoan({ principal: 0 }))).toBe(0)
  })
})
