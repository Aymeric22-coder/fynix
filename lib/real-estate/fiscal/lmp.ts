/**
 * LMP (Loueur en Meublé Professionnel).
 * Mêmes règles fiscales que LMNP réel pour le calcul du résultat,
 * mais :
 *  - Cotisations SSI (Sécurité Sociale des Indépendants) à la place des prélèvements sociaux.
 *    Taux indicatif paramétrable (défaut 35 %).
 *  - Déficit imputable sur revenu global SANS limite (pas de plafond 10 700 €).
 *
 * Phase 1 : on calcule comme LMNP réel mais on remplace 17,2 % PS par `ssiRatePct`.
 * Le déficit imputable sur revenu global se traduit par une réduction d'impôt
 * équivalente (déficit × TMI), équivalent économique acceptable.
 */

import {
  ageDeficits,
} from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

export function makeLmpCalculator(
  tmiPct:     number,
  ssiRatePct: number = 35,
): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    const totalCharges =
      inputs.pno + inputs.gli + inputs.propertyTax + inputs.cfe +
      inputs.accountant + inputs.condoFees + inputs.management +
      inputs.maintenance + inputs.other

    const profitBeforeAmort =
      inputs.netRent
      - totalCharges
      - inputs.loanInterest
      - inputs.loanInsurance
      - inputs.exceptionalFees

    const yearAmort = inputs.amortBuilding + inputs.amortWorks + inputs.amortFurniture
    const stockAmort = state.unusedAmortStock
    const totalAmortAvailable = yearAmort + stockAmort

    // En LMP, le déficit n'est pas plafonné, mais on garde quand même la logique
    // "amortissement non créateur de déficit" (règle générale BIC).
    let amortUsed:        number
    let newAmortStock:    number
    let resultAfterAmort: number

    if (profitBeforeAmort > 0) {
      amortUsed = Math.min(totalAmortAvailable, profitBeforeAmort)
      newAmortStock = totalAmortAvailable - amortUsed
      resultAfterAmort = profitBeforeAmort - amortUsed
    } else {
      amortUsed = 0
      newAmortStock = totalAmortAvailable
      resultAfterAmort = profitBeforeAmort
    }

    // Vieillissement des déficits BIC
    const aged = ageDeficits(state.bicDeficitsByAge)
    let bicDeficits = aged.aged

    let taxableBase = 0
    let taxPaid     = 0

    if (resultAfterAmort > 0) {
      // Imputation des déficits BIC reportés (FIFO)
      let remaining = resultAfterAmort
      const arr = bicDeficits.slice()
      for (let i = arr.length - 1; i >= 0 && remaining > 0; i--) {
        const slot = arr[i] ?? 0
        const take = Math.min(slot, remaining)
        arr[i] = slot - take
        remaining -= take
      }
      bicDeficits = arr
      taxableBase = remaining
      // En LMP : TMI + cotisations SSI (PAS de prélèvements sociaux)
      taxPaid = taxableBase * (tmiPct + ssiRatePct) / 100
    } else if (resultAfterAmort < 0) {
      // Déficit imputable sur revenu global → réduction d'impôt = déficit × TMI
      const reduction = (-resultAfterAmort) * tmiPct / 100
      taxPaid = -reduction
      // Le déficit ainsi imputé n'est PAS reporté (il a été utilisé)
      // mais le mécanisme fin (ce qui dépasse le revenu global → reportable)
      // dépend du revenu global de l'utilisateur — non simulé en Phase 1.
    }

    return {
      fiscalResult: resultAfterAmort,
      taxableBase,
      taxPaid,
      carryForward: {
        ...state,
        bicDeficitsByAge: bicDeficits,
        unusedAmortStock: newAmortStock,
      },
    }
  }
}
