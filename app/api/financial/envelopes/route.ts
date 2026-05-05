import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { FinancialEnvelopeInsert, FinancialEnvelopeUpdate } from '@/types/database.types'

// GET /api/financial/envelopes — enveloppes avec valeur totale calculée
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data: envelopes, error } = await supabase
    .from('financial_envelopes')
    .select(`
      *,
      assets:financial_assets (
        id, name, quantity, average_price, current_price, currency
      )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('envelope_type')

  if (error) return err(error.message, 500)

  // Calcul de la valeur totale par enveloppe
  const enriched = envelopes.map((env) => {
    const assets = env.assets ?? []
    const totalValue = assets.reduce(
      (sum: number, a: { quantity: number; current_price: number | null; average_price: number }) =>
        sum + a.quantity * (a.current_price ?? a.average_price),
      0,
    )
    const totalCost = assets.reduce(
      (sum: number, a: { quantity: number; average_price: number }) =>
        sum + a.quantity * a.average_price,
      0,
    )

    return {
      ...env,
      metrics: {
        total_value: Math.round(totalValue * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        latent_gain: Math.round((totalValue - totalCost) * 100) / 100,
        assets_count: assets.length,
      },
    }
  })

  return ok(enriched)
})

// POST /api/financial/envelopes
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Omit<FinancialEnvelopeInsert, 'user_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name || !body.envelope_type) {
    return err('name and envelope_type are required')
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('financial_envelopes')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})

// PUT /api/financial/envelopes?id=xxx
export const PUT = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return err('id query param is required')

  const body = await parseBody<FinancialEnvelopeUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const { user_id: _u, id: _i, ...safe } = body as Record<string, unknown>
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('financial_envelopes')
    .update(safe)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Envelope not found', 404)
  return ok(data)
})
