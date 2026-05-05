import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await parseBody<Record<string, unknown>>(req)
  if (!body) return err('Invalid body')

  // Exclure les champs non modifiables et les relations jointes
  const { id: _i, user_id: _u, asset_id: _a, created_at: _c, updated_at: _u2, asset: _as, dividends: _d, ...safe } = body

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('scpi_assets')
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

  const { data: scpi } = await supabase
    .from('scpi_assets')
    .select('asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!scpi) return err('SCPI not found', 404)

  await supabase.from('assets').update({ status: 'sold' }).eq('id', scpi.asset_id)

  return ok({ deleted: true })
})
