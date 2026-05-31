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

import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database.types'

// CS4 — Boussole d'objectifs 4 axes : validation stricte JSONB.
// 4 axes 0-100. Tout autre forme = rejet (pas de coercition silencieuse).
const ObjectifsAxesSchema = z.object({
  rendement:    z.number().int().min(0).max(100),
  securite:     z.number().int().min(0).max(100),
  optimisation: z.number().int().min(0).max(100),
  transmission: z.number().int().min(0).max(100),
}).strict()

/** Valide `objectifs_axes` si présent dans le body. Retourne null si invalide
 *  (avec message), ou la valeur typée (incluant null explicite = reset axes). */
function validateObjectifsAxes(
  value: unknown,
): { ok: true; value: z.infer<typeof ObjectifsAxesSchema> | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null }
  const parsed = ObjectifsAxesSchema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: `objectifs_axes invalide : ${parsed.error.issues.map((i) => i.message).join(', ')}` }
  }
  return { ok: true, value: parsed.data }
}

// CS1 — `tmi_rate` est désormais saisissable via wizard (Step 4 post-CS10) ET /parametres.
// Retiré de l'Omit pour autoriser l'écriture via cette route. Les autres
// champs « gérés ailleurs » (display_name, reference_currency) restent exclus.
// Consolidation 1 — `fiscal_situation` DROP COLUMN (migration 052), retiré de l'Omit.
type WritableFields = Omit<Profile,
  | 'id' | 'created_at' | 'updated_at' | 'profile_completed_at'
  | 'display_name' | 'reference_currency'
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
  // Évite qu'un client puisse écrire display_name (géré ailleurs) ou
  // créer/modifier id/timestamps.
  // CS1 — tmi_rate est désormais saisissable via wizard (Step9) ET /parametres.
  const allowed: (keyof WritableFields)[] = [
    'prenom', 'age', 'situation_familiale', 'enfants', 'statut_pro',
    'revenu_mensuel', 'revenu_conjoint', 'autres_revenus', 'stabilite_revenus',
    'loyer', 'autres_credits', 'charges_fixes', 'depenses_courantes',
    'epargne_mensuelle', 'enveloppes',
    'quiz_bourse', 'quiz_crypto', 'quiz_immo', 'quiz_self_declared_domains',
    'risk_1', 'risk_2', 'risk_3', 'risk_4',
    'fire_type', 'revenu_passif_cible', 'age_cible', 'priorite',
    'tmi_rate',
    // CS5 — statut propriétaire RP saisi en Step10.
    'proprietaire_rp_status',
    // CS4 — Boussole 4 axes (jsonb). Validation Zod ci-dessous AVANT update.
    'objectifs_axes',
    'wizard_step_completed',
  ]

  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  // CS4 — Validation Zod stricte de objectifs_axes (jsonb : pas de CHECK DB).
  if ('objectifs_axes' in update) {
    const res = validateObjectifsAxes(update['objectifs_axes'])
    if (!res.ok) return err(res.error, 400)
    update['objectifs_axes'] = res.value
  }

  // Marqueur de complétion : timestamp de la dernière soumission.
  update['profile_completed_at'] = new Date().toISOString()
  // CS5 — wizard final = étape 10 atteinte (« Tes projets de vie » ajoutée).
  update['wizard_step_completed'] = 10

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

  // CS1 — tmi_rate ajouté (idem PUT).
  const allowed: (keyof WritableFields)[] = [
    'prenom', 'age', 'situation_familiale', 'enfants', 'statut_pro',
    'revenu_mensuel', 'revenu_conjoint', 'autres_revenus', 'stabilite_revenus',
    'loyer', 'autres_credits', 'charges_fixes', 'depenses_courantes',
    'epargne_mensuelle', 'enveloppes',
    'quiz_bourse', 'quiz_crypto', 'quiz_immo', 'quiz_self_declared_domains',
    'risk_1', 'risk_2', 'risk_3', 'risk_4',
    'fire_type', 'revenu_passif_cible', 'age_cible', 'priorite',
    'tmi_rate',
    // CS5 — statut propriétaire RP saisi en Step10.
    'proprietaire_rp_status',
    // CS4 — Boussole 4 axes (jsonb). Validation Zod ci-dessous AVANT update.
    'objectifs_axes',
    'wizard_step_completed',
  ]

  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  // CS4 — Validation Zod stricte de objectifs_axes (jsonb : pas de CHECK DB).
  if ('objectifs_axes' in update) {
    const res = validateObjectifsAxes(update['objectifs_axes'])
    if (!res.ok) return err(res.error, 400)
    update['objectifs_axes'] = res.value
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
