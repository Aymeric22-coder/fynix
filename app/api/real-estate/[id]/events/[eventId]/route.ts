/**
 * Routes pour un événement précis (PATCH / DELETE).
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { PropertyEventUpdate } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string; eventId: string }> }

// ─── PATCH ───────────────────────────────────────────────────────────────
export const PATCH = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId, eventId } = await ctx!.params
  const body = await parseBody<PropertyEventUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()

  // Récupère l'événement pour vérifier l'ownership (via property_id + user_id)
  const { data: existing } = await supabase
    .from('property_events')
    .select('id, kind, lot_id')
    .eq('id', eventId)
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) return err('Event not found', 404)

  // On n'autorise pas le changement de property_id / user_id côté patch.
  const { property_id: _p, user_id: _u, id: _i, ...safe } = body as Record<string, unknown>
  const patched = { ...safe, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('property_events')
    .update(patched)
    .eq('id', eventId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)

  // Effet de bord rent_revision : si l'amount change, on resynchronise le lot.
  if (existing.kind === 'rent_revision' && existing.lot_id && body.amount_eur != null) {
    await supabase
      .from('real_estate_lots')
      .update({ rent_amount: body.amount_eur })
      .eq('id', existing.lot_id)
      .eq('user_id', user.id)
  }

  return ok(data)
})

// ─── DELETE ──────────────────────────────────────────────────────────────
export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId, eventId } = await ctx!.params
  const supabase = await createServerClient()

  // Vérifie l'ownership puis supprime
  const { data: existing } = await supabase
    .from('property_events')
    .select('id')
    .eq('id', eventId)
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) return err('Event not found', 404)

  const { error } = await supabase
    .from('property_events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
