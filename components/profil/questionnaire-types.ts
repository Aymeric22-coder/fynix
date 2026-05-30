/**
 * Type partagé par toutes les étapes du questionnaire.
 *
 * Correspond strictement aux colonnes ajoutées dans migration 015 sur la
 * table `profiles`. Les `null` sont autorisés partout : un user qui n'a
 * pas encore rempli le wizard a tous ses champs à null.
 */

import type { Profile } from '@/types/database.types'

/**
 * Subset de Profile correspondant aux champs gérés par le questionnaire.
 *
 * CS1 : `tmi_rate` est désormais saisi via Step9 du wizard (en plus de
 * /parametres qui continue de fonctionner pour le moment). C'est le SEUL
 * champ « fiscalité » présent dans le wizard ; les autres
 * (fiscal_situation, professional_income_eur, foyer_fiscal_parts) sont
 * morts en aval et retirés progressivement.
 */
export type QuestionnaireValues = Pick<
  Profile,
  | 'prenom' | 'age' | 'situation_familiale' | 'enfants' | 'statut_pro'
  | 'revenu_mensuel' | 'revenu_conjoint' | 'autres_revenus' | 'stabilite_revenus'
  | 'loyer' | 'autres_credits' | 'charges_fixes' | 'depenses_courantes'
  | 'epargne_mensuelle' | 'enveloppes'
  | 'quiz_bourse' | 'quiz_crypto' | 'quiz_immo'
  | 'quiz_self_declared_domains'
  | 'risk_1' | 'risk_2' | 'risk_3' | 'risk_4'
  | 'fire_type' | 'revenu_passif_cible' | 'age_cible' | 'priorite'
  | 'tmi_rate'
>

/** Valeurs par défaut (tout à null / tableaux vides). */
export const EMPTY_VALUES: QuestionnaireValues = {
  prenom: null, age: null, situation_familiale: null, enfants: null, statut_pro: null,
  revenu_mensuel: null, revenu_conjoint: null, autres_revenus: null, stabilite_revenus: null,
  loyer: null, autres_credits: null, charges_fixes: null, depenses_courantes: null,
  epargne_mensuelle: null, enveloppes: [],
  quiz_bourse: [], quiz_crypto: [], quiz_immo: [],
  quiz_self_declared_domains: [],
  risk_1: null, risk_2: null, risk_3: null, risk_4: null,
  fire_type: null, revenu_passif_cible: null, age_cible: null, priorite: null,
  tmi_rate: null,
}
