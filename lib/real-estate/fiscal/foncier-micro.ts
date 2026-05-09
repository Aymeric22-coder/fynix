/**
 * Micro-foncier (location nue, abattement forfaitaire 30 %).
 * - Plafond : 15 000 €/an de loyers bruts (au-delà → bascule auto en réel)
 * - Imposition : loyers bruts × 70 % × (TMI + 17,2 %)
 * - Pas de charges déductibles, pas d'amortissement, pas de déficit possible.
 *
 * En Phase 1 on n'applique pas le bascule automatique : si l'utilisateur a choisi
 * micro-foncier, on calcule micro-foncier même au-delà de 15 000 €. Une note UI
 * informera l'utilisateur du dépassement éventuel.
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

const ABATTEMENT_PCT = 30

export function makeFoncierMicroCalculator(tmiPct: number): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    // Base imposable = loyers bruts (PAS netRent — micro = sur les loyers déclarés)
    // En pratique on prend grossRent ; ici on a netRent, on l'utilise comme proxy de l'encaissé
    // (vacance déjà déduite — plus juste pour la simulation cash flow)
    const taxableBase = inputs.netRent * (100 - ABATTEMENT_PCT) / 100
    const taxPaid     = taxableBase * (tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100

    return {
      fiscalResult: taxableBase,   // pas vraiment "résultat fiscal" mais on remplit pour le tableau
      taxableBase,
      taxPaid,
      carryForward: state,         // pas de report en micro
    }
  }
}
