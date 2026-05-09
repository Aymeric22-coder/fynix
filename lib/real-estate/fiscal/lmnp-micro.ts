/**
 * LMNP micro-BIC (location meublée — régime forfaitaire).
 * - Abattement forfaitaire 50 % (location meublée classique)
 *   ou 71 % (meublé de tourisme classé) — paramétrable.
 * - Plafond : 77 700 €/an (188 700 € si meublé classé) — non bloquant en Phase 1.
 * - Pas de charges déductibles, pas d'amortissement, pas de déficit possible.
 * - Imposition : loyers × (1 − abattement) × (TMI + 17,2 %)
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

export function makeLmnpMicroCalculator(
  tmiPct: number,
  abattementPct: number = 50,
): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    const taxableBase = inputs.netRent * (100 - abattementPct) / 100
    const taxPaid     = taxableBase * (tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100

    return {
      fiscalResult: taxableBase,
      taxableBase,
      taxPaid,
      carryForward: state,
    }
  }
}
