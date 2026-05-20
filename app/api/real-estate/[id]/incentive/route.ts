/**
 * Route property-centric pour gérer LE dispositif fiscal d'un bien
 * (1 par bien grâce à l'index unique idx_tax_incentives_one_per_property,
 * migration 038).
 *
 * - GET    /api/real-estate/[id]/incentive  → renvoie le dispositif (null si aucun)
 * - PUT    /api/real-estate/[id]/incentive  → upsert
 * - DELETE /api/real-estate/[id]/incentive  → supprime
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

const ALLOWED_KINDS = [
  'pinel', 'pinel_plus', 'denormandie',
  'malraux', 'monuments_historiques',
  'loc_avantages', 'censi_bouvard',
] as const

interface IncentiveBody {
  kind:                  string

  // Pinel / Denormandie / Pinel+
  duration_years?:       number | null
  zone?:                 string | null
  start_year?:           number | null
  is_pinel_plus?:        boolean
  rent_cap_monthly?:     number | null
  works_amount?:         number | null

  // Malraux / MH
  classification?:       string | null
  occupancy?:            string | null
  works_start_year?:     number | null
  works_end_year?:       number | null
  conservation_end_year?: number | null
  reduction_rate_pct?:   number | null

  // Loc'Avantages
  convention_type?:      string | null
  convention_start?:     string | null   // ISO date
  convention_end?:       string | null
  market_rent_annual?:   number | null

  notes?:                string | null
}

async function assertOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId:   string,
  propertyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('real_estate_properties')
    .select('id')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

// ─── GET ───────────────────────────────────────────────────────────────────
export const GET = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()
  if (!await assertOwner(supabase, user.id, id)) return err('Property not found', 404)

  const { data, error } = await supabase
    .from('property_tax_incentives')
    .select('*')
    .eq('property_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return err(error.message, 500)
  return ok(data)
})

// ─── PUT (upsert) ──────────────────────────────────────────────────────────
export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const body = await parseBody<IncentiveBody>(req)
  if (!body) return err('Invalid JSON body')
  if (!ALLOWED_KINDS.includes(body.kind as typeof ALLOWED_KINDS[number])) {
    return err(`kind must be one of: ${ALLOWED_KINDS.join(', ')}`)
  }

  const supabase = await createServerClient()
  if (!await assertOwner(supabase, user.id, propertyId)) return err('Property not found', 404)

  // Récupère l'existant (1 max par bien)
  const { data: existing } = await supabase
    .from('property_tax_incentives')
    .select('id')
    .eq('property_id', propertyId)
    .eq('user_id', user.id)
    .maybeSingle()

  const payload = {
    property_id:           propertyId,
    user_id:               user.id,
    kind:                  body.kind,
    duration_years:        body.duration_years        ?? null,
    zone:                  body.zone                  ?? null,
    start_year:            body.start_year            ?? null,
    is_pinel_plus:         body.is_pinel_plus         ?? false,
    rent_cap_monthly:      body.rent_cap_monthly      ?? null,
    works_amount:          body.works_amount          ?? null,
    classification:        body.classification        ?? null,
    occupancy:             body.occupancy             ?? null,
    works_start_year:      body.works_start_year      ?? null,
    works_end_year:        body.works_end_year        ?? null,
    conservation_end_year: body.conservation_end_year ?? null,
    reduction_rate_pct:    body.reduction_rate_pct    ?? null,
    convention_type:       body.convention_type       ?? null,
    convention_start:      body.convention_start      ?? null,
    convention_end:        body.convention_end        ?? null,
    market_rent_annual:    body.market_rent_annual    ?? null,
    notes:                 body.notes                 ?? null,
    updated_at:            new Date().toISOString(),
  }

  if (existing) {
    const { data, error } = await supabase
      .from('property_tax_incentives')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return err(error.message, 500)
    return ok(data)
  } else {
    const { data, error } = await supabase
      .from('property_tax_incentives')
      .insert(payload)
      .select()
      .single()
    if (error) return err(error.message, 500)
    return ok(data, 201)
  }
})

// ─── DELETE ────────────────────────────────────────────────────────────────
export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const supabase = await createServerClient()
  if (!await assertOwner(supabase, user.id, propertyId)) return err('Property not found', 404)

  const { error } = await supabase
    .from('property_tax_incentives')
    .delete()
    .eq('property_id', propertyId)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
