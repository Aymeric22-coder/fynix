/**
 * Calcul d'amortissement de prêt à échéances constantes (Phase 1).
 * Pure et déterministe.
 */

import type {
  AmortizationMonth,
  AmortizationSchedule,
  AmortizationYear,
  LoanInput,
} from './types'

/**
 * Mensualité d'un prêt à échéances constantes (formule PMT).
 * @param principal       Capital emprunté
 * @param annualRatePct   Taux annuel en pourcentage (ex 3.76)
 * @param durationYears   Durée en années
 */
export function computeMonthlyPayment(
  principal: number,
  annualRatePct: number,
  durationYears: number,
): number {
  if (principal <= 0 || durationYears <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = durationYears * 12
  if (r === 0) return principal / n
  return (principal * r) / (1 - Math.pow(1 + r, -n))
}

/**
 * Construit le tableau d'amortissement complet (mensuel + agrégat annuel).
 * Si principal == 0 ou durationYears == 0 → renvoie un schedule "vide" non-null.
 */
export function buildAmortizationSchedule(loan: LoanInput): AmortizationSchedule {
  const principal      = Math.max(0, loan.principal)
  const annualRate     = loan.annualRatePct
  const durationYears  = loan.durationYears
  const insuranceRate  = loan.insuranceRatePct ?? 0

  const monthlyPayment   = computeMonthlyPayment(principal, annualRate, durationYears)
  const monthlyInsurance = principal === 0 ? 0 : (principal * (insuranceRate / 100)) / 12
  const totalMonthly     = monthlyPayment + monthlyInsurance

  const months: AmortizationMonth[] = []
  const years: AmortizationYear[]   = []

  if (principal === 0 || durationYears === 0) {
    return {
      monthlyPayment:   0,
      monthlyInsurance: 0,
      totalMonthly:     0,
      totalInterest:    0,
      totalCost:        0,
      months,
      years,
    }
  }

  const r        = annualRate / 100 / 12
  const totalN   = durationYears * 12
  let balance    = principal
  let totalInterest = 0

  for (let y = 1; y <= durationYears; y++) {
    let yI = 0, yP = 0, yIns = 0, yPay = 0
    for (let m = 1; m <= 12; m++) {
      const monthIndex = (y - 1) * 12 + m
      if (monthIndex > totalN) break

      const interest  = balance * r
      const principalPart = monthlyPayment - interest
      balance = Math.max(0, balance - principalPart)

      yI   += interest
      yP   += principalPart
      yIns += monthlyInsurance
      yPay += monthlyPayment
      totalInterest += interest

      months.push({
        monthIndex,
        payment:          monthlyPayment,
        interest,
        principal:        principalPart,
        insurance:        monthlyInsurance,
        remainingCapital: balance,
      })
    }
    years.push({
      year:             y,
      totalPayment:     yPay,
      interest:         yI,
      principal:        yP,
      insurance:        yIns,
      remainingCapital: balance,
    })
  }

  return {
    monthlyPayment,
    monthlyInsurance,
    totalMonthly,
    totalInterest,
    totalCost:    totalMonthly * totalN,
    months,
    years,
  }
}

/**
 * Capital restant dû à une date donnée, à partir de la date de début du prêt.
 * Si pas de date de début : on suppose que le prêt commence à `simulationDate`,
 * donc capital restant = principal initial.
 */
export function computeRemainingCapitalAt(
  loan: LoanInput,
  simulationDate: Date = new Date(),
): number {
  if (!loan.principal || loan.principal <= 0) return 0
  if (!loan.startDate) return loan.principal

  const start = loan.startDate
  if (simulationDate <= start) return loan.principal

  // Nombre de mois écoulés (entiers) depuis le début du prêt
  const monthsElapsed =
    (simulationDate.getFullYear() - start.getFullYear()) * 12 +
    (simulationDate.getMonth() - start.getMonth())
  if (monthsElapsed <= 0) return loan.principal

  const schedule = buildAmortizationSchedule(loan)
  if (monthsElapsed >= schedule.months.length) return 0

  const m = schedule.months[monthsElapsed - 1]
  return m ? m.remainingCapital : 0
}
