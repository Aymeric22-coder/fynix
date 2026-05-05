import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { latentGainPercent, round2 } from '@/lib/finance/formulas'

interface CreateScpiBody {
  // Asset
  name: string
  acquisition_date?: string
  notes?: string
  // SCPI
  scpi_name: string
  scpi_code?: string
  holding_mode?: string
  envelope_name?: string
  nb_shares: number
  subscription_price?: number
  current_share_price?: number
  withdrawal_price?: number
  distribution_rate?: number
}

// GET /api/scpi
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('scpi_assets')
    .select(`
      *,
      asset:assets!asset_id (id, name, status, current_value, acquisition_price, acquisition_date)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)

  // Enrichir avec les métriques calculées
  const enriched = data.map((scpi) => {
    const currentValue = (scpi.withdrawal_price ?? scpi.current_share_price ?? 0) * scpi.nb_shares
    const acquisitionCost = (scpi.subscription_price ?? 0) * scpi.nb_shares

    return {
      ...scpi,
      metrics: {
        current_value: round2(currentValue),
        acquisition_cost: round2(acquisitionCost),
        latent_gain: round2(currentValue - acquisitionCost),
        latent_gain_percent: round2(latentGainPercent(currentValue, acquisitionCost)),
      },
    }
  })

  return ok(enriched)
})

// POST /api/scpi — crée asset + scpi_asset
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreateScpiBody>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name || !body.scpi_name || body.nb_shares === undefined) {
    return err('name, scpi_name and nb_shares are required')
  }

  const supabase = await createServerClient()

  const acquisitionPrice = (body.subscription_price ?? 0) * body.nb_shares

  const { data: asset, error: assetErr } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      name: body.name,
      asset_type: 'scpi',
      currency: 'EUR',
      acquisition_date: body.acquisition_date ?? null,
      acquisition_price: acquisitionPrice || null,
      current_value: body.current_share_price ? body.current_share_price * body.nb_shares : null,
      notes: body.notes ?? null,
      data_source: 'manual',
      confidence: 'medium',
    })
    .select()
    .single()

  if (assetErr) return err(assetErr.message, 500)

  const { data: scpi, error: scpiErr } = await supabase
    .from('scpi_assets')
    .insert({
      asset_id: asset.id,
      user_id: user.id,
      scpi_name: body.scpi_name,
      scpi_code: body.scpi_code ?? null,
      holding_mode: body.holding_mode ?? 'direct',
      envelope_name: body.envelope_name ?? null,
      nb_shares: body.nb_shares,
      subscription_price: body.subscription_price ?? null,
      current_share_price: body.current_share_price ?? null,
      withdrawal_price: body.withdrawal_price ?? null,
      distribution_rate: body.distribution_rate ?? null,
    })
    .select()
    .single()

  if (scpiErr) {
    await supabase.from('assets').delete().eq('id', asset.id)
    return err(scpiErr.message, 500)
  }

  return ok({ asset, scpi }, 201)
})
