import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { PropertyChargesInsert, PropertyChargesUpdate } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/real-estate/[id]/charges — charges par année
// ?year=2024 pour filtrer une année spécifique
export const GET = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const supabase = await createServerClient()

  let query = supabase
    .from('property_charges')
    .select('*')
    .eq('property_id', id)
    .eq('user_id', user.id)
    .order('year', { ascending: false })

  const year = searchParams.get('year')
  if (year) query = query.eq('year', parseInt(year, 10))

  const { data, error } = await query
  if (error) return err(error.message, 500)
  return ok(data)
})

// POST /api/real-estate/[id]/charges — créer/mettre à jour les charges d'une année
export const POST = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const body = await parseBody<Omit<PropertyChargesInsert, 'user_id' | 'property_id'>>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.year) return err('year is required')

  const supabase = await createServerClient()

  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select('id')
    .eq('id', propertyId)
    .eq('user_id', user.id)
    .single()

  if (!prop) return err('Property not found', 404)

  // Upsert sur (property_id, year)
  const { data, error } = await supabase
    .from('property_charges')
    .upsert(
      { ...body, property_id: propertyId, user_id: user.id },
      { onConflict: 'property_id,year' },
    )
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})

// PUT /api/real-estate/[id]/charges?year=2024 — mise à jour partielle
export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')

  if (!year) return err('year query param is required')

  const body = await parseBody<PropertyChargesUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const { user_id: _u, property_id: _p, ...safe } = body as Record<string, unknown>
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('property_charges')
    .update(safe)
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .eq('year', parseInt(year, 10))
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!data) return err('Charges record not found', 404)
  return ok(data)
})
