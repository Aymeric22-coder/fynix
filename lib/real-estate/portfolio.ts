/**
 * Calcul agrégé de la simulation pour l'ensemble du parc immobilier d'un utilisateur.
 *
 * Utilisé par :
 *  - la page liste /immobilier (enrichissement des cartes)
 *  - POST /api/snapshots (CF réel + mise à jour capital_remaining)
 *
 * Accepte n'importe quel client Supabase (server component ou API route).
 */

import { buildSimulationInputFromDb, runSimulation } from '.'
import { aggregateLoans } from './multi-credit'
import { loadActualData } from './actual'
import { compareActualToSimulation } from './compare'
import { detectDriftAlerts } from './insights'
import type { LoanInput, SimulationResult } from './types'
import type { ComparisonResult } from './compare'
import type { DriftAlert } from './insights'
import type { DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile } from './build-from-db'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PropertySimResult {
  propertyId:       string
  propertyName?:    string
  assetId:          string
  simulation:       SimulationResult
  /** Capital restant dû calculé analytiquement à aujourd'hui. */
  capitalRemaining: number
  /** Comparaison réel vs simulation (Phase 2). null si non chargée. */
  comparison?:      ComparisonResult
  /** Alertes drift détectées. [] si pas de données réelles. */
  driftAlerts?:     DriftAlert[]
}

export interface PortfolioResult {
  properties:            PropertySimResult[]
  /** Somme des cash-flows mensuels Y1 après impôts (toutes propriétés). */
  totalMonthlyCFYear1:   number
  /** Somme des capitaux restants dus (analytique). */
  totalCapitalRemaining: number
}

/** Options pour `computeRealEstatePortfolio`. */
export interface PortfolioOptions {
  /**
   * Si true, charge aussi les données réelles + comparaison + alertes
   * pour chaque bien. Plus coûteux mais nécessaire pour le dashboard.
   * Défaut : false (rétro-compatible avec la liste / snapshot simple).
   */
  withActuals?: boolean
}

// ─── Helper principal ───────────────────────────────────────────────────────

