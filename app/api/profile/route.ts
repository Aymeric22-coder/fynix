/**
 * GET /api/profile  : renvoie le profile complet de l'utilisateur courant.
 * PUT /api/profile  : met à jour les colonnes du questionnaire et marque
 *                     `profile_completed_at = NOW()` (sentinel de complétion).
 *
 * Sécurité : RLS sur la table `profiles` filtre déjà par id = auth.uid().
 * On reste sur withAuth pour récupérer le user et appliquer eq('id', user.id)
 * en ceinture-bretelles (defense in depth).
 *
 * Pas de validation exhaustive : le wizard front calibre déjà les inputs.
 * La DB a des CHECK constraints (>=0, age dans bornes) qui bloquent les
 * valeurs aberrantes. On laisse remonter l'erreur Postgres en cas de
 * violation.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database.types'

type WritableFields = Omit<Profile,
  | 'id' | 'created_at' | 'updated_at' | 'profile_completed_at'
  | 'display_name' | 'reference_currency' | 'tmi_rate' | 'fiscal_situation'
>

export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})

export const PUT = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Partial<WritableFields>>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()

  // Liste blanche stricte : on ne laisse passer QUE les champs du questionnaire.
  // Évite qu'un client puisse écrire display_name / tmi_rate / fiscal_situation
  // (gérés ailleurs) ou créer/modifier id/timestamps.
  const allowed: (keyof WritableFields)[] = [
    'prenom', 'age', 'situation_familiale', 'enfants', 'statut_pro',
    'revenu_mensuel', 'revenu_conjoint', 'autres_revenus', 'stabilite_revenus',
    'loyer', 'autres_credits', 'charges_fixes', 'depenses_courantes',
    'epargne_mensuelle', 'invest_mensuel', 'enveloppes',
    'quiz_bourse', 'quiz_crypto', 'quiz_immo',
    'risk_1', 'risk_2', 'risk_3', 'risk_4',
    'fire_type', 'revenu_passif_cible', 'age_cible', 'priorite',
    'wizard_step_completed',
  ]

  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  // Marqueur de complétion : timestamp de la dernière soumission.
  update['profile_completed_at'] = new Date().toISOString()
  // Wizard final = étape 8 atteinte.
  update['wizard_step_completed'] = 8

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})

/**
 * PATCH /api/profile — sauvegarde INTERMEDIAIRE pendant le wizard.
 *
 * Différences avec PUT :
 *  - NE met PAS `profile_completed_at` (le wizard n'est pas terminé)
 *  - Accepte `wizard_step_completed` pour suivre la progression
 *  - Toutes les autres colonnes sont écrites uniquement si présentes
 *
 * Permet à l'utilisateur de revenir reprendre le questionnaire là où il
 * l'avait laissé.
 */
export const PATCH = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Partial<WritableFields> & { wizard_step_completed?: number }>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()

  const allowed: (keyof WritableFields)[] = [
    'prenom', 'age', 'situation_familiale', 'enfants', 'statut_pro',
    'revenu_mensuel', 'revenu_conjoint', 'autres_revenus', 'stabilite_revenus',
    'loyer', 'autres_credits', 'charges_fixes', 'depenses_courantes',
    'epargne_mensuelle', 'invest_mensuel', 'enveloppes',
    'quiz_bourse', 'quiz_crypto', 'quiz_immo',
    'risk_1', 'risk_2', 'risk_3', 'risk_4',
    'fire_type', 'revenu_passif_cible', 'age_cible', 'priorite',
    'wizard_step_completed',
  ]

  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  if (Object.keys(update).length === 0) return err('Aucune donnée à mettre à jour', 400)

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})
