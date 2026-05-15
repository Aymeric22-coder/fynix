/**
 * Type partagé par toutes les étapes du questionnaire.
 *
 * Correspond strictement aux colonnes ajoutées dans migration 015 sur la
 * table `profiles`. Les `null` sont autorisés partout : un user qui n'a
 * pas encore rempli le wizard a tous ses champs à null.
 */

import type { Profile } from '@/types/database.types'

/**
 * Subset de Profile correspondant aux champs gérés par le questionnaire
 * (les champs identité/fiscalité hérités de migration 001 sont gérés
 * ailleurs, dans /parametres).
 */
export type QuestionnaireValues = Pick<
  Profile,
  | 'prenom' | 'age' | 'situation_familiale' | 'enfants' | 'statut_pro'
  | 'revenu_mensuel' | 'revenu_conjoint' | 'autres_revenus' | 'stabilite_revenus'
  | 'loyer' | 'autres_credits' | 'charges_fixes' | 'depenses_courantes'
  | 'epargne_mensuelle' | 'invest_mensuel' | 'enveloppes'
  | 'quiz_bourse' | 'quiz_crypto' | 'quiz_immo'
  | 'risk_1' | 'risk_2' | 'risk_3' | 'risk_4'
  | 'fire_type' | 'revenu_passif_cible' | 'age_cible' | 'priorite'
>

/** Valeurs par défaut (tout à null / tableaux vides). */
export const EMPTY_VALUES: QuestionnaireValues = {
  prenom: null, age: null, situation_familiale: null, enfants: null, statut_pro: null,
  revenu_mensuel: null, revenu_conjoint: null, autres_revenus: null, stabilite_revenus: null,
  loyer: null, autres_credits: null, charges_fixes: null, depenses_courantes: null,
  epargne_mensuelle: null, invest_mensuel: null, enveloppes: [],
  quiz_bourse: [], quiz_crypto: [], quiz_immo: [],
  risk_1: null, risk_2: null, risk_3: null, risk_4: null,
  fire_type: null, revenu_passif_cible: null, age_cible: null, priorite: null,
}
