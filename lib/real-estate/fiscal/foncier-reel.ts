/**
 * Foncier réel (régime "réel" sur revenus fonciers — location nue).
 * - Charges déductibles : intérêts d'emprunt, assurance emprunteur, PNO, TF, GLI, gestion,
 *   copropriété non récupérable, maintenance/travaux d'entretien-réparation-amélioration.
 *   (Pas de CFE — location nue ne relève pas de la CFE.)
 * - Pas d'amortissement.
 * - Frais d'acquisition NON déductibles (le réglage `acquisitionFeesTreatment` est ignoré).
 * - Déficit foncier (hors intérêts) imputable sur le revenu global jusqu'à 10 700 €/an,
 *   excédent reportable 10 ans sur revenus fonciers uniquement.
 *   Les intérêts d'emprunt génèrent un déficit imputable uniquement sur revenus fonciers (10 ans).
 * - Imposition : revenus fonciers nets × (TMI + 17,2 %)
 *
 * Phase 1 simplification : on calcule l'impôt comme (résultat positif) × (TMI + 17,2 %)
 * et on impute les déficits reportés sur les bénéfices fonciers futurs.
 * Le mécanisme "10 700 € sur revenu global" est implémenté comme une **réduction d'impôt
 * équivalente** (le contribuable paie 10 700 × TMI de moins sur son revenu global) —
 * approximation acceptable et standard dans les simulateurs.
 */

import { ageDeficits, consumeDeficits, PRELEVEMENTS_SOCIAUX_PCT } from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

const FONCIER_DEFICIT_GLOBAL_CAP = 10_700

export function makeFoncierReelCalculator(tmiPct: number): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    const deductibleCharges =
      inputs.pno + inputs.gli + inputs.propertyTax +
      inputs.accountant + inputs.condoFees + inputs.management +
      inputs.maintenance + inputs.other
    // CFE non applicable, frais d'acquisition non déductibles → ignorés
    // Intérêts ET assurance emprunteur déductibles des revenus fonciers
    const interestAndInsurance = inputs.loanInterest + inputs.loanInsurance

    const fiscalResult =
      inputs.netRent - deductibleCharges - interestAndInsurance

    // Vieillissement des déficits fonciers reportés
    const aged = ageDeficits(state.foncierDeficitsByAge)
    let foncierDeficits = aged.aged

    let taxableBase = 0
    let taxPaid     = 0
    let globalIncomeReduction = 0   // imputation sur revenu global (≤ 10 700)

    if (fiscalResult >= 0) {
      // Imputation des déficits reportés sur le bénéfice
      const { consumed, remaining } =
        consumeDeficits(foncierDeficits, fiscalResult)
      foncierDeficits = remaining
      taxableBase = Math.max(0, fiscalResult - consumed)
      taxPaid = taxableBase * (tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100
    } else {
      // Déficit de l'année.
      // Part imputable sur revenu global = min(|déficit hors intérêts|, 10 700)
      // En pratique : déficit total = netRent - charges - interestAndInsurance.
      // Le "déficit hors intérêts" se calcule comme (charges - netRent) si charges > netRent,
      // c'est-à-dire la part de déficit due aux charges après imputation par les loyers.
      const deficitTotal = -fiscalResult  // positif
      const deficitHorsInterest = Math.max(0, deductibleCharges - inputs.netRent)
      const deficitDuToInterest = deficitTotal - deficitHorsInterest

      const onGlobalIncome = Math.min(deficitHorsInterest, FONCIER_DEFICIT_GLOBAL_CAP)
      const onFoncierFuture = deficitTotal - onGlobalIncome   // tout le reste (intérêts + excédent)

      // Réduction d'impôt équivalente sur revenu global (TMI uniquement, pas PS)
      globalIncomeReduction = onGlobalIncome * tmiPct / 100
      taxPaid = -globalIncomeReduction   // crédit d'impôt en faveur du contribuable

      // L'excédent (onFoncierFuture) part dans la file FIFO à l'âge 0
      foncierDeficits = [(foncierDeficits[0] ?? 0) + onFoncierFuture, ...foncierDeficits.slice(1)]
    }

    return {
      fiscalResult,
      taxableBase,
      taxPaid,
      carryForward: {
        ...state,
        foncierDeficitsByAge: foncierDeficits,
      },
    }
  }
}
