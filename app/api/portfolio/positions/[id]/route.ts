/**
 * PUT    /api/portfolio/positions/[id]   met à jour quantité, PRU, enveloppe…
 * DELETE /api/portfolio/positions/[id]   suppression définitive (cascade transactions via SET NULL)
 *
 * RLS : positions_owner_all → seul le propriétaire peut update/delete.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody, type RouteContext } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { CurrencyCode, PositionStatus } from '@/types/database.types'

interface UpdateBody {
  quantity?:         number
  average_price?:    number
  currency?:         CurrencyCode
  envelope_id?:      string | null
  broker?:           string | null
  acquisition_date?: string | null
  status?:           PositionStatus
  notes?:            string | null
}

export const PUT = withAuth(async (req: Request, user: User, ctx: RouteContext) => {
  const { id } = await ctx.params
  const body = await parseBody<UpdateBody>(req)
  if (!body) return err('Invalid JSON body')

  if (body.quantity !== undefined && body.quantity < 0) return err('quantity must be ≥ 0')
  if (body.average_price !== undefined && body.average_price < 0) return err('average_price must be ≥ 0')

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('positions')
    .update({
      ...(body.quantity         !== undefined ? { quantity:         body.quantity }         : {}),
      ...(body.average_price    !== undefined ? { average_price:    body.average_price }    : {}),
      ...(body.currency         !== undefined ? { currency:         body.currency }         : {}),
      ...(body.envelope_id      !== undefined ? { envelope_id:      body.envelope_id }      : {}),
      ...(body.broker           !== undefined ? { broker:           body.broker }           : {}),
      ...(body.acquisition_date !== undefined ? { acquisition_date: body.acquisition_date } : {}),
      ...(body.status           !== undefined ? { status:           body.status }           : {}),
      ...(body.notes            !== undefined ? { notes:            body.notes }            : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})

export const DELETE = withAuth(async (_req: Request, user: User, ctx: RouteContext) => {
  const { id } = await ctx.params
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('positions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
