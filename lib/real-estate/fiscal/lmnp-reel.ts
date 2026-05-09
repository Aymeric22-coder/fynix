/**
 * LMNP réel (Loueur en Meublé Non Professionnel — régime réel).
 *
 * Mécanique propre au LMNP réel :
 *  - Toutes charges déductibles (intérêts, assurance, PNO, GLI, TF, CFE, comptable, copro,
 *    gestion, maintenance, autres)
 *  - Frais d'acquisition : "expense_y1" ou "amortized" selon réglage
 *  - Amortissements : bâti + travaux + mobilier
 *  - **Spécificité critique** : l'amortissement ne peut **pas créer ou augmenter un déficit**.
 *    L'amortissement est plafonné au "bénéfice avant amortissement", l'excédent est reporté
 *    indéfiniment dans un stock séparé (`unusedAmortStock`).
 *  - Déficit BIC (résultat avant amortissement < 0) : reportable 10 ans **uniquement
 *    sur BIC non-pro**.
 *  - Imposition : résultat fiscal positif × (TMI + 17,2 %)
 */

import {
  ageDeficits,
  consumeDeficits,
  PRELEVEMENTS_SOCIAUX_PCT,
} from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

export function makeLmnpReelCalculator(tmiPct: number): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    const totalCharges =
      inputs.pno + inputs.gli + inputs.propertyTax + inputs.cfe +
      inputs.accountant + inputs.condoFees + inputs.management +
      inputs.maintenance + inputs.other

    // Bénéfice "avant amortissement" : c'est le plafond pour l'amortissement déductible
    const profitBeforeAmort =
      inputs.netRent
      - totalCharges
      - inputs.loanInterest
      - inputs.loanInsurance
      - inputs.exceptionalFees

    // Amortissement de l'année (potentiel)
    const yearAmort = inputs.amortBuilding + inputs.amortWorks + inputs.amortFurniture
    // Stock d'amortissement non utilisé reporté des années précédentes
    const stockAmort = state.unusedAmortStock
    const totalAmortAvailable = yearAmort + stockAmort

    // Vieillissement des déficits BIC (10 ans)
    const aged = ageDeficits(state.bicDeficitsByAge)
    let bicDeficits = aged.aged

    let amortUsed:        number
    let newAmortStock:    number
    let resultAfterAmort: number

    if (profitBeforeAmort > 0) {
      // On utilise l'amortissement, plafonné au bénéfice avant amortissement
      amortUsed = Math.min(totalAmortAvailable, profitBeforeAmort)
      newAmortStock = totalAmortAvailable - amortUsed
      resultAfterAmort = profitBeforeAmort - amortUsed   // ≥ 0
    } else {
      // Pas de bénéfice avant amortissement → on n'utilise PAS l'amortissement.
      // Tout l'amortissement de l'année part en stock.
      amortUsed = 0
      newAmortStock = totalAmortAvailable
      resultAfterAmort = profitBeforeAmort   // < 0 ou = 0
    }

    let taxableBase = 0
    let taxPaid     = 0

    if (resultAfterAmort > 0) {
      // Imputation des déficits BIC reportés
      const { consumed, remaining } = consumeDeficits(bicDeficits, resultAfterAmort)
      bicDeficits = remaining
      taxableBase = Math.max(0, resultAfterAmort - consumed)
      taxPaid = taxableBase * (tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100
    } else if (resultAfterAmort < 0) {
      // Déficit BIC reportable 10 ans
      bicDeficits = [(bicDeficits[0] ?? 0) + (-resultAfterAmort), ...bicDeficits.slice(1)]
    }

    // Le "résultat fiscal" affiché dans le tableau, c'est ce qu'on déclare :
    // bénéfice après amortissement effectivement utilisé (≥ 0) OU déficit BIC (< 0)
    const fiscalResult = resultAfterAmort

    return {
      fiscalResult,
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
