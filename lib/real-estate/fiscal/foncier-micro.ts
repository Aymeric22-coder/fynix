/**
 * Micro-foncier (location nue, abattement forfaitaire 30 %).
 *
 * Référentiel : CGI art. 32.
 *  - Plafond : 15 000 €/an de loyers bruts (foyer fiscal).
 *    Au-delà : bascule obligatoire vers le régime réel (foncier_nu).
 *  - Imposition : loyers × 70 % × (TMI + 17,2 %).
 *  - Pas de charges déductibles, pas d'amortissement, pas de déficit possible.
 *
 * V8.1 — Le plafond CGI art. 32 porte juridiquement sur la SOMME des revenus
 * fonciers bruts du foyer fiscal ; en l'absence de contexte foyer dans
 * `SimulationInput`, on l'applique par bien (best-effort). L'UI lit
 * `ProjectionYear.forcedRegimeSwitch` et alerte l'utilisateur que le
 * régime micro n'est plus applicable cette année-là. L'agrégation foyer
 * (somme des `netRent` des biens en foncier_micro) est une amélioration
 * portfolio séparée.
 *
 * Base de calcul : on prend `netRent` (loyers encaissés = bruts moins
 * vacance) comme proxy des "loyers réellement perçus" déclarés en case 4BE,
 * choix produit verrouillé V8.1 (pas un bug).
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from './common'
import type {
  CarryForwardState,
  FiscalCalculator,
  YearAccountingInputs,
  YearTaxOutput,
} from './common'

const ABATTEMENT_PCT = 30

/** Plafond annuel CGI art. 32 — stable depuis 2002. */
export const FONCIER_MICRO_CEILING = 15_000 as const

/**
 * Construit un calculateur micro-foncier.
 *
 * @param tmiPct   TMI du foyer (en %).
 * @param ceiling  Plafond annuel de loyers bruts au-delà duquel le régime
 *                 micro n'est plus applicable. Défaut : 15 000 € (CGI art. 32).
 *                 Si dépassé, `forcedRegimeSwitch: true` est exposé pour que
 *                 la projection le propage vers `ProjectionYear` et que l'UI
 *                 alerte l'utilisateur.
 */
export function makeFoncierMicroCalculator(
  tmiPct:  number,
  ceiling: number = FONCIER_MICRO_CEILING,
): FiscalCalculator {
  return (inputs: YearAccountingInputs, state: CarryForwardState): YearTaxOutput => {
    const taxableBase = inputs.netRent * (100 - ABATTEMENT_PCT) / 100
    const taxPaid     = taxableBase * (tmiPct + PRELEVEMENTS_SOCIAUX_PCT) / 100

    const forcedRegimeSwitch = inputs.netRent > ceiling ? true : undefined

    return {
      fiscalResult: taxableBase,   // pas vraiment "résultat fiscal" mais on remplit pour le tableau
      taxableBase,
      taxPaid,
      carryForward: state,         // pas de report en micro
      ...(forcedRegimeSwitch ? { forcedRegimeSwitch } : {}),
    }
  }
}
