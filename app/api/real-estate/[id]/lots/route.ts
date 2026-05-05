import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { RealEstateLotInsert, RealEstateLotUpdate } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/real-estate/[id]/lots
export const GET = withAuth(async (_req: Request, user: User, ctx?: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('real_estate_lots')
    .select('*')
    .eq('property_id', id)
    .eq('user_id', user.id)
    .order('name')

  if (error) return err(error.message, 500)
  return ok(data)
})

// POST /api/real-estate/[id]/lots — ajouter un lot
export const POST = withAuth(async (req: Request, user: User, ctx?: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const body = await parseBody<Omit<RealEstateLotInsert, 'user_id' | 'property_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name) return err('name is required')

  const supabase = await createServerClient()

  // Vérifier que la propriété appartient à l'utilisateur
  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select('id')
    .eq('id', propertyId)
    .eq('user_id', user.id)
    .single()

  if (!prop) return err('Property not found', 404)

  const { data, error } = await supabase
    .from('real_estate_lots')
    .insert({ ...body, property_id: propertyId, user_id: user.id })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})

// PUT /api/real-estate/[id]/lots?lot_id=xxx — mettre à jour un lot
export const PUT = withAuth(async (req: Request, user: User, ctx?: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const lotId = searchParams.get('lot_id')

  if (!lotId) return err('lot_id query param is required')

  const body = await parseBody<RealEstateLotUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const { user_id: _u, property_id: _p, id: _i, ...safe } = body as Record<string, unknown>
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('real_estate_lots')
    .update(safe)
    .eq('id', lotId)
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Lot not found', 404)
  return ok(data)
})
