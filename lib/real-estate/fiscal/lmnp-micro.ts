/**
 * LMNP micro-BIC (location meublée — régime forfaitaire).
 *
 * Loi de Finances 2025 (art. 50-0 CGI modifié) :
 *  - Meublé classique (hors tourisme) : abattement 50 %, plafond 77 700 €
 *  - Meublé de tourisme NON classé    : abattement 30 %, plafond 15 000 €
 *  - Meublé de tourisme classé        : abattement 50 %, plafond 77 700 €
 *
 * Avant LF 2025 : non classé 50 % / 77 700 €, classé 71 % / 188 700 €.
 *
 * - Pas de charges déductibles, pas d'amortissement, pas de déficit possible.
 * - Imposition : loyers × (1 − abattement) × (TMI + 17,2 %)
 * - Dépassement du plafond → basculement obligatoire au régime réel
 *   (signalé via `forcedRegimeSwitch: true`).
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

/**
 * Catégories de meublé pour micro-BIC — LF 2025.
 * Chaque catégorie détermine le couple (taux d'abattement, plafond annuel).
 */
export const LMNP_MICRO_ABATTEMENTS = {
  /** Meublé classique hors tourisme — inchangé LF 2025. */
  classic:              { rate: 0.50, ceiling: 77_700  },
  /** Meublé de tourisme NON classé — LF 2025 : 30 % / 15 000 €. */
  tourism_unclassified: { rate: 0.30, ceiling: 15_000  },
  /** Meublé de tourisme classé — LF 2025 : 50 % / 77 700 €. */
  tourism_classified:   { rate: 0.50, ceiling: 77_700  },
} as const

export type LmnpMicroCategory = keyof typeof LMNP_MICRO_ABATTEMENTS

/**
 * Construit un calculateur micro-BIC.
 *
 * @param tmiPct         Tranche marginale d'imposition de l'associé (en %).
 * @param abattementPct  Taux d'abattement forfaitaire (en %, ex 50 ou 30).
 * @param ceiling        Plafond annuel de recettes au-delà duquel le régime
 *                       micro n'est plus applicable. Si non fourni, le plafond
 *                       n'est pas vérifié (cas saisie libre / rétrocompatible).
 */
export function makeLmnpMicroCalculator(
  tmiPct: number,
  abattementPct: number = 50,
  ceiling?: number,
): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    const taxableBase = inputs.netRent * (100 - abattementPct) / 100
    const taxPaid     = taxableBase * (tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100

    // Si on a un plafond et que les loyers le dépassent, on signale
    // un basculement forcé vers le régime réel.
    const forcedRegimeSwitch =
      ceiling !== undefined && inputs.netRent > ceiling ? true : undefined

    return {
      fiscalResult: taxableBase,
      taxableBase,
      taxPaid,
      carryForward: state,
      ...(forcedRegimeSwitch ? { forcedRegimeSwitch } : {}),
    }
  }
}
