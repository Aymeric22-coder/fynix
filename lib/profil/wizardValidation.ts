/**
 * Validation pure du wizard profil (Tâche B).
 *
 * Séparée de ProfilQuestionnaire.tsx pour :
 *  - rester testable en isolation (vitest env: node, pas de JSX),
 *  - être réutilisable côté serveur si on veut un jour valider côté API.
 */

import type { QuestionnaireValues } from '@/components/profil/questionnaire-types'

/** Étapes critiques : impossible de passer sans remplir les champs requis. */
export const REQUIRED_STEPS: ReadonlyArray<number> = [1, 8]

/** Étapes non critiques : bouton "Passer cette étape" disponible. */
export const SKIPPABLE_STEPS: ReadonlyArray<number> = [2, 3, 6, 7]

/**
 * Liste des champs manquants pour l'étape donnée. Vide = étape valide.
 *
 * Critères par étape :
 *  - 1 (identité)    : âge, situation_familiale, statut_pro
 *  - 8 (FIRE)        : fire_type, revenu_passif_cible, age_cible
 *  - 2/3/4/5/6/7     : aucun champ obligatoire (skippable ou facultatif)
 *
 * Les valeurs 0 sont considérées comme "remplies" : si l'utilisateur a
 * saisi un revenu de 0 ou un âge de 0, on respecte ce choix explicite et
 * on ne demande pas de le re-remplir.
 */
export function missingFields(step: number, v: QuestionnaireValues): string[] {
  const out: string[] = []
  if (step === 1) {
    if (v.age === null || v.age === undefined)                          out.push('âge')
    if (!v.situation_familiale)                                         out.push('situation familiale')
    if (!v.statut_pro)                                                  out.push('statut professionnel')
  } else if (step === 8) {
    if (!v.fire_type)                                                   out.push('type de FIRE')
    if (v.revenu_passif_cible === null
        || v.revenu_passif_cible === undefined)                         out.push('revenu passif cible')
    if (v.age_cible === null || v.age_cible === undefined)              out.push('âge cible FIRE')
  }
  return out
}
