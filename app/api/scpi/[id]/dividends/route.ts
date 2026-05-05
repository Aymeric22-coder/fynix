import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { ScpiDividendInsert } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/scpi/[id]/dividends
export const GET = withAuth(async (_req: Request, user: User, ctx?: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('scpi_dividends')
    .select('*')
    .eq('scpi_asset_id', id)
    .eq('user_id', user.id)
    .order('payment_date', { ascending: false })

  if (error) return err(error.message, 500)

  // Calculer le total et le rendement moyen
  const total = data.reduce((sum, d) => sum + d.amount, 0)

  return ok({ items: data, total_received: total })
})

// POST /api/scpi/[id]/dividends — enregistrer un dividende (append-only)
// Crée aussi une transaction de type 'dividend' liée à l'asset.
export const POST = withAuth(async (req: Request, user: User, ctx?: Ctx) => {
  const { id: scpiAssetId } = await ctx!.params
  const body = await parseBody<Omit<ScpiDividendInsert, 'user_id' | 'scpi_asset_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.amount || !body.payment_date) {
    return err('amount and payment_date are required')
  }

  const supabase = await createServerClient()

  // Récupérer l'asset_id pour la transaction
  const { data: scpi } = await supabase
    .from('scpi_assets')
    .select('asset_id')
    .eq('id', scpiAssetId)
    .eq('user_id', user.id)
    .single()

  if (!scpi) return err('SCPI asset not found', 404)

  // 1. Enregistrer le dividende
  const { data: dividend, error: divErr } = await supabase
    .from('scpi_dividends')
    .insert({ ...body, scpi_asset_id: scpiAssetId, user_id: user.id })
    .select()
    .single()

  if (divErr) return err(divErr.message, 500)

  // 2. Créer la transaction correspondante
  await supabase.from('transactions').insert({
    user_id: user.id,
    asset_id: scpi.asset_id,
    transaction_type: 'dividend',
    amount: body.amount,
    currency: 'EUR',
    fx_rate_to_ref: 1,
    executed_at: new Date(body.payment_date).toISOString(),
    label: `Dividende SCPI`,
    data_source: 'manual',
  })

  return ok(dividend, 201)
})
