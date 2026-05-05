import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string; lotId: string }> }

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { lotId } = await ctx.params
  const body = await parseBody<Record<string, unknown>>(req)
  if (!body) return err('Invalid body')

  // Exclure les champs non modifiables
  const { id: _i, user_id: _u, property_id: _p, created_at: _c, updated_at: _u2, ...safe } = body

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('real_estate_lots')
    .update(safe)
    .eq('id', lotId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})

export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { lotId } = await ctx.params
  const supabase = await createServerClient()

  const { error } = await supabase
    .from('real_estate_lots')
    .delete()
    .eq('id', lotId)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
