import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { grossYield, netYield, propertyCashFlow, round2 } from '@/lib/finance/formulas'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/real-estate/[id] — détail complet du bien avec indicateurs calculés
export const GET = withAuth(async (_req: Request, user: User, ctx?: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data: property, error } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id (*),
      lots:real_estate_lots (*),
      valuations:property_valuations (
        id, valuation_date, value, price_per_m2, source, confidence
      ),
      charges:property_charges (*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .order('valuation_date', { referencedTable: 'valuations', ascending: false })
    .single()

  if (error) return err('Property not found', 404)

  // Calcul des indicateurs financiers
  const lots = property.lots ?? []
  const currentYear = new Date().getFullYear()
  const charges = (property.charges ?? []).find((c: { year: number }) => c.year === currentYear)

  const monthlyRents = lots
    .filter((l: { status: string }) => l.status === 'rented')
    .reduce((sum: number, l: { rent_amount: number | null }) => sum + (l.rent_amount ?? 0), 0)

  const annualRents = monthlyRents * 12

  const annualCharges = charges
    ? (charges.taxe_fonciere + charges.insurance + charges.accountant +
       charges.cfe + charges.condo_fees + charges.maintenance + charges.other)
    : 0

  const acquisitionCost =
    (property.purchase_price ?? 0) + (property.purchase_fees ?? 0) + (property.works_amount ?? 0)

  const metrics = {
    monthly_rents: monthlyRents,
    annual_rents: annualRents,
    annual_charges: annualCharges,
    gross_yield: round2(grossYield(annualRents, acquisitionCost)),
    net_yield: round2(netYield(annualRents, annualCharges, acquisitionCost)),
    lots_rented: lots.filter((l: { status: string }) => l.status === 'rented').length,
    lots_total: lots.length,
    vacancy_rate: lots.length > 0
      ? round2((lots.filter((l: { status: string }) => l.status === 'vacant').length / lots.length) * 100)
      : 0,
  }

  return ok({ ...property, metrics })
})

// PUT /api/real-estate/[id] — mise à jour du bien
export const PUT = withAuth(async (req: Request, user: User, ctx?: Ctx) => {
  const { id } = await ctx!.params
  const body = await parseBody<Record<string, unknown>>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()

  // Séparer les champs asset et property
  const assetFields: Record<string, unknown> = {}
  const propertyFields: Record<string, unknown> = {}
  const assetKeys = ['name', 'current_value', 'notes', 'acquisition_date', 'confidence']

  for (const [k, v] of Object.entries(body)) {
    if (assetKeys.includes(k)) assetFields[k] = v
    else propertyFields[k] = v
  }

  // Récupérer l'asset_id
  const { data: prop } = await supabase
    .from('real_estate_properties')
    .select('asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!prop) return err('Property not found', 404)

  const updates: PromiseLike<unknown>[] = []

  if (Object.keys(assetFields).length > 0) {
    updates.push(
      supabase.from('assets').update(assetFields).eq('id', prop.asset_id) as unknown as PromiseLike<unknown>,
    )
  }

  if (Object.keys(propertyFields).length > 0) {
    updates.push(
      supabase.from('real_estate_properties').update(propertyFields).eq('id', id) as unknown as PromiseLike<unknown>,
    )
  }

  await Promise.all(updates)
  return ok({ id, updated: true })
})
