/**
 * Dispatcher fiscal : transforme un FiscalRegime en FiscalCalculator.
 */

import type { FiscalRegime } from '../types'
import type { FiscalCalculator } from './common'
import { calculateSciIs } from './sci-is'
import { makeFoncierReelCalculator } from './foncier-reel'
import { makeFoncierMicroCalculator } from './foncier-micro'
import { makeSciIrCalculator } from './sci-ir'
import { makeLmnpReelCalculator } from './lmnp-reel'
import { makeLmnpMicroCalculator, resolveLmnpMicroCeiling } from './lmnp-micro'
import { makeLmpCalculator } from './lmp'

export function getFiscalCalculator(regime: FiscalRegime): FiscalCalculator {
  switch (regime.kind) {
    case 'sci_is':        return calculateSciIs
    case 'sci_ir':        return makeSciIrCalculator(regime.tmiPct)
    case 'lmnp_reel':     return makeLmnpReelCalculator(regime.tmiPct)
    case 'lmnp_micro':    return makeLmnpMicroCalculator(
                            regime.tmiPct,
                            regime.abattementPct,
                            // V8.2 — BUG-D1-M06 : plafond dérivé de l'abattement
                            // (les 2 catégories à 50 % partagent le même plafond
                            // 77 700 €, donc pas besoin de stocker la catégorie).
                            resolveLmnpMicroCeiling(regime.abattementPct),
                          )
    case 'lmp':           return makeLmpCalculator(regime.tmiPct, regime.ssiRatePct)
    case 'foncier_nu':    return makeFoncierReelCalculator(regime.tmiPct)
    case 'foncier_micro': return makeFoncierMicroCalculator(regime.tmiPct)
  }
}

/**
 * Indique si le régime supporte les amortissements (régimes "réels" assimilés BIC ou IS).
 */
export function regimeSupportsAmortization(regime: FiscalRegime): boolean {
  return regime.kind === 'sci_is'
      || regime.kind === 'lmnp_reel'
      || regime.kind === 'lmp'
}

/**
 * Indique si les frais d'acquisition sont déductibles (en charges A1 ou amortis).
 */
export function regimeAllowsAcquisitionFeesDeduction(regime: FiscalRegime): boolean {
  return regime.kind === 'sci_is'
      || regime.kind === 'lmnp_reel'
      || regime.kind === 'lmp'
}

export { PRELEVEMENTS_SOCIAUX_PCT } from './common'
export type {
  YearAccountingInputs,
  YearTaxOutput,
  CarryForwardState,
  FiscalCalculator,
} from './common'
export { makeInitialCarryForward } from './common'
