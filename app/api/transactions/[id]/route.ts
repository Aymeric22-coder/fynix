import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await parseBody<Record<string, unknown>>(req)
  if (!body) return err('Invalid body')

  // Exclure les champs non modifiables
  const { id: _i, user_id: _u, created_at: _c, asset: _a, ...safe } = body

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .update(safe)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})

export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const supabase = await createServerClient()

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
