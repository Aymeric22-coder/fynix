/**
 * Orchestrateur principal : génère la projection année par année à partir
 * des inputs de simulation et applique le bon calculateur fiscal.
 */

import { buildAmortizationSchedule } from './amortization'
import {
  getFiscalCalculator,
  makeInitialCarryForward,
  regimeAllowsAcquisitionFeesDeduction,
  regimeSupportsAmortization,
} from './fiscal'
import type { YearAccountingInputs } from './fiscal/common'
import type {
  AmortizationSchedule,
  ProjectionYear,
  RealRegimeParams,
  SimulationInput,
} from './types'

const FALLBACK_HORIZON_YEARS = 25

function isRealRegime(regime: SimulationInput['regime']): regime is SimulationInput['regime'] & RealRegimeParams & { kind: string } {
  return regimeSupportsAmortization(regime)
}

export function computeProjection(input: SimulationInput): {
  amortization: AmortizationSchedule | null
  projection:   ProjectionYear[]
} {
  const { property, loan, rent, charges, regime, downPayment } = input

  // ── Horizon ────────────────────────────────────────────────────────
  const loanYears = loan?.principal && loan.principal > 0 ? loan.durationYears : 0
  const horizonYears = input.horizonYears
    ?? Math.max(loanYears, FALLBACK_HORIZON_YEARS)

  // ── Schedule emprunt (peut être null si achat cash) ────────────────
  const hasLoan = !!loan && loan.principal > 0 && loan.durationYears > 0
  const amortization: AmortizationSchedule | null =
    hasLoan ? buildAmortizationSchedule(loan!) : null

  // ── Frais d'acquisition pour traitement fiscal ─────────────────────
  const totalAcquisitionFees =
    property.notaryFees +
    (loan?.bankFees ?? 0) +
    (loan?.guaranteeFees ?? 0)

  // ── Amortissements annuels (régimes réels uniquement) ──────────────
  let amortBuildingAnnual = 0
  let amortWorksAnnual    = 0
  let amortFurnitureAnnual = 0
  let amortAcqFeesAnnual  = 0
  let acqFeesAsExpenseY1  = 0

  if (isRealRegime(regime)) {
    const realRegime = regime as SimulationInput['regime'] & RealRegimeParams
    const buildingBase = property.purchasePrice * (1 - realRegime.landSharePct / 100)
    amortBuildingAnnual = realRegime.amortBuildingYears > 0
      ? buildingBase / realRegime.amortBuildingYears
      : 0
    amortWorksAnnual = realRegime.amortWorksYears > 0
      ? property.worksAmount / realRegime.amortWorksYears
      : 0
    amortFurnitureAnnual = (realRegime.amortFurnitureYears > 0 && realRegime.furnitureAmount)
      ? realRegime.furnitureAmount / realRegime.amortFurnitureYears
      : 0

    if (regimeAllowsAcquisitionFeesDeduction(regime)) {
      if (realRegime.acquisitionFeesTreatment === 'amortized') {
        // Amortis sur la même durée que le bâti (convention standard)
        amortAcqFeesAnnual = realRegime.amortBuildingYears > 0
          ? totalAcquisitionFees / realRegime.amortBuildingYears
          : 0
      } else {
        acqFeesAsExpenseY1 = totalAcquisitionFees
      }
    }
  }

  // ── Estimation initiale du bien (pour valeur nette / indexation) ───
  const initialEstimatedValue =
    property.currentEstimatedValue
    ?? (property.purchasePrice + property.worksAmount)

  // ── Calculateur fiscal ─────────────────────────────────────────────
  const calculator = getFiscalCalculator(regime)
  let carryForward = makeInitialCarryForward()

  // ── Boucle annuelle ────────────────────────────────────────────────
  const projection: ProjectionYear[] = []
  let cumulativeCashFlow = -downPayment

  for (let y = 1; y <= horizonYears; y++) {
    const rentFactor    = Math.pow(1 + rent.rentalIndexPct  / 100, y - 1)
    const chargesFactor = Math.pow(1 + charges.chargesIndexPct / 100, y - 1)
    const propertyFactor = Math.pow(1 + property.propertyIndexPct / 100, y - 1)

    const grossRent  = rent.monthlyRent * 12 * rentFactor
    // Vacance en mois équivalent → loss = monthlyRent × vacancyMonths × rentFactor
    const vacancyLoss = rent.monthlyRent * rent.vacancyMonths * rentFactor
    const netRent    = grossRent - vacancyLoss

    // GLI calculée sur netRent (même logique que la référence)
    const gli = netRent * (charges.gliPct / 100)
    // Frais de gestion calculés sur netRent
    const management = netRent * (charges.managementPct / 100)

    // Charges fixes indexées
    const fixedCharges =
      (charges.pno + charges.propertyTax + charges.cfe + charges.accountant
       + charges.condoFees + charges.maintenance + charges.other) * chargesFactor

    const totalCharges = fixedCharges + gli + management

    // Crédit
    const yearAmortRow = amortization?.years[y - 1]
    const interest        = yearAmortRow?.interest          ?? 0
    const principalRepaid = yearAmortRow?.principal         ?? 0
    const insurance       = yearAmortRow?.insurance         ?? 0
    const remainingCapital = yearAmortRow
      ? yearAmortRow.remainingCapital
      : 0   // post-crédit ou pas de crédit
    const loanPayment = interest + principalRepaid + insurance

    // Amortissements de l'année (bornés dans la durée)
    const realRegime = isRealRegime(regime)
      ? (regime as SimulationInput['regime'] & RealRegimeParams)
      : null
    const inAmortBuilding = realRegime && y <= realRegime.amortBuildingYears
      ? amortBuildingAnnual : 0
    const inAmortWorks    = realRegime && y <= realRegime.amortWorksYears
      ? amortWorksAnnual    : 0
    const inAmortFurniture = realRegime && realRegime.amortFurnitureYears > 0
      && y <= realRegime.amortFurnitureYears
      ? amortFurnitureAnnual : 0

    // Frais d'acquisition : en charges A1 (uniquement Y1) ou amortis (chaque année tant que durée bâti)
    const exceptionalFees = (y === 1) ? acqFeesAsExpenseY1 : 0
    const inAmortAcqFees  = realRegime && realRegime.acquisitionFeesTreatment === 'amortized'
      && y <= realRegime.amortBuildingYears
      ? amortAcqFeesAnnual : 0

    // Total amortissements année
    const totalYearAmort = inAmortBuilding + inAmortWorks + inAmortFurniture + inAmortAcqFees

    // Inputs comptables → calculateur fiscal
    const accInputs: YearAccountingInputs = {
      yearIndex:        y,
      netRent,
      pno:              charges.pno         * chargesFactor,
      gli,
      propertyTax:      charges.propertyTax * chargesFactor,
      cfe:              charges.cfe         * chargesFactor,
      accountant:       charges.accountant  * chargesFactor,
      condoFees:        charges.condoFees   * chargesFactor,
      management,
      maintenance:      charges.maintenance * chargesFactor,
      other:            charges.other       * chargesFactor,
      loanInterest:     interest,
      loanInsurance:    insurance,
      amortBuilding:    inAmortBuilding,
      amortWorks:       inAmortWorks,
      amortFurniture:   inAmortFurniture,
      exceptionalFees,
    }
    // Inclure les amortissements des frais d'acquisition dans le bâti pour le calcul fiscal
    accInputs.amortBuilding += inAmortAcqFees

    const tax = calculator(accInputs, carryForward)
    carryForward = tax.carryForward

    // Cash flow réel (basé sur les mouvements de trésorerie)
    const cashFlowBeforeTax = netRent - totalCharges - loanPayment
    const cashFlowAfterTax  = cashFlowBeforeTax - tax.taxPaid
    cumulativeCashFlow += cashFlowAfterTax

    // Valeur du bien à fin d'année (avec indexation depuis l'estimation initiale)
    const estimatedValue = initialEstimatedValue * propertyFactor * (1 + property.propertyIndexPct / 100)
    const netPropertyValue = estimatedValue - remainingCapital

    projection.push({
      year:              y,
      grossRent,
      vacancy:           vacancyLoss,
      netRent,
      charges:           totalCharges,
      interest,
      principalRepaid,
      insurance,
      loanPayment,
      amortizations:     totalYearAmort,
      fiscalResult:      tax.fiscalResult,
      taxableBase:       tax.taxableBase,
      taxPaid:           tax.taxPaid,
      cashFlowBeforeTax,
      cashFlowAfterTax,
      cumulativeCashFlow,
      remainingCapital,
      estimatedValue,
      netPropertyValue,
    })
  }

  return { amortization, projection }
}
