import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

interface CreatePropertyBody {
  // Asset fields
  name: string
  currency?: string
  acquisition_date?: string
  notes?: string
  // Property fields
  property_type: string
  address_line1?: string
  address_city?: string
  address_zip?: string
  address_country?: string
  surface_m2?: number
  land_surface_m2?: number
  construction_year?: number
  dpe_class?: string
  purchase_price?: number
  purchase_fees?: number
  works_amount?: number
  fiscal_regime?: string
  is_multi_lot?: boolean
}

// GET /api/real-estate — liste les biens immobiliers avec leur valorisation courante
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id (
        id, name, status, current_value, acquisition_price, acquisition_date,
        confidence, last_valued_at
      ),
      lots:real_estate_lots (
        id, name, status, rent_amount, charges_amount, lot_type
      ),
      latest_valuation:property_valuations (
        value, valuation_date, source
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
})

// POST /api/real-estate — crée asset + property en une transaction
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreatePropertyBody>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name || !body.property_type) {
    return err('name and property_type are required')
  }

  const supabase = await createServerClient()

  // Calcul du prix total d'acquisition
  const acquisitionPrice =
    (body.purchase_price ?? 0) + (body.purchase_fees ?? 0) + (body.works_amount ?? 0)

  // 1. Créer l'asset générique
  const { data: asset, error: assetErr } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      name: body.name,
      asset_type: 'real_estate',
      currency: body.currency ?? 'EUR',
      acquisition_date: body.acquisition_date ?? null,
      acquisition_price: acquisitionPrice || null,
      current_value: body.purchase_price ?? null,
      notes: body.notes ?? null,
      data_source: 'manual',
      confidence: 'medium',
    })
    .select()
    .single()

  if (assetErr) return err(assetErr.message, 500)

  // 2. Créer le détail immobilier
  const { data: property, error: propErr } = await supabase
    .from('real_estate_properties')
    .insert({
      asset_id: asset.id,
      user_id: user.id,
      property_type: body.property_type,
      address_line1: body.address_line1 ?? null,
      address_city: body.address_city ?? null,
      address_zip: body.address_zip ?? null,
      address_country: body.address_country ?? 'FR',
      surface_m2: body.surface_m2 ?? null,
      land_surface_m2: body.land_surface_m2 ?? null,
      construction_year: body.construction_year ?? null,
      dpe_class: body.dpe_class ?? null,
      purchase_price: body.purchase_price ?? null,
      purchase_fees: body.purchase_fees ?? 0,
      works_amount: body.works_amount ?? 0,
      fiscal_regime: body.fiscal_regime ?? null,
      is_multi_lot: body.is_multi_lot ?? false,
    })
    .select()
    .single()

  if (propErr) {
    // Rollback asset si la propriété échoue
    await supabase.from('assets').delete().eq('id', asset.id)
    return err(propErr.message, 500)
  }

  return ok({ asset, property }, 201)
})
