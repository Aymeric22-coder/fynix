import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, getPagination, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { TransactionInsert } from '@/types/database.types'

// GET /api/transactions — journal universel paginé
// Params: asset_id, type, from (date), to (date), page, limit
export const GET = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const { from: rangeFrom, to: rangeTo } = getPagination(req.url)
  const supabase = await createServerClient()

  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('executed_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  const assetId = searchParams.get('asset_id')
  if (assetId) query = query.eq('asset_id', assetId)

  const type = searchParams.get('type')
  if (type) query = query.eq('transaction_type', type)

  const dateFrom = searchParams.get('from')
  if (dateFrom) query = query.gte('executed_at', dateFrom)

  const dateTo = searchParams.get('to')
  if (dateTo) query = query.lte('executed_at', dateTo)

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  return ok({ items: data, total: count ?? 0 })
})

// POST /api/transactions — enregistrer un flux financier
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Omit<TransactionInsert, 'user_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.transaction_type || body.amount === undefined || !body.executed_at) {
    return err('transaction_type, amount, executed_at are required')
  }

  // fx_rate_to_ref par défaut à 1 si non fourni (devise EUR)
  const payload: TransactionInsert = {
    ...body,
    user_id: user.id,
    fx_rate_to_ref: body.fx_rate_to_ref ?? 1,
    currency: body.currency ?? 'EUR',
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})
