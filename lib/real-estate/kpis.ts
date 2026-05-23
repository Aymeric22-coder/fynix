/**
 * Calcul des KPIs pour les cards en haut de la vue détail.
 * Toutes les valeurs sont calculées à partir de la projection.
 */

import { aggregateLoans } from './multi-credit'
import type {
  AmortizationSchedule,
  LoanInput,
  ProjectionYear,
  PropertyKPIs,
  SimulationInput,
} from './types'

/**
 * V3.1 — Idem projection.ts : `loans` prime, fallback `loan` legacy.
 * Filtre les crédits triviaux pour rester cohérent avec `computeProjection`.
 */
function resolveActiveLoans(input: SimulationInput): LoanInput[] {
  const candidates = (input.loans && input.loans.length > 0)
    ? input.loans
    : (input.loan ? [input.loan] : [])
  return candidates.filter(l => l.principal > 0 && l.durationYears > 0)
}

export function computeKPIs(
  input:        SimulationInput,
  amortization: AmortizationSchedule | null,
  projection:   ProjectionYear[],
): PropertyKPIs {
  const { property, rent, charges, downPayment } = input
  const activeLoans = resolveActiveLoans(input)

  // ─── Prix de revient total ─────────────────────────────────────
  // Réf : tous les rendements (sauf grossYieldOnPrice qui garde sa
  // sémantique "sur prix d'achat") utilisent ce dénominateur unifié.
  // Inclut : prix net vendeur + frais notaire + travaux + mobilier
  // (LMNP/LMP — vit sur le régime, pas la propriété) + frais bancaires
  // et de garantie de TOUS les prêts actifs (multi-crédit V3.1).
  const regimeFurniture =
    'furnitureAmount' in input.regime
      ? (input.regime as { furnitureAmount?: number }).furnitureAmount ?? 0
      : 0
  const totalBankFees      = activeLoans.reduce((s, l) => s + l.bankFees, 0)
  const totalGuaranteeFees = activeLoans.reduce((s, l) => s + l.guaranteeFees, 0)
  const totalCost =
    property.purchasePrice +
    property.notaryFees +
    property.worksAmount +
    regimeFurniture +
    totalBankFees +
    totalGuaranteeFees

  // Montant emprunté = somme des principals (multi-crédit V3.1)
  const borrowedAmount = activeLoans.reduce((s, l) => s + l.principal, 0)

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

  // netNetYield (V7) : rendement nette − impôt effectivement payé.
  //   = (grossYearRent − totalChargesY1 − taxPaidY1) / totalCost × 100
  //   ≡ netYield − (taxPaidY1 / totalCost × 100)
  //
  // Refonte V7 : on RETIRE complètement le financement du calcul.
  // Avant V7, netNetYield soustrayait la mensualité de crédit complète
  // (intérêts + assurance) et rajoutait le capital remboursé — ce qui
  // mélangeait deux choses :
  //  (a) le coût du financement (intérêts + assurance) ;
  //  (b) la fiscalité réellement payée.
  // Conséquence : un bien dont l'impôt = 0 (ex. SCI à l'IS dont
  // l'amortissement annule l'IS les premières années) affichait quand
  // même un écart net→net-net de plusieurs points, simplement parce
  // que le coût du crédit n'était pas amorti par la fiscalité.
  //
  // V7 — principe directeur : la SEULE différence entre `netYield` et
  // `netNetYield` doit être l'impôt RÉELLEMENT payé (`taxPaid` du
  // moteur, qui tient déjà compte de l'amortissement, des intérêts
  // déductibles, du déficit reporté, etc. — ne pas recalculer un impôt
  // "sans prêt"). La vacance et les charges restent identiques entre
  // les deux (assiette `grossYearRent` + `totalChargesY1`, comme net).
  //
  // Invariant verrouillé par test (multi-credit-consistency) :
  //   taxPaidY1 === 0  ⇒  netNetYield === netYield (strict).
  //
  // Effet observable côté UI : la net-net REMONTE (ex. Tandoori SCI IS
  // 2,64 % → ~6 %), c'est voulu.
  const y1 = projection[0]
  const taxPaidY1 = y1?.taxPaid ?? 0
  const netNetYield = totalCost > 0
    ? ((grossYearRent - totalChargesY1 - taxPaidY1) / totalCost) * 100
    : 0

  const annualCashFlowY1  = y1?.cashFlowAfterTax ?? 0
  const monthlyCashFlowY1 = annualCashFlowY1 / 12

  // Patrimoine actuel — multi-crédit V3.1 :
  // CRD à date = somme des CRD individuels. Pour un seul crédit avec
  // startDate défini, équivalent au comportement legacy
  // (computeRemainingCapitalAt(loan, simDate)).
  const simDateForCrd = input.simulationDate ?? new Date()
  let remainingCapitalNow = 0
  if (activeLoans.length > 0) {
    const anyHasStart = activeLoans.some(l => l.startDate != null)
    remainingCapitalNow = anyHasStart
      ? aggregateLoans(activeLoans, simDateForCrd).totalRemainingCapital
      : activeLoans.reduce((s, l) => s + l.principal, 0)
  }
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
