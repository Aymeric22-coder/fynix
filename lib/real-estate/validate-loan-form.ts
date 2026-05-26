/**
 * V10.1 — ROB-101 / ROB-102 : helpers de validation partagés entre le wizard
 * de création de bien (`app/(app)/immobilier/nouveau/page.tsx`) et le
 * formulaire crédit (`components/real-estate/credit-form.tsx`).
 *
 * Pures : pas de React, pas de DOM, pas de date « now ». Importables côté
 * serveur, client et tests unitaires.
 *
 * Note : la validation moteur (`lib/real-estate/validate.ts`) reste séparée
 * — elle valide un `SimulationInput` complet pour le calcul, alors qu'ici on
 * valide la SAISIE UTILISATEUR (bornes absurdes, dates incohérentes).
 */

/**
 * Plafond du taux nominal annuel.
 * Largement au-dessus du taux d'usure BdF (~6 % Q1 2026), mais bloque les
 * saisies absurdes type « 999 % ».
 */
export const MAX_LOAN_RATE_PCT = 20

/**
 * Plafond du taux d'assurance emprunteur annuel.
 * 3 % laisse de la marge pour les profils à risque aggravé de santé / âgés
 * (~1,5 % observé), sans laisser passer les typos.
 */
export const MAX_INSURANCE_RATE_PCT = 3

/**
 * Valide les bornes d'un couple (taux nominal, taux assurance).
 * Retourne le premier message d'erreur rencontré, ou `null` si tout est OK.
 */
export function validateLoanRates(
  loanRatePct:      number | null | undefined,
  insuranceRatePct: number | null | undefined,
): string | null {
  if (loanRatePct == null || loanRatePct < 0) {
    return 'Le taux nominal est requis'
  }
  if (loanRatePct > MAX_LOAN_RATE_PCT) {
    return `Taux nominal entre 0 et ${MAX_LOAN_RATE_PCT} %.`
  }
  if (
    insuranceRatePct != null &&
    (insuranceRatePct < 0 || insuranceRatePct > MAX_INSURANCE_RATE_PCT)
  ) {
    return `Taux d'assurance entre 0 et ${MAX_INSURANCE_RATE_PCT} %.`
  }
  return null
}

/**
 * Valide qu'une date de début de prêt n'est pas antérieure à la date
 * d'acquisition du bien (l'égalité est autorisée : cas normal d'une
 * signature de prêt le jour de la signature notariale).
 *
 * Les deux dates sont attendues au format ISO `YYYY-MM-DD` — la comparaison
 * lexicographique de strings ISO est ordonnée chronologiquement.
 */
export function validateLoanStartVsAcquisition(
  loanStartDate:   string | null | undefined,
  acquisitionDate: string | null | undefined,
): string | null {
  if (loanStartDate && acquisitionDate && loanStartDate < acquisitionDate) {
    return "La date de début du prêt ne peut pas être antérieure à la date d'acquisition."
  }
  return null
}
