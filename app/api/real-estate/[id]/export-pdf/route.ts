/**
 * GET /api/real-estate/[id]/export-pdf?year=2025
 *
 * Genere le bilan annuel d'un bien immobilier en PDF.
 * Charge bien + asset + lots + charges + debt + profile, lance la
 * simulation, et utilise lib/real-estate/pdf/annual-report pour generer
 * le PDF qui est stream-e en application/pdf.
 *
 * Auth : owner uniquement (404 sinon, pas de leak).
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { buildSimulationInputFromDb, runSimulation } from '@/lib/real-estate'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from '@/lib/real-estate/build-from-db'
import { generateAnnualReport } from '@/lib/real-estate/pdf/annual-report'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const url = new URL(req.url)
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10)
  if (isNaN(year) || year < 1900 || year > 2100) {
    return err('Invalid year', 400)
  }

  const supabase = await createServerClient()

  // Charge tout en parallele
  const [
    propRes, lotsRes, chargesRes, profileRes,
  ] = await Promise.all([
    supabase
      .from('real_estate_properties')
      .select(`
        *,
        asset:assets!asset_id ( id, name, current_value, acquisition_date )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('real_estate_lots')
      .select('*')
      .eq('property_id', id)
      .eq('user_id', user.id),
    supabase
      .from('property_charges')
      .select('*')
      .eq('property_id', id)
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('tmi_rate')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  if (propRes.error || !propRes.data) return err('Property not found', 404)
  const prop = propRes.data
  const asset = Array.isArray(prop.asset) ? prop.asset[0] : prop.asset

  // Credit actif sur l'asset
  const { data: debtRow } = await supabase
    .from('debts')
    .select('*')
    .eq('asset_id', prop.asset_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  // Mapping vers DbXxx
  const dbProperty: DbProperty = {
    purchase_price:             prop.purchase_price,
    purchase_fees:              prop.purchase_fees,
    works_amount:               prop.works_amount,
    furniture_amount:           prop.furniture_amount ?? 0,
    fiscal_regime:              prop.fiscal_regime,
    rental_index_pct:           prop.rental_index_pct  ?? 2.0,
    charges_index_pct:          prop.charges_index_pct ?? 2.0,
    property_index_pct:         prop.property_index_pct ?? 1.0,
    land_share_pct:             prop.land_share_pct ?? 15,
    amort_building_years:       prop.amort_building_years ?? 30,
    amort_works_years:          prop.amort_works_years ?? 15,
    amort_furniture_years:      prop.amort_furniture_years ?? 7,
    gli_pct:                    prop.gli_pct ?? 0,
    management_pct:             prop.management_pct ?? 0,
    vacancy_months:             prop.vacancy_months ?? 0,
    lmp_ssi_rate:               prop.lmp_ssi_rate ?? 35,
    acquisition_fees_treatment: prop.acquisition_fees_treatment ?? 'expense_y1',
    lmnp_micro_abattement_pct:  prop.lmnp_micro_abattement_pct ?? 50,
    assumed_total_rent:         prop.assumed_total_rent ?? null,
  }
  const dbAsset: DbAsset | null = asset ? { current_value: asset.current_value } : null
  const dbLots: DbLot[] = (lotsRes.data ?? []).map(l => ({
    rent_amount: l.rent_amount, status: l.status,
  }))
  const dbCharges: DbCharges | null = chargesRes.data
    ? {
        taxe_fonciere: chargesRes.data.taxe_fonciere,
        insurance:     chargesRes.data.insurance,
        accountant:    chargesRes.data.accountant,
        cfe:           chargesRes.data.cfe,
        condo_fees:    chargesRes.data.condo_fees,
        maintenance:   chargesRes.data.maintenance,
        other:         chargesRes.data.other,
      }
    : null
  const dbDebt: DbDebt | null = debtRow
    ? {
        initial_amount:    debtRow.initial_amount,
        interest_rate:     debtRow.interest_rate,
        insurance_rate:    debtRow.insurance_rate,
        duration_months:   debtRow.duration_months,
        start_date:        debtRow.start_date,
        bank_fees:         debtRow.bank_fees ?? 0,
        guarantee_fees:    debtRow.guarantee_fees ?? 0,
        amortization_type: debtRow.amortization_type ?? 'constant',
      }
    : null
  const dbProfile: DbProfile = { tmi_rate: profileRes.data?.tmi_rate ?? 30 }

  // Apport personnel
  const acqCost = (dbProperty.purchase_price ?? 0) + (dbProperty.purchase_fees ?? 0) + (dbProperty.works_amount ?? 0)
  const downPayment = Math.max(0, acqCost - (dbDebt?.initial_amount ?? 0))

  const input = buildSimulationInputFromDb(
    dbProperty, dbAsset, dbLots, dbCharges, dbDebt, dbProfile,
    { downPayment, horizonYears: Math.max(25, year - new Date().getUTCFullYear() + 25) },
  )
  // Re-attache address au property pour l'en-tete du PDF (cast intentionnel)
  const propertyWithAddress = {
    ...dbProperty,
    address_line1: prop.address_line1,
    address_zip:   prop.address_zip,
    address_city:  prop.address_city,
    property_type: prop.property_type,
  } as DbProperty

  const simulation = runSimulation(input)

  const pdfBuffer = await generateAnnualReport({
    year,
    propertyName: (asset?.name as string | undefined) ?? 'Bien immobilier',
    property:     propertyWithAddress,
    asset:        asset ? { current_value: asset.current_value,
                            ...(asset.acquisition_date ? { acquisition_date: asset.acquisition_date } : {}),
                          } as unknown as DbAsset
                        : null,
    lots:         dbLots,
    charges:      dbCharges,
    debt:         dbDebt,
    profile:      dbProfile,
    simulation,
  })

  const filename = `bilan-${(asset?.name as string ?? 'bien').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}.pdf`

  // NextResponse attend BodyInit. Uint8Array<ArrayBufferLike> n'est pas
  // assignable directement en strict typing — on passe par BlobPart.
  return new NextResponse(pdfBuffer as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(pdfBuffer.byteLength),
    },
  })
})
