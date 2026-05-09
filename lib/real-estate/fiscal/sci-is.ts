/**
 * SCI à l'IS.
 * - Toutes charges déductibles (intérêts, assurance, PNO, GLI, TF, CFE, comptable, copro, gestion, maintenance, autres)
 * - Amortissements : bâti (hors terrain) + travaux + mobilier
 * - Frais d'acquisition : passés en charges A1 (par défaut) ou amortis (selon `acquisitionFeesTreatment`)
 * - IS : 15 % jusqu'à 42 500 € de bénéfice, 25 % au-delà
 * - Déficit reportable indéfiniment, imputable uniquement sur les bénéfices futurs de la SCI
 */

import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

/** Calcul de l'IS avec les seuils 2024+ */
export function computeIS(taxableBase: number): number {
  if (taxableBase <= 0) return 0
  const lower  = Math.min(taxableBase, 42_500) * 0.15
  const upper  = Math.max(0, taxableBase - 42_500) * 0.25
  return lower + upper
}

export const calculateSciIs: FiscalCalculator = (
  inputs: YearAccountingInputs,
  state:  CarryForwardState,
): YearTaxOutput => {
  const totalCharges =
    inputs.pno + inputs.gli + inputs.propertyTax + inputs.cfe +
    inputs.accountant + inputs.condoFees + inputs.management +
    inputs.maintenance + inputs.other

  const totalAmort = inputs.amortBuilding + inputs.amortWorks + inputs.amortFurniture

  const fiscalResult =
    inputs.netRent
    - totalCharges
    - inputs.loanInterest
    - inputs.loanInsurance
    - totalAmort
    - inputs.exceptionalFees

  // Imputation du déficit reporté
  const carriedBefore = state.isDeficitCarried   // ≤ 0 (déficit) ou 0
  let baseAfterCarry = fiscalResult + carriedBefore

  let newCarried = 0
  let taxableBase = 0
  let is = 0

  if (baseAfterCarry >= 0) {
    taxableBase = baseAfterCarry
    is = computeIS(taxableBase)
    newCarried = 0
  } else {
    taxableBase = 0
    is = 0
    newCarried = baseAfterCarry   // négatif, à reporter
  }

  return {
    fiscalResult,
    taxableBase,
    taxPaid: is,
    carryForward: {
      ...state,
      isDeficitCarried: newCarried,
    },
  }
}
