import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { getQuote } from '@/lib/providers/market-data'
import { latentGainPercent, round2 } from '@/lib/finance/formulas'

interface CreateFinancialAssetBody {
  // Asset
  name: string
  asset_type: 'stock' | 'etf' | 'crypto' | 'gold' | 'other'
  acquisition_date?: string
  notes?: string
  // Financial asset
  envelope_id?: string
  ticker?: string
  isin?: string
  quantity: number
  average_price: number
  currency?: string
}

// GET /api/financial/assets — avec prix live si disponibles
export const GET = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const envelopeId = searchParams.get('envelope_id')
  const supabase = await createServerClient()

  let query = supabase
    .from('financial_assets')
    .select(`
      *,
      asset:assets!asset_id (id, name, asset_type, status, acquisition_date, currency),
      envelope:financial_envelopes (id, name, envelope_type, broker)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (envelopeId) query = query.eq('envelope_id', envelopeId)

  const { data, error } = await query
  if (error) return err(error.message, 500)

  // Enrichir avec métriques calculées (prix déjà en DB)
  const enriched = data.map((fa) => {
    const currentPrice = fa.current_price ?? fa.average_price
    const currentValue = round2(fa.quantity * currentPrice)
    const cost = round2(fa.quantity * fa.average_price)

    return {
      ...fa,
      metrics: {
        current_value: currentValue,
        cost_basis: cost,
        latent_gain: round2(currentValue - cost),
        latent_gain_percent: round2(latentGainPercent(currentValue, cost)),
      },
    }
  })

  return ok(enriched)
})

// POST /api/financial/assets — crée asset + financial_asset + enregistre une transaction d'achat
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreateFinancialAssetBody>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name || !body.asset_type || body.quantity === undefined || body.average_price === undefined) {
    return err('name, asset_type, quantity and average_price are required')
  }

  const supabase = await createServerClient()

  // Tenter de récupérer le prix actuel si un ticker est fourni
  let currentPrice: number | null = null
  if (body.ticker) {
    const quote = await getQuote(body.ticker)
    currentPrice = quote?.price ?? null
  }

  const acquisitionPrice = round2(body.quantity * body.average_price)

  // 1. Créer l'asset
  const { data: asset, error: assetErr } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      name: body.name,
      asset_type: body.asset_type,
      currency: body.currency ?? 'EUR',
      acquisition_date: body.acquisition_date ?? null,
      acquisition_price: acquisitionPrice,
      current_value: currentPrice ? round2(body.quantity * currentPrice) : acquisitionPrice,
      notes: body.notes ?? null,
      data_source: body.ticker ? 'api' : 'manual',
      confidence: body.ticker ? 'high' : 'medium',
      last_valued_at: currentPrice ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (assetErr) return err(assetErr.message, 500)

  // 2. Créer le financial_asset
  const { data: fa, error: faErr } = await supabase
    .from('financial_assets')
    .insert({
      asset_id: asset.id,
      user_id: user.id,
      envelope_id: body.envelope_id ?? null,
      ticker: body.ticker ?? null,
      isin: body.isin ?? null,
      name: body.name,
      quantity: body.quantity,
      average_price: body.average_price,
      current_price: currentPrice,
      current_price_at: currentPrice ? new Date().toISOString() : null,
      currency: body.currency ?? 'EUR',
      data_source: body.ticker ? 'api' : 'manual',
    })
    .select()
    .single()

  if (faErr) {
    await supabase.from('assets').delete().eq('id', asset.id)
    return err(faErr.message, 500)
  }

  // 3. Enregistrer la transaction d'achat
  if (body.acquisition_date) {
    await supabase.from('transactions').insert({
      user_id: user.id,
      asset_id: asset.id,
      transaction_type: 'purchase',
      amount: -acquisitionPrice,   // sortie de cash
      currency: body.currency ?? 'EUR',
      fx_rate_to_ref: 1,
      executed_at: new Date(body.acquisition_date).toISOString(),
      label: `Achat ${body.name}`,
      data_source: 'manual',
    })
  }

  return ok({ asset, financial_asset: fa }, 201)
})
