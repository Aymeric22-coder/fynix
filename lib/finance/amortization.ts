import { pmt, round2 } from './formulas'
import { addMonths, format } from 'date-fns'
import type { Debt, DebtAmortization } from '@/types/database.types'

export interface AmortizationRow {
  period_number: number
  payment_date: string
  payment_total: number
  payment_capital: number
  payment_interest: number
  payment_insurance: number
  capital_remaining: number
  is_deferred: boolean
}

/**
 * Génère le tableau d'amortissement complet d'un crédit.
 * Gère le différé total (aucun paiement) et partiel (intérêts seulement).
 */
export function generateAmortizationSchedule(debt: Debt): AmortizationRow[] {
  const {
    initial_amount,
    interest_rate,
    insurance_rate,
    duration_months,
    start_date,
    deferral_type,
    deferral_months,
  } = debt

  // Depuis migration 005, interest_rate / duration_months / start_date sont nullable.
  // Si les champs critiques manquent, on renvoie un tableau vide (crédit incomplet).
  if (interest_rate == null || duration_months == null) return []

  const monthlyRate = interest_rate / 100 / 12
  const monthlyInsuranceRate = insurance_rate / 100 / 12

  // Durée réelle d'amortissement (hors différé)
  const amortMonths = duration_months - deferral_months

  const monthlyCapitalPayment = pmt(interest_rate, amortMonths, initial_amount)

  // Date de départ : aujourd'hui si start_date est null
  const startDateObj = start_date ? new Date(start_date) : new Date()

  const rows: AmortizationRow[] = []
  let capitalRemaining = initial_amount

  for (let period = 1; period <= duration_months; period++) {
    const paymentDate = format(addMonths(startDateObj, period - 1), 'yyyy-MM-dd')
    const isDeferred = period <= deferral_months
    const insuranceAmount = round2(capitalRemaining * monthlyInsuranceRate)

    if (isDeferred && deferral_type === 'total') {
      // Différé total : aucun paiement, les intérêts s'accumulent sur le capital
      const interestAmount = round2(capitalRemaining * monthlyRate)
      capitalRemaining = round2(capitalRemaining + interestAmount)

      rows.push({
        period_number: period,
        payment_date: paymentDate,
        payment_total: insuranceAmount,
        payment_capital: 0,
        payment_interest: 0,
        payment_insurance: insuranceAmount,
        capital_remaining: capitalRemaining,
        is_deferred: true,
      })
    } else if (isDeferred && deferral_type === 'partial') {
      // Différé partiel : intérêts seulement
      const interestAmount = round2(capitalRemaining * monthlyRate)

      rows.push({
        period_number: period,
        payment_date: paymentDate,
        payment_total: round2(interestAmount + insuranceAmount),
        payment_capital: 0,
        payment_interest: interestAmount,
        payment_insurance: insuranceAmount,
        capital_remaining: round2(capitalRemaining),
        is_deferred: true,
      })
    } else {
      // Période normale
      const interestAmount = round2(capitalRemaining * monthlyRate)
      const capitalAmount = round2(monthlyCapitalPayment - interestAmount)
      capitalRemaining = round2(capitalRemaining - capitalAmount)

      // Correction floating-point sur la dernière mensualité
      if (period === duration_months) capitalRemaining = 0

      rows.push({
        period_number: period,
        payment_date: paymentDate,
        payment_total: round2(monthlyCapitalPayment + insuranceAmount),
        payment_capital: capitalAmount,
        payment_interest: interestAmount,
        payment_insurance: insuranceAmount,
        capital_remaining: Math.max(0, capitalRemaining),
        is_deferred: false,
      })
    }
  }

  return rows
}

/**
 * Capital restant dû à une date donnée, à partir du tableau d'amortissement.
 * Plus précis que le calcul analytique car respecte le différé exact.
 */
export function capitalRemainingAt(
  schedule: Pick<DebtAmortization, 'payment_date' | 'capital_remaining'>[],
  date: Date,
): number {
  const dateStr = format(date, 'yyyy-MM-dd')

  // Trouver la dernière période dont la date <= date cible
  const pastPeriods = schedule.filter((row) => row.payment_date <= dateStr)

  if (pastPeriods.length === 0) {
    // Avant la première mensualité — retourner le capital initial
    return schedule[0]?.capital_remaining ?? 0
  }

  const lastPeriod = pastPeriods[pastPeriods.length - 1]
  return lastPeriod?.capital_remaining ?? 0
}
