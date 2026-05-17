/**
 * PUT    /api/future-acquisitions/:id — mise a jour d'une ligne
 * DELETE /api/future-acquisitions/:id — suppression d'une ligne
 *
 * RLS garantit deja qu'on ne touche pas les lignes d'un autre user, mais
 * on filtre malgre tout par user_id pour bonne mesure (defense en profondeur).
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { FutureAcquisitionUpdate } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

const ALLOWED_FIELDS = [
  'nom', 'dans_combien_annees', 'prix_achat', 'frais_notaire_pct', 'apport',
  'taux_interet', 'duree_credit_ans', 'type', 'loyer_brut_mensuel',
  'taux_vacance_pct', 'charges_mensuelles', 'appreciation_annuelle_pct',
] as const

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await parseBody<FutureAcquisitionUpdate>(req)
  if (!body) return err('Invalid JSON body')

  // Whitelist : ne laisser passer que les colonnes autorisees
  const updates: Record<string, unknown> = {}
  for (const k of ALLOWED_FIELDS) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (Object.keys(updates).length === 0) return err('No fields to update')

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('future_acquisitions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Acquisition not found', 404)
  return ok({ acquisition: data })
})

export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const supabase = await createServerClient()

  const { error } = await supabase
    .from('future_acquisitions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: id })
})
