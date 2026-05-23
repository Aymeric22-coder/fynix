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

// ─── Plafonds annuels de recettes — LF 2025 ───────────────────────────
// Ces constantes sont à réviser à chaque LF (réévaluation triennale
// indexée sur l'IRL pour le plafond longue durée — CGI art. 50-0).
// Les valeurs ci-dessous sont applicables aux revenus 2025.

/**
 * Plafond longue durée — meublé classique (hors tourisme) ET meublé de
 * tourisme CLASSÉ. Au-delà : bascule obligatoire au régime réel.
 * Réévaluation triennale indexée IRL (CGI art. 50-0).
 */
export const LMNP_MICRO_CEILING_LONG_TERM = 77_700 as const

/**
 * Plafond meublé de tourisme NON classé — LF 2025 (loi Le Meur).
 * Au-delà : bascule obligatoire au régime réel.
 */
export const LMNP_MICRO_CEILING_TOURISM_UNCLASSIFIED = 15_000 as const

/**
 * Catégories de meublé pour micro-BIC — LF 2025.
 * Chaque catégorie détermine le couple (taux d'abattement, plafond annuel).
 */
export const LMNP_MICRO_ABATTEMENTS = {
  /** Meublé classique hors tourisme — inchangé LF 2025. */
  classic:              { rate: 0.50, ceiling: LMNP_MICRO_CEILING_LONG_TERM           },
  /** Meublé de tourisme NON classé — LF 2025 : 30 % / 15 000 €. */
  tourism_unclassified: { rate: 0.30, ceiling: LMNP_MICRO_CEILING_TOURISM_UNCLASSIFIED },
  /** Meublé de tourisme classé — LF 2025 : 50 % / 77 700 €. */
  tourism_classified:   { rate: 0.50, ceiling: LMNP_MICRO_CEILING_LONG_TERM           },
} as const

export type LmnpMicroCategory = keyof typeof LMNP_MICRO_ABATTEMENTS

/**
 * V8.2 — Déduit le plafond annuel applicable à partir du seul taux
 * d'abattement déjà stocké en DB (`property.lmnp_micro_abattement_pct`).
 *
 * Mapping mécanique LF 2025 :
 *   - abattement 50 %  →  77 700 € (meublé classique OU tourisme classé :
 *                         les 2 catégories à 50 % partagent le MÊME plafond,
 *                         donc pas besoin de stocker la catégorie)
 *   - abattement 30 %  →  15 000 € (meublé de tourisme NON classé)
 *   - autres (71 %, etc., saisie libre ancienne) → 77 700 € (le plus
 *                         permissif — on ne pénalise pas une saisie
 *                         historique non standard)
 *
 * Au-delà du plafond, le calculateur expose `forcedRegimeSwitch: true`
 * et la projection le propage dans `ProjectionYear.forcedRegimeSwitch`
 * (cf. V8.1, même contrat que foncier_micro).
 */
export function resolveLmnpMicroCeiling(abattementPct: number): number {
  if (abattementPct === 30) return LMNP_MICRO_CEILING_TOURISM_UNCLASSIFIED
  return LMNP_MICRO_CEILING_LONG_TERM
}

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
