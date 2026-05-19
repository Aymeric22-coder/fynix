/**
 * Agrégation de plusieurs crédits actifs sur un même bien.
 *
 * Permet de cumuler : prêt principal + PTZ + prêt travaux + ...
 * Chaque crédit est calculé via les helpers purs existants
 * (buildAmortizationSchedule, computeRemainingCapitalAt) puis
 * sommé mois par mois pour produire un schedule fusionné.
 */

import {
  buildAmortizationSchedule,
  computeRemainingCapitalAt,
} from './amortization'
import type {
  AmortizationMonth,
  AmortizationSchedule,
  AmortizationYear,
  LoanInput,
} from './types'

export interface MultiLoanAggregate {
  /** Mensualité totale (capital + intérêts + assurance) tous prêts confondus. */
  totalMonthly:        number
  /** Total des intérêts payés sur la durée la plus longue. */
  totalInterest:       number
  /** Total assurance. */
  totalInsurance:      number
  /** Total frais (dossier + garantie). */
  totalFees:           number
  /** Coût total (intérêts + assurance + frais), hors capital. */
  totalCost:           number
  /** Capital restant dû agrégé à la date de référence. */
  totalRemainingCapital: number
  /** Schedule fusionné, mois par mois. */
  schedule:            AmortizationSchedule
}

/**
 * Agrège plusieurs crédits en un schedule unifié.
 *
 * Convention : on aligne les schedules sur le mois calendaire 1 = premier
 * mois du prêt LE PLUS LONG. Les crédits plus courts ajoutent 0 quand ils
 * sont soldés.
 *
 * Pour les biens existants avec un seul crédit, le résultat est strictement
 * identique à `buildAmortizationSchedule(loan)`.
 */
export function aggregateLoans(
  loans:          LoanInput[],
  referenceDate:  Date = new Date(),
): MultiLoanAggregate {
  const active = loans.filter(l => l.principal > 0 && l.durationYears > 0)

  if (active.length === 0) {
    const empty: AmortizationSchedule = {
      monthlyPayment:   0,
      monthlyInsurance: 0,
      totalMonthly:     0,
      totalInterest:    0,
      totalInsurance:   0,
      totalFees:        0,
      totalCost:        0,
      aprPct:           0,
      months:           [],
      years:            [],
    }
    return {
      totalMonthly:          0,
      totalInterest:         0,
      totalInsurance:        0,
      totalFees:             0,
      totalCost:             0,
      totalRemainingCapital: 0,
      schedule:              empty,
    }
  }

  const schedules = active.map(buildAmortizationSchedule)
  const maxMonths = Math.max(...schedules.map(s => s.months.length))

  // Fusion mois par mois
  const mergedMonths: AmortizationMonth[] = []
  for (let i = 0; i < maxMonths; i++) {
    let payment = 0, interest = 0, principal = 0, insurance = 0, remainingCapital = 0
    let isDeferred = false
    for (const s of schedules) {
      const m = s.months[i]
      if (m) {
        payment          += m.payment
        interest         += m.interest
        principal        += m.principal
        insurance        += m.insurance
        remainingCapital += m.remainingCapital
        if (m.isDeferred) isDeferred = true
      }
    }
    mergedMonths.push({
      monthIndex: i + 1,
      payment,
      interest,
      principal,
      insurance,
      remainingCapital,
      isDeferred,
    })
  }

  // Agrégat annuel
  const mergedYears: AmortizationYear[] = []
  let yI = 0, yP = 0, yIns = 0, yPay = 0, yearIdx = 1
  let monthsInYear = 0
  for (let i = 0; i < mergedMonths.length; i++) {
    const m = mergedMonths[i]!
    yI += m.interest
    yP += m.principal
    yIns += m.insurance
    yPay += m.payment
    monthsInYear++
    if (monthsInYear === 12 || i === mergedMonths.length - 1) {
      mergedYears.push({
        year:             yearIdx,
        totalPayment:     yPay,
        interest:         yI,
        principal:        yP,
        insurance:        yIns,
        remainingCapital: m.remainingCapital,
      })
      yearIdx++
      yI = 0; yP = 0; yIns = 0; yPay = 0
      monthsInYear = 0
    }
  }

  const totalInterest  = schedules.reduce((s, x) => s + x.totalInterest, 0)
  const totalInsurance = schedules.reduce((s, x) => s + x.totalInsurance, 0)
  const totalFees      = schedules.reduce((s, x) => s + x.totalFees, 0)
  const totalCost      = totalInterest + totalInsurance + totalFees

  // Mensualité de référence (phase amortissable) = somme des mensualités hors
  // assurance + somme des assurances moyennes.
  const monthlyPayment   = schedules.reduce((s, x) => s + x.monthlyPayment, 0)
  const monthlyInsurance = schedules.reduce((s, x) => s + x.monthlyInsurance, 0)

  // CRD agrégé à la date de référence : somme de chaque CRD individuel.
  const totalRemainingCapital = active.reduce(
    (sum, loan) => sum + computeRemainingCapitalAt(loan, referenceDate),
    0,
  )

  const schedule: AmortizationSchedule = {
    monthlyPayment,
    monthlyInsurance,
    totalMonthly:   monthlyPayment + monthlyInsurance,
    totalInterest,
    totalInsurance,
    totalFees,
    totalCost,
    aprPct:         0,   // TAEG mixte non pertinent
    months:         mergedMonths,
    years:          mergedYears,
  }

  return {
    totalMonthly:          monthlyPayment + monthlyInsurance,
    totalInterest,
    totalInsurance,
    totalFees,
    totalCost,
    totalRemainingCapital,
    schedule,
  }
}
