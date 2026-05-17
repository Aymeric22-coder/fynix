/**
 * GET  /api/future-acquisitions — liste des acquisitions futures simulees du user
 * POST /api/future-acquisitions — cree une nouvelle ligne
 *
 * Persistance des acquisitions simulees dans la projection FIRE (table
 * `future_acquisitions`, migration 017). Les noms de colonnes en base
 * collent au type TS `AcquisitionFuture` — pas de mapping necessaire.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { FutureAcquisitionInsert } from '@/types/database.types'

export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('future_acquisitions')
    .select('*')
    .eq('user_id', user.id)
    .order('dans_combien_annees', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return err(error.message, 500)
  return ok({ items: data ?? [] })
})

type CreateBody = Partial<Omit<FutureAcquisitionInsert, 'user_id'>>

export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreateBody>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('future_acquisitions')
    .insert({
      user_id:                   user.id,
      nom:                       body.nom                       ?? 'Nouvelle acquisition',
      dans_combien_annees:       body.dans_combien_annees       ?? 3,
      prix_achat:                body.prix_achat                ?? 0,
      frais_notaire_pct:         body.frais_notaire_pct         ?? 8,
      apport:                    body.apport                    ?? 0,
      taux_interet:              body.taux_interet              ?? 3.5,
      duree_credit_ans:          body.duree_credit_ans          ?? 20,
      type:                      body.type                      ?? 'locatif',
      loyer_brut_mensuel:        body.loyer_brut_mensuel        ?? 0,
      taux_vacance_pct:          body.taux_vacance_pct          ?? 5,
      charges_mensuelles:        body.charges_mensuelles        ?? 0,
      appreciation_annuelle_pct: body.appreciation_annuelle_pct ?? 2,
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok({ acquisition: data }, 201)
})
