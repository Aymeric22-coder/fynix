import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { AssetUpdate } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/assets/[id]
export const GET = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) return err('Asset not found', 404)
  return ok(data)
})

// PUT /api/assets/[id]
export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const body = await parseBody<AssetUpdate>(req)
  if (!body) return err('Invalid JSON body')

  // Empêcher la modification des champs système
  const { user_id: _u, id: _i, created_at: _c, ...safe } = body as Record<string, unknown>

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('assets')
    .update(safe)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Asset not found', 404)
  return ok(data)
})

// DELETE /api/assets/[id] — soft delete (status = sold/closed)
export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('assets')
    .update({ status: 'closed' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Asset not found', 404)
  return ok({ id, status: 'closed' })
})
