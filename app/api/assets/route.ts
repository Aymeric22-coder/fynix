import { type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, getPagination, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { AssetInsert } from '@/types/database.types'

// GET /api/assets — liste des actifs de l'utilisateur
export const GET = withAuth(async (req: Request, user: User) => {
  const supabase = await createServerClient()
  const { searchParams } = new URL(req.url)
  const { from, to } = getPagination(req.url)

  let query = supabase
    .from('assets')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  const type = searchParams.get('type')
  if (type) query = query.eq('asset_type', type)

  const status = searchParams.get('status') ?? 'active'
  query = query.eq('status', status)

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  return ok({ items: data, total: count ?? 0 })
})

// POST /api/assets — création d'un actif
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Omit<AssetInsert, 'user_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name || !body.asset_type) {
    return err('name and asset_type are required')
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('assets')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})
