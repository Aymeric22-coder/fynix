import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { FinancialEnvelopeInsert, FinancialEnvelopeUpdate } from '@/types/database.types'

// GET /api/financial/envelopes — enveloppes fiscales avec metriques calculees
// depuis les positions du module Portefeuille (migration 012 : financial_assets
// supprime, on lit desormais positions + instrument_prices).
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data: envelopes, error } = await supabase
    .from('financial_envelopes')
    .select(`
      *,
      positions:positions (
        id, quantity, average_price, currency, instrument_id, status
      )
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('envelope_type')

  if (error) return err(error.message, 500)

  // Charge les derniers prix pour les instruments referenc des
  const instrumentIds = Array.from(new Set(
    (envelopes ?? []).flatMap((e) =>
      (e.positions ?? []).map((p: { instrument_id: string }) => p.instrument_id),
    ),
  ))
  const priceByInstrument = new Map<string, number>()
  if (instrumentIds.length > 0) {
    const { data: prices } = await supabase
      .from('instrument_prices')
      .select('instrument_id, price, priced_at')
      .in('instrument_id', instrumentIds)
      .order('priced_at', { ascending: false })
    for (const p of (prices ?? []) as { instrument_id: string; price: number }[]) {
      if (!priceByInstrument.has(p.instrument_id)) {
        priceByInstrument.set(p.instrument_id, Number(p.price))
      }
    }
  }

  const enriched = (envelopes ?? []).map((env) => {
    const positions = (env.positions ?? []) as Array<{
      quantity: number; average_price: number; instrument_id: string; status: string
    }>
    const active = positions.filter((p) => p.status === 'active')
    const totalCost  = active.reduce((s, p) => s + p.quantity * p.average_price, 0)
    const totalValue = active.reduce((s, p) => {
      const cur = priceByInstrument.get(p.instrument_id) ?? p.average_price
      return s + p.quantity * cur
    }, 0)
    return {
      ...env,
      metrics: {
        total_value:  Math.round(totalValue * 100) / 100,
        total_cost:   Math.round(totalCost  * 100) / 100,
        latent_gain:  Math.round((totalValue - totalCost) * 100) / 100,
        assets_count: active.length,
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