export async function computeRealEstatePortfolio(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId:   string,
  opts:     PortfolioOptions = {},
): Promise<PortfolioResult> {
  const today      = new Date()
  const currentYear = today.getFullYear()

  // ── 1. Propriétés + lots + asset ──────────────────────────────────────────
  const { data: properties } = await supabase
    .from('real_estate_properties')
    .select(`
      *,
      asset:assets!asset_id ( name, current_value ),
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

  // ── 3. Dettes actives groupées par asset_id (V3.1 multi-crédit) ──────────
  // Avant V3.1 : Record<string, DbDebt> → écrasement silencieux du 2e crédit.
  // Maintenant : Record<string, DbDebt[]>, on garde tous les crédits actifs
  // (principal + PTZ + travaux…) et `buildSimulationInputFromDb` + portfolio.ts
  // les agrègent via `aggregateLoans`.
  const { data: allDebts } = await supabase
    .from('debts')
    .select(`
      id, asset_id, initial_amount, interest_rate, insurance_rate,
      duration_months, start_date, bank_fees, guarantee_fees,
      amortization_type, deferral_type, deferral_months,
      insurance_base, insurance_quotite, loan_kind
    `)
    .eq('user_id', userId)
    .eq('status', 'active')

  const debtsByAsset:       Record<string, DbDebt[]>       = {}
  const debtIdsByAsset:     Record<string, string[]>       = {}
  const debtStartByAsset:   Record<string, string | null>  = {}
  for (const d of allDebts ?? []) {
    if (!d.asset_id) continue
    const dbDebt: DbDebt = {
      initial_amount:    d.initial_amount,
      interest_rate:     d.interest_rate,
      insurance_rate:    d.insurance_rate,
      duration_months:   d.duration_months,
      start_date:        d.start_date,
      bank_fees:         d.bank_fees  ?? 0,
      guarantee_fees:    d.guarantee_fees ?? 0,
      amortization_type: d.amortization_type ?? 'constant',
      deferral_type:     d.deferral_type     ?? 'none',
      deferral_months:   d.deferral_months   ?? 0,
      insurance_base:    d.insurance_base    ?? 'capital_initial',
      insurance_quotite: d.insurance_quotite ?? 100,
      loan_kind:         d.loan_kind         ?? 'principal',
    }
    if (!debtsByAsset[d.asset_id])     debtsByAsset[d.asset_id]     = []
    if (!debtIdsByAsset[d.asset_id])   debtIdsByAsset[d.asset_id]   = []
    debtsByAsset[d.asset_id]!.push(dbDebt)
    debtIdsByAsset[d.asset_id]!.push(d.id as string)
    // Pour le comparateur réel-vs-simulé (loadActualData), on garde la
    // start_date du PREMIER crédit principal (cohérence historique).
    if ((d.loan_kind ?? 'principal') === 'principal' && !debtStartByAsset[d.asset_id]) {
      debtStartByAsset[d.asset_id] = d.start_date as string | null
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
    const debts: DbDebt[] = debtsByAsset[assetId] ?? []

    // Apport = coût acquisition - somme capitaux empruntés (ou coût total si cash).
    // Multi-crédit V3.1 : sum(initial_amount) au lieu d'un seul prêt.
    const acqCost = (prop.purchase_price ?? 0) + (prop.purchase_fees ?? 0) + (prop.works_amount ?? 0)
    const totalBorrowed = debts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)
    const downPayment = Math.max(0, acqCost - totalBorrowed)

    const input = buildSimulationInputFromDb(
      dbProp, dbAsset, dbLots, dbCharges, debts, dbProfile,
      { downPayment },
    )
    const simulation = runSimulation(input)

    // Capital restant analytique à aujourd'hui — somme tous prêts actifs.
    // Pour 1 seul crédit, équivalent strict à l'ancien calcul
    // (computeRemainingCapitalAt). Cf. multi-credit-consistency.test.ts.
    const validLoans: LoanInput[] = debts
      .filter(d =>
        d.interest_rate  != null &&
        d.duration_months != null &&
        d.initial_amount  != null,
      )
      .map(d => ({
        principal:        d.initial_amount!,
        annualRatePct:    d.interest_rate!,
        durationYears:    d.duration_months! / 12,
        insuranceRatePct: d.insurance_rate  ?? 0,
        bankFees:         d.bank_fees        ?? 0,
        guaranteeFees:    d.guarantee_fees   ?? 0,
        ...(d.start_date ? { startDate: new Date(d.start_date) } : {}),
      }))
    let capitalRemaining = 0
    if (validLoans.length > 0) {
      capitalRemaining = aggregateLoans(validLoans, today).totalRemainingCapital
    } else {
      // Crédits incomplets : fallback sur la somme des capitaux initiaux.
      capitalRemaining = debts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)
    }

    const propertyName = assetRaw?.name as string | undefined
    const result: PropertySimResult = { propertyId: prop.id as string, propertyName, assetId, simulation, capitalRemaining }

    // ── Phase 2 (optionnel) : charge le réel + comparaison + alertes ──
    if (opts.withActuals) {
      // V3.1 : on garde l'id du crédit principal pour le suivi réel (loadActualData
      // s'attend à un debtId unique). Les crédits secondaires ne sont pas trackés.
      const debtId = debtIdsByAsset[assetId]?.[0] ?? null
      const actualData = await loadActualData(supabase, userId, assetId, prop.id as string, debtId)
      const startYearStr = debtStartByAsset[assetId]
      const simStartYear = startYearStr
        ? new Date(startYearStr).getUTCFullYear()
        : (actualData.firstYear ?? today.getUTCFullYear())
      const comparison = compareActualToSimulation(simulation, actualData, simStartYear)
      result.comparison  = comparison
      result.driftAlerts = detectDriftAlerts(comparison)
    }

    results.push(result)
  }

  const totalMonthlyCFYear1   = results.reduce((s, r) => s + (r.simulation.kpis.monthlyCashFlowYear1 ?? 0), 0)
  const totalCapitalRemaining  = results.reduce((s, r) => s + r.capitalRemaining, 0)

  return { properties: results, totalMonthlyCFYear1, totalCapitalRemaining }
}
