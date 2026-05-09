/**
 * Calcul des KPIs pour les cards en haut de la vue détail.
 * Toutes les valeurs sont calculées à partir de la projection.
 */

import { computeRemainingCapitalAt } from './amortization'
import type {
  AmortizationSchedule,
  ProjectionYear,
  PropertyKPIs,
  SimulationInput,
} from './types'

export function computeKPIs(
  input:        SimulationInput,
  amortization: AmortizationSchedule | null,
  projection:   ProjectionYear[],
): PropertyKPIs {
  const { property, loan, rent, charges, downPayment } = input

  const totalCost =
    property.purchasePrice +
    property.notaryFees +
    property.worksAmount +
    (loan?.bankFees ?? 0) +
    (loan?.guaranteeFees ?? 0)

  const borrowedAmount = loan?.principal ?? 0

  // Mensualité totale (capital + intérêts + assurance)
  const monthlyPayment   = (amortization?.monthlyPayment ?? 0) + (amortization?.monthlyInsurance ?? 0)
  const monthlyInsurance = amortization?.monthlyInsurance ?? 0

  // Loyers et charges année 1 pour les rentabilités
  const grossYearRent = rent.monthlyRent * 12
  // Charges A1 estimées (sans indexation, GLI/management calculés sur netRent A1)
  const vacancyLossY1 = rent.monthlyRent * rent.vacancyMonths
  const netRentY1     = grossYearRent - vacancyLossY1
  const gliY1         = netRentY1 * (charges.gliPct        / 100)
  const managementY1  = netRentY1 * (charges.managementPct / 100)
  const fixedChargesY1 =
    charges.pno + charges.propertyTax + charges.cfe + charges.accountant +
    charges.condoFees + charges.maintenance + charges.other
  const totalChargesY1 = fixedChargesY1 + gliY1 + managementY1

  // Rentabilités
  const acquisitionCost = property.purchasePrice + property.notaryFees + property.worksAmount

  const grossYieldOnPrice = property.purchasePrice > 0
    ? grossYearRent / property.purchasePrice
    : 0
  const grossYieldFAI = acquisitionCost > 0
    ? grossYearRent / acquisitionCost
    : 0
  const netYield = acquisitionCost > 0
    ? (netRentY1 - totalChargesY1) / acquisitionCost
    : 0
  // Renta nette-nette = (CF après impôt + capital remboursé année 1) / coût total
  const y1 = projection[0]
  const netNetYield = totalCost > 0 && y1
    ? (y1.cashFlowAfterTax + y1.principalRepaid) / totalCost
    : 0

  const annualCashFlowY1  = y1?.cashFlowAfterTax ?? 0
  const monthlyCashFlowY1 = annualCashFlowY1 / 12

  // Patrimoine actuel
  const remainingCapitalNow = loan && loan.startDate
    ? computeRemainingCapitalAt(loan, input.simulationDate ?? new Date())
    : (loan?.principal ?? 0)
  const initialEstimatedValue =
    property.currentEstimatedValue
    ?? (property.purchasePrice + property.worksAmount)
  const currentNetPropertyValue = initialEstimatedValue - remainingCapitalNow
  const leverageRatio = downPayment > 0 ? currentNetPropertyValue / downPayment : 0

  // Année de retour sur apport (cumul ≥ 0)
  const paybackYearObj = projection.find(p => p.cumulativeCashFlow >= 0)
  const paybackYear = paybackYearObj ? paybackYearObj.year : null

  return {
    totalCost,
    borrowedAmount,
    downPayment,
    monthlyPayment,
    monthlyInsurance,
    grossYieldOnPrice,
    grossYieldFAI,
    netYield,
    netNetYield,
    monthlyCashFlowYear1: monthlyCashFlowY1,
    annualCashFlowYear1:  annualCashFlowY1,
    currentNetPropertyValue,
    leverageRatio,
    paybackYear,
  }
}
