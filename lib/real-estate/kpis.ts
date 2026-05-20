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

  // ─── Prix de revient total ─────────────────────────────────────
  // Réf : tous les rendements (sauf grossYieldOnPrice qui garde sa
  // sémantique "sur prix d'achat") utilisent ce dénominateur unifié.
  // Inclut : prix net vendeur + frais notaire + travaux + mobilier
  // (LMNP/LMP — vit sur le régime, pas la propriété) + frais bancaires
  // et de garantie du prêt s'il y en a un.
  const regimeFurniture =
    'furnitureAmount' in input.regime
      ? (input.regime as { furnitureAmount?: number }).furnitureAmount ?? 0
      : 0
  const totalCost =
    property.purchasePrice +
    property.notaryFees +
    property.worksAmount +
    regimeFurniture +
    (loan?.bankFees ?? 0) +
    (loan?.guaranteeFees ?? 0)

  const borrowedAmount = loan?.principal ?? 0

  // Mensualité totale (capital + intérêts + assurance)
  const monthlyPayment   = (amortization?.monthlyPayment ?? 0) + (amortization?.monthlyInsurance ?? 0)
  const monthlyInsurance = amortization?.monthlyInsurance ?? 0

  // ─── Loyers et charges année 1 pour les rentabilités ──────────
  // Le rendement BRUT n'inclut PAS la vacance : c'est un risque qui
  // impacte le réel (net-net via projection), pas la théorie d'exploitation.
  const grossYearRent = rent.monthlyRent * 12
  const netRentForGliMgmt = grossYearRent   // base GLI / gestion = loyer théorique
  const gliY1         = netRentForGliMgmt * (charges.gliPct        / 100)
  const managementY1  = netRentForGliMgmt * (charges.managementPct / 100)
  const fixedChargesY1 =
    charges.pno + charges.propertyTax + charges.cfe + charges.accountant +
    charges.condoFees + charges.maintenance + charges.other
  const totalChargesY1 = fixedChargesY1 + gliY1 + managementY1

  // ─── Rendements (% entiers, ex 5 pour 5 %) ────────────────────
  // grossYieldOnPrice : "rendement sur le prix d'achat seul"
  //   utile pour comparer aux annonces marché (qui affichent le brut
  //   sur le prix net vendeur). Sémantique distincte conservée.
  const grossYieldOnPrice = property.purchasePrice > 0
    ? (grossYearRent / property.purchasePrice) * 100
    : 0

  // grossYieldFAI : "rendement brut sur le prix de revient total"
  //   c'est LE rendement à comparer au net et au net-net car ils
  //   utilisent tous le même dénominateur `totalCost`.
  const grossYieldFAI = totalCost > 0
    ? (grossYearRent / totalCost) * 100
    : 0

  // netYield : (loyer brut - charges d'exploitation) / coût total.
  //   N'inclut PAS la mensualité de crédit (financement, pas
  //   exploitation). N'inclut PAS les impôts. Ne déduit PAS la
  //   vacance (différence entre net et net-net = vacance + crédit
  //   + impôts).
  const netYield = totalCost > 0
    ? ((grossYearRent - totalChargesY1) / totalCost) * 100
    : 0

  // netNetYield : cash-flow réel après TOUT (vacance, charges,
  // crédit complet, impôts) + capital remboursé (qui est de la
  // capitalisation patrimoniale, pas une perte).
  //   = (CF après impôt + capital remboursé année 1) / coût total
  const y1 = projection[0]
  const netNetYield = totalCost > 0 && y1
    ? ((y1.cashFlowAfterTax + y1.principalRepaid) / totalCost) * 100
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
