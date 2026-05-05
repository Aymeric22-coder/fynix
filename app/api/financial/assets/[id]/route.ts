import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { FinancialAssetUpdate } from '@/types/database.types'
import { getQuote } from '@/lib/providers/market-data'
import { round2 } from '@/lib/finance/formulas'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/financial/assets/[id] — détail avec prix live
export const GET = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data: fa, error } = await supabase
    .from('financial_assets')
    .select(`
      *,
      asset:assets!asset_id (*),
      envelope:financial_envelopes (*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) return err('Financial asset not found', 404)

  // Rafraîchir le prix si ticker connu
  let currentPrice = fa.current_price
  if (fa.ticker) {
    const quote = await getQuote(fa.ticker)
    if (quote) {
      currentPrice = quote.price

      // Mise à jour silencieuse en DB
      await supabase
        .from('financial_assets')
        .update({ current_price: quote.price, current_price_at: quote.fetchedAt.toISOString() })
        .eq('id', id)

      await supabase
        .from('assets')
        .update({ current_value: round2(fa.quantity * quote.price), last_valued_at: quote.fetchedAt.toISOString() })
        .eq('id', fa.asset_id)
    }
  }

  const currentValue = round2(fa.quantity * (currentPrice ?? fa.average_price))
  const cost = round2(fa.quantity * fa.average_price)

  return ok({
    ...fa,
    current_price: currentPrice,
    metrics: {
      current_value: currentValue,
      cost_basis: cost,
      latent_gain: round2(currentValue - cost),
      latent_gain_percent: cost > 0 ? round2(((currentValue - cost) / cost) * 100) : 0,
    },
  })
})

// PUT /api/financial/assets/[id] — mise à jour (quantité, PRU, enveloppe)
export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const body = await parseBody<FinancialAssetUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const { user_id: _u, asset_id: _a, id: _i, ...safe } = body as Record<string, unknown>
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('financial_assets')
    .update(safe)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Financial asset not found', 404)
  return ok(data)
})
