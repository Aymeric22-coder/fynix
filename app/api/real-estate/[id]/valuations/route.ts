import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { PropertyValuationInsert } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/real-estate/[id]/valuations — historique des estimations
export const GET = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('property_valuations')
    .select('*')
    .eq('property_id', id)
    .eq('user_id', user.id)
    .order('valuation_date', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
})

// POST /api/real-estate/[id]/valuations — ajouter une estimation (append-only)
// Met également à jour current_value dans l'asset parent.
export const POST = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const body = await parseBody<Omit<PropertyValuationInsert, 'user_id' | 'property_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.value || !body.valuation_date) {
    return err('value and valuation_date are required')
  }

  const supabase = await createServerClient()

  // Vérifier la propriété et récupérer l'asset_id
  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select('id, asset_id, surface_m2')
    .eq('id', propertyId)
    .eq('user_id', user.id)
    .single()

  if (!prop) return err('Property not found', 404)

  const pricePerM2 =
    prop.surface_m2 && prop.surface_m2 > 0
      ? Math.round(body.value / prop.surface_m2)
      : null

  // 1. Insérer la valorisation
  const { data: valuation, error: valErr } = await supabase
    .from('property_valuations')
    .insert({
      ...body,
      property_id: propertyId,
      user_id: user.id,
      price_per_m2: pricePerM2,
    })
    .select()
    .single()

  if (valErr) return err(valErr.message, 500)

  // 2. Mettre à jour current_value dans l'asset (dénormalisé)
  await supabase
    .from('assets')
    .update({
      current_value: body.value,
      confidence: body.confidence ?? 'medium',
      data_source: body.source ?? 'manual',
      last_valued_at: new Date().toISOString(),
    })
    .eq('id', prop.asset_id)

  return ok(valuation, 201)
})
