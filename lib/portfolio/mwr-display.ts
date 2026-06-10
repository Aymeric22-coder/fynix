/**
 * Helper d'affichage du MWR (SPRINT 2).
 *
 * Décide, à partir d'un `MwrDetailed`, quelle valeur montrer et avec quel
 * libellé contextuel — toute la logique reste ici (la lib), l'UI ne fait que
 * consommer `MwrDisplay`.
 *
 * Règle de bascule (cf. `MWR_ANNUALIZATION_THRESHOLD_DAYS`) :
 *   - periodDays >= 180 → valeur ANNUALISÉE, libellé « annualisé »
 *   - periodDays  < 180 → valeur ABSOLUE de la période, libellé « sur N… »
 *
 * Format du libellé période :
 *   - periodDays  < 60 → « sur N j »      (ex. « sur 14 j »)
 *   - periodDays >= 60 → « sur N mois »   (round periodDays/30, ex. 60 j → « sur 2 mois »)
 */

import { MWR_ANNUALIZATION_THRESHOLD_DAYS, type MwrDetailed } from './analytics'

export interface MwrDisplay {
  /** Valeur à afficher (décimal) : absolue si fenêtre courte, sinon annualisée. */
  value: number
  /** true si `value` est annualisée (fenêtre ≥ seuil), false si absolue. */
  isAnnualized: boolean
  /** Libellé contextuel prêt à afficher : « annualisé », « sur 14 j », « sur 2 mois ». */
  periodLabel: string
}

/** Seuil (jours) en dessous duquel on passe de « sur N j » à « sur N mois ». */
const MONTHS_LABEL_MIN_DAYS = 60

/**
 * Construit le libellé contextuel d'une période MWR.
 *
 * @param periodDays   durée couverte (jours)
 * @param isAnnualized si true → « annualisé », sinon « sur N j » / « sur N mois »
 */
export function formatMwrPeriodLabel(periodDays: number, isAnnualized: boolean): string {
  if (isAnnualized) return 'annualisé'
  if (periodDays < MONTHS_LABEL_MIN_DAYS) return `sur ${periodDays} j`
  const months = Math.round(periodDays / 30)
  return `sur ${months} mois`
}

/**
 * Résout l'affichage MWR à partir du résultat détaillé.
 *
 * @returns `null` si `detailed` est null (MWR non calculable), sinon la valeur
 *          + le flag d'annualisation + le libellé prêt pour l'UI.
 */
export function resolveMwrDisplay(detailed: MwrDetailed | null): MwrDisplay | null {
  if (detailed === null) return null
  const isAnnualized = detailed.periodDays >= MWR_ANNUALIZATION_THRESHOLD_DAYS
  const value = isAnnualized ? detailed.annualized : detailed.absolute
  return {
    value,
    isAnnualized,
    periodLabel: formatMwrPeriodLabel(detailed.periodDays, isAnnualized),
  }
}
