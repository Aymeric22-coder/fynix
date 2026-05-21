/**
 * Routes événements ponctuels d'un bien (property_events, migration 041).
 *
 * - GET  /api/real-estate/[id]/events            → liste les événements
 * - POST /api/real-estate/[id]/events            → crée un événement
 *
 * Les opérations sur un événement précis (PATCH / DELETE) vivent dans
 * /events/[eventId]/route.ts.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import {
  PROPERTY_EVENT_LABELS,
  type PropertyEventInsert,
  type PropertyEventKind,
} from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

// Source unique : les clés de PROPERTY_EVENT_LABELS sont typées
// Record<PropertyEventKind, string>, donc exhaustives sur l'union DB
// (synchro automatique avec le CHECK constraint des migrations 041/042).
const ALLOWED_KINDS = Object.keys(PROPERTY_EVENT_LABELS) as PropertyEventKind[]

async function assertOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:   any,
  userId:     string,
  propertyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('real_estate_properties')
    .select('id')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

// ─── GET ─────────────────────────────────────────────────────────────────
// Optionnel : ?year=2025 pour filtrer sur une année calendaire (event_date).
export const GET = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const supabase = await createServerClient()

  if (!await assertOwner(supabase, user.id, propertyId)) {
    return err('Property not found', 404)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('property_events')
    .select('*')
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .order('event_date', { ascending: false })

  const year = searchParams.get('year')
  if (year) {
    const y = parseInt(year, 10)
    if (!isNaN(y)) {
      query = query
        .gte('event_date', `${y}-01-01`)
        .lte('event_date', `${y}-12-31`)
    }
  }

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
})

// ─── POST ────────────────────────────────────────────────────────────────
// Body : champs PropertyEventInsert sans user_id / property_id (injectés).
// Effet de bord : si kind='rent_revision', met aussi à jour
//   real_estate_lots.rent_amount avec le nouveau loyer (amount_eur).
type PostBody = Omit<PropertyEventInsert, 'user_id' | 'property_id'>

export const POST = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const body = await parseBody<PostBody>(req)
  if (!body) return err('Invalid JSON body')
  if (!body.kind || !ALLOWED_KINDS.includes(body.kind)) {
    return err(`kind must be one of: ${ALLOWED_KINDS.join(', ')}`)
  }
  if (!body.event_date) return err('event_date is required')

  const supabase = await createServerClient()
  if (!await assertOwner(supabase, user.id, propertyId)) {
    return err('Property not found', 404)
  }

  // Insert event
  const payload = {
    property_id:     propertyId,
    user_id:         user.id,
    kind:            body.kind,
    event_date:      body.event_date,
    lot_id:          body.lot_id          ?? null,
    period_start:    body.period_start    ?? null,
    period_end:      body.period_end      ?? null,
    amount_eur:      body.amount_eur      ?? null,
    is_resolved:     body.is_resolved     ?? false,
    resolved_date:   body.resolved_date   ?? null,
    resolution_note: body.resolution_note ?? null,
    label:           body.label           ?? null,
    notes:           body.notes           ?? null,
  }

  const { data: created, error: insertErr } = await supabase
    .from('property_events')
    .insert(payload)
    .select()
    .single()

  if (insertErr) return err(insertErr.message, 500)

  // Effet de bord — révision de loyer : met à jour rent_amount sur le lot.
  // Convention : pour rent_revision, amount_eur = nouveau loyer mensuel HC.
  if (body.kind === 'rent_revision' && body.lot_id && body.amount_eur != null) {
    await supabase
      .from('real_estate_lots')
      .update({ rent_amount: body.amount_eur })
      .eq('id', body.lot_id)
      .eq('user_id', user.id)
  }

  return ok(created, 201)
})
