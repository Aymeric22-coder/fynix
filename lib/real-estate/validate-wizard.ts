/**
 * V12 — CAS-RP-001 / CAS-WIZ-LOT-001 : helpers du wizard de création d'un
 * bien immobilier qui dépendent du `usage_type`.
 *
 * Pures (pas de React, pas d'I/O). Importables côté serveur + tests.
 *
 * Périmètre :
 *   - `isRentalWizardUsage(u)` : un bien locatif (long/short/mixed) déclenche
 *     l'étape « Régime fiscal » et l'étape « Lots & loyers ». Sinon (RP, RS)
 *     ces deux étapes ne s'appliquent pas.
 *   - `wizardStepsFor(u)` : retourne la liste des étapes à afficher dans le
 *     Stepper (5 pour locatif, 4 pour non-locatif).
 *   - `requiresFiscalRegimeStep(u)` : pour `validateStep(4)` côté wizard —
 *     un non-locatif ne doit pas exiger de régime fiscal (il sera persisté
 *     en `null` au POST).
 *
 * Définition « locatif » alignée sur `isRentalUsage(usage_type)` du moteur
 * (cf. types/database.types.ts) : `long_term_rental`, `short_term_rental`,
 * `mixed_use`. RP et RS sont non-locatives.
 */

export interface WizardStep {
  id:        string
  label:     string
  optional?: boolean
}

/**
 * 5 étapes — bien locatif.
 *
 * Ordre figé : Identification → Acquisition → Crédit → Régime fiscal →
 * Lots & loyers. Identique au wizard historique avant V12.
 */
export const STEPS_RENTAL: ReadonlyArray<WizardStep> = [
  { id: '1', label: 'Identification' },
  { id: '2', label: 'Acquisition' },
  { id: '3', label: 'Crédit', optional: true },
  { id: '4', label: 'Régime fiscal' },
  { id: '5', label: 'Lots & loyers', optional: true },
]

/**
 * 4 étapes — bien non-locatif (RP / RS).
 *
 * L'étape 4 « Récapitulatif » REMPLACE « Régime fiscal » + « Lots & loyers »
 * (ces deux notions ne s'appliquent pas à une résidence personnelle).
 * Sert d'écran de revue avant submit — pas de champ obligatoire dedans.
 */
export const STEPS_NON_RENTAL: ReadonlyArray<WizardStep> = [
  { id: '1', label: 'Identification' },
  { id: '2', label: 'Acquisition' },
  { id: '3', label: 'Crédit', optional: true },
  { id: '4', label: 'Récapitulatif' },
]

const RENTAL_USAGES = new Set([
  'long_term_rental',
  'short_term_rental',
  'mixed_use',
])

/**
 * Un `usage_type` est-il locatif (génère des loyers / une rentabilité) ?
 * Toute valeur non-string ou non reconnue retourne `false` (fallback prudent
 * → on n'affiche pas d'étape fiscale par défaut, on demande explicitement).
 */
export function isRentalWizardUsage(usageType: string | null | undefined): boolean {
  return typeof usageType === 'string' && RENTAL_USAGES.has(usageType)
}

/** Retourne la liste des étapes à afficher selon le `usage_type` du draft. */
export function wizardStepsFor(usageType: string | null | undefined): ReadonlyArray<WizardStep> {
  return isRentalWizardUsage(usageType) ? STEPS_RENTAL : STEPS_NON_RENTAL
}

/**
 * Le wizard doit-il exiger un `fiscal_regime` à l'étape 4 ?
 * Consommé par `validateStep(4)`. `false` ⇒ champ ignoré + persisté `null`.
 */
export function requiresFiscalRegimeStep(usageType: string | null | undefined): boolean {
  return isRentalWizardUsage(usageType)
}
