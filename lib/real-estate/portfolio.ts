/**
 * Calcul agrégé de la simulation pour l'ensemble du parc immobilier d'un utilisateur.
 *
 * Utilisé par :
 *  - la page liste /immobilier (enrichissement des cartes)
 *  - POST /api/snapshots (CF réel + mise à jour capital_remaining)
 *
 * Accepte n'importe quel client Supabase (server component ou API route).
 */

import { buildSimulationInputFromDb, runSimulation, computeRemainingCapitalAt } from '.'
import type { SimulationResult } from './types'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from './build-from-db'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PropertySimResult {
  propertyId:       string
  assetId:          string
  simulation:       SimulationResult
  /** Capital restant dû calculé analytiquement à aujourd'hui. */
  capitalRemaining: number
}

export interface PortfolioResult {
  properties:            PropertySimResult[]
  /** Somme des cash-flows mensuels Y1 après impôts (toutes propriétés). */
  totalMonthlyCFYear1:   number
  /** Somme des capitaux restants dus (analytique). */
  totalCapitalRemaining: number
}

// ─── Helper principal ───────────────────────────────────────────────────────

export async function computeRealEstatePortfolio(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId:   string,
): Promise<PortfolioResult> {
  const today      = new Date()
  const currentYear = today.getFullYear()

  // ── 1. Propriétés + lots + asset ──────────────────────────────────────────
  const { data: properties } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id ( current_value ),
      lots:real_estate_lots ( rent_amount, status )
    `)
    .eq('user_id', userId)

  if (!properties?.length) {
    return { properties: [], totalMonthlyCFYear1: 0, totalCapitalRemaining: 0 }
  }

  // ── 2. Charges de l'année courante (toutes propriétés) ────────────────────
  const { data: allCharges } = await supabase
    .from('property_charges')
    .select('property_id, taxe_fonciere, insurance, accountant, cfe, condo_fees, maintenance, other')
    .eq('user_id', userId)
    .eq('year', currentYear)

  const chargesByProp: Record<string, DbCharges> = {}
  for (const c of allCharges ?? []) {
    chargesByProp[c.property_id] = {
      taxe_fonciere: c.taxe_fonciere,
      insurance:     c.insurance,
      accountant:    c.accountant,
      cfe:           c.cfe,
      condo_fees:    c.condo_fees,
      maintenance:   c.maintenance,
      other:         c.other,
    }
  }

  // ── 3. Dettes actives indexées par asset_id ───────────────────────────────
  const { data: allDebts } = await supabase
    .from('debts')
    .select(`
      asset_id, initial_amount, interest_rate, insurance_rate,
      duration_months, start_date, bank_fees, guarantee_fees, amortization_type
    `)
    .eq('user_id', userId)
    .eq('status', 'active')

  const debtByAsset: Record<string, DbDebt> = {}
  for (const d of allDebts ?? []) {
    if (d.asset_id) {
      debtByAsset[d.asset_id] = {
        initial_amount:    d.initial_amount,
        interest_rate:     d.interest_rate,
        insurance_rate:    d.insurance_rate,
        duration_months:   d.duration_months,
        start_date:        d.start_date,
        bank_fees:         d.bank_fees  ?? 0,
        guarantee_fees:    d.guarantee_fees ?? 0,
        amortization_type: d.amortization_type ?? 'constant',
      }
    }
  }

  // ── 4. Profil utilisateur (TMI) ────────────────────────────────────────────
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('tmi_rate')
    .eq('id', userId)
    .maybeSingle()

  const dbProfile: DbProfile | null = profileRow ? { tmi_rate: profileRow.tmi_rate } : null

  // ── 5. Simulation par propriété ────────────────────────────────────────────
  const results: PropertySimResult[] = []

  for (const prop of properties) {
    const assetId = prop.asset_id as string
    const assetRaw = Array.isArray(prop.asset) ? prop.asset[0] : prop.asset
    const lotsRaw  = (Array.isArray(prop.lots) ? prop.lots : []) as { rent_amount: number | null; status?: string }[]

    const dbProp: DbProperty = {
      purchase_price:              prop.purchase_price,
      purchase_fees:               prop.purchase_fees,
      works_amount:                prop.works_amount,
      furniture_amount:            (prop.furniture_amount as number | null) ?? 0,
      fiscal_regime:               prop.fiscal_regime,
      rental_index_pct:            (prop.rental_index_pct  as number | null) ?? 2.0,
      charges_index_pct:           (prop.charges_index_pct as number | null) ?? 2.0,
      property_index_pct:          (prop.property_index_pct as number | null) ?? 1.0,
      land_share_pct:              (prop.land_share_pct    as number | null) ?? 15,
      amort_building_years:        (prop.amort_building_years  as number | null) ?? 30,
      amort_works_years:           (prop.amort_works_years     as number | null) ?? 15,
      amort_furniture_years:       (prop.amort_furniture_years as number | null) ?? 7,
      gli_pct:                     (prop.gli_pct          as number | null) ?? 0,
      management_pct:              (prop.management_pct   as number | null) ?? 0,
      vacancy_months:              (prop.vacancy_months   as number | null) ?? 0,
      lmp_ssi_rate:                (prop.lmp_ssi_rate     as number | null) ?? 35,
      acquisition_fees_treatment:  (prop.acquisition_fees_treatment as string | null) ?? 'expense_y1',
      lmnp_micro_abattement_pct:   (prop.lmnp_micro_abattement_pct as number | null) ?? 50,
      assumed_total_rent:          (prop.assumed_total_rent as number | null) ?? null,
    }

    const dbAsset: DbAsset | null = assetRaw ? { current_value: assetRaw.current_value } : null
    const dbLots: DbLot[] = lotsRaw.map((l) => ({ rent_amount: l.rent_amount, status: l.status }))
    const dbCharges: DbCharges | null = chargesByProp[prop.id as string] ?? null
    const debt: DbDebt | null = debtByAsset[assetId] ?? null

    // Apport = coût acquisition - capital emprunté (ou coût total si cash)
    const acqCost    = (prop.purchase_price ?? 0) + (prop.purchase_fees ?? 0) + (prop.works_amount ?? 0)
    const downPayment = Math.max(0, acqCost - (debt?.initial_amount ?? 0))

    const input = buildSimulationInputFromDb(
      dbProp, dbAsset, dbLots, dbCharges, debt, dbProfile,
      { downPayment },
    )
    const simulation = runSimulation(input)

    // Capital restant calculé analytiquement à aujourd'hui
    let capitalRemaining = 0
    if (debt?.interest_rate != null && debt.duration_months != null && debt.initial_amount != null) {
      capitalRemaining = computeRemainingCapitalAt(
        {
          principal:        debt.initial_amount,
          annualRatePct:    debt.interest_rate,
          durationYears:    debt.duration_months / 12,
          insuranceRatePct: debt.insurance_rate  ?? 0,
          bankFees:         debt.bank_fees        ?? 0,
          guaranteeFees:    debt.guarantee_fees   ?? 0,
          ...(debt.start_date ? { startDate: new Date(debt.start_date) } : {}),
        },
        today,
      )
    } else if (debt?.initial_amount) {
      // Crédit incomplet : fallback sur le capital initial
      capitalRemaining = debt.initial_amount
    }

    results.push({ propertyId: prop.id as string, assetId, simulation, capitalRemaining })
  }

  const totalMonthlyCFYear1   = results.reduce((s, r) => s + (r.simulation.kpis.monthlyCashFlowYear1 ?? 0), 0)
  const totalCapitalRemaining  = results.reduce((s, r) => s + r.capitalRemaining, 0)

  return { properties: results, totalMonthlyCFYear1, totalCapitalRemaining }
}
