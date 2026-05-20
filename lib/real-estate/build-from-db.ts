/**
 * Helper de transformation : DB rows → RawSimulationInput.
 *
 * Cette fonction est l'unique point d'entrée pour construire un input de
 * simulation à partir des données stockées en base. Elle gère :
 *  - le fallback `assumed_total_rent` → somme des lots
 *  - la traduction des colonnes (snake_case) vers les types lib (camelCase)
 *  - les valeurs partielles d'un crédit (pour le mode "données incomplètes")
 */

import type {
  ChargesInput,
  FiscalRegime,
  PropertyInput,
  RawLoanInput,
  RawSimulationInput,
  RentInput,
} from './types'
import { resolveCharges } from './charges-resolver'
import {
  buildShortTermParamsFromLot,
  computeShortTermRevenue,
} from './short-term/revenue'

// ─────────────────────────────────────────────────────────────────────
//  Types DB minimaux (sous-ensemble des Row types Supabase)
// ─────────────────────────────────────────────────────────────────────

/** Sous-ensemble de `real_estate_properties` Row utilisé pour la simulation */
export interface DbProperty {
  purchase_price:               number | null
  purchase_fees:                number | null
  works_amount:                 number | null
  furniture_amount:             number | null
  fiscal_regime:                string | null
  rental_index_pct:             number | null
  charges_index_pct:            number | null
  property_index_pct:           number | null
  land_share_pct:               number | null
  amort_building_years:         number | null
  amort_works_years:            number | null
  amort_furniture_years:        number | null
  gli_pct:                      number | null
  management_pct:               number | null
  vacancy_months:               number | null
  lmp_ssi_rate:                 number | null
  acquisition_fees_treatment:   string | null
  lmnp_micro_abattement_pct:    number | null
  assumed_total_rent:           number | null
}

/** Sous-ensemble de `assets` Row utilisé pour la valeur estimée */
export interface DbAsset {
  current_value: number | null
}

/** Sous-ensemble de `debts` Row */
export interface DbDebt {
  initial_amount:    number | null
  interest_rate:     number | null
  insurance_rate:    number | null
  duration_months:   number | null
  start_date:        string | null
  bank_fees:         number | null
  guarantee_fees:    number | null
  amortization_type: string | null
  // ── Migration 005 (déjà présent en table) ──
  deferral_type?:    string | null
  deferral_months?:  number | null
  // ── Migration 006 ──
  insurance_base?:   string | null
  insurance_quotite?: number | null
  guarantee_type?:   string | null
}

/** Sous-ensemble de `real_estate_lots` Row */
export interface DbLot {
  rent_amount:    number | null
  status?:        string | null
  // ── Migration 042 — Courte durée (optionnelles) ──
  rental_type?:              string | null
  nightly_rate_low?:         number | null
  nightly_rate_mid?:         number | null
  nightly_rate_high?:        number | null
  occupancy_rate_pct?:       number | null
  cleaning_fee_per_stay?:    number | null
  avg_stay_nights?:          number | null
  platform_airbnb_pct?:      number | null
  platform_booking_pct?:     number | null
  platform_other_pct?:       number | null
  platform_airbnb_mix_pct?:  number | null
  platform_booking_mix_pct?: number | null
  platform_direct_mix_pct?:  number | null
  concierge_fee_pct?:        number | null
  cleaning_cost_per_stay?:   number | null
  linen_cost_per_stay?:      number | null
  seasonality_coefficients?: Record<string, {
    occupancyRatePct: number
    nightlyRate?: number
    blockedDays?: number
  }> | null
}

/**
 * Calcule le revenu mensuel equivalent d'un lot pour alimenter la
 * simulation de projection.
 *
 * - Long term : retourne `rent_amount` (loyer HC mensuel).
 * - Short term / mixed : retourne `netOwnerRevenueTotal / 12`
 *   (revenu net annuel apres commissions plateformes + charges
 *   operationnelles, divise par 12).
 *
 * Pour les lots `mixed`, l'utilisateur peut additionner manuellement
 * via rent_amount + short-term : on additionne les deux ici (rare —
 * cas saisonnier 4 mois / longue duree 8 mois).
 */
export function computeMonthlyRentForLot(lot: DbLot): number {
  const longTermRent = lot.rent_amount ?? 0
  const stParams = buildShortTermParamsFromLot(lot)
  if (!stParams) return longTermRent

  const annual = computeShortTermRevenue(stParams)
  const shortTermMonthly = annual.netOwnerRevenueTotal / 12

  // Pour 'short_term' pur on remplace ; pour 'mixed' on cumule
  // (l'utilisateur peut renseigner les deux blocs).
  return lot.rental_type === 'mixed'
    ? longTermRent + shortTermMonthly
    : shortTermMonthly
}

/** Sous-ensemble de `property_charges` Row (année courante).
 *  Inclut toutes les colonnes de la migration 040 (toutes optionnelles). */
export interface DbCharges {
  taxe_fonciere: number | null
  insurance:     number | null
  accountant:    number | null
  cfe:           number | null
  condo_fees:    number | null
  maintenance:   number | null
  other:         number | null
  // Migration 040 — charges exhaustives
  taxe_habitation?:        number | null
  taxe_logements_vacants?: number | null
  teom?:                   number | null
  insurance_gli_eur?:      number | null
  insurance_gli_pct?:      number | null
  insurance_mrh?:          number | null
  condo_fees_works?:       number | null
  condo_special_fund?:     number | null
  management_agency_eur?:  number | null
  management_agency_pct?:  number | null
  management_airbnb_pct?:  number | null
  management_booking_pct?: number | null
  management_cleaning?:    number | null
  management_concierge?:   number | null
  maintenance_major?:      number | null
  repairs_provision?:      number | null
  legal_fees?:             number | null
  diagnostics_fees?:       number | null
  utilities_internet?:     number | null
  utilities_electricity?:  number | null
  utilities_water?:        number | null
}

/** Sous-ensemble de `profiles` Row pour la TMI */
export interface DbProfile {
  tmi_rate: number | null
}

// ─────────────────────────────────────────────────────────────────────
//  Builder principal
// ─────────────────────────────────────────────────────────────────────

export interface BuildOptions {
  /** Apport personnel à utiliser pour le cumul cash flow et le levier */
  downPayment:     number
  /** Date de simulation (par défaut : aujourd'hui) */
  simulationDate?: Date
  /** Horizon explicite ; sinon max(crédit, 25) ans */
  horizonYears?:   number
  /** TMI par défaut si profile.tmi_rate est null. Défaut 30 % */
  fallbackTmiPct?: number
}

/**
 * Construit un RawSimulationInput à partir des rows DB.
 *
 * Règles de fallback :
 *  - `monthlyRent` = `property.assumed_total_rent` si défini, sinon SUM(`lots.rent_amount`)
 *  - `furnitureAmount` = `property.furniture_amount` (default 0)
 *  - `tmiPct` = `profile.tmi_rate` si renseigné, sinon `fallbackTmiPct` (default 30)
 *  - Si `debt` n'a pas de `interest_rate` ou `start_date` → on renvoie un RawLoanInput partiel
 *    avec ces champs `undefined` ; runSimulation() détectera l'incomplétude.
 */
export function buildSimulationInputFromDb(
  property: DbProperty,
  asset:    DbAsset | null,
  lots:     DbLot[],
  charges:  DbCharges | null,
  debt:     DbDebt | null,
  profile:  DbProfile | null,
  opts:     BuildOptions,
): RawSimulationInput {

  // ─── PROPERTY ───────────────────────────────────────────────────
  const propertyInput: PropertyInput = {
    purchasePrice:    property.purchase_price ?? 0,
    notaryFees:       property.purchase_fees  ?? 0,
    worksAmount:      property.works_amount   ?? 0,
    propertyIndexPct: property.property_index_pct ?? 1.0,
    ...(asset?.current_value != null
      ? { currentEstimatedValue: asset.current_value }
      : {}),
  }

  // ─── LOAN (potentiellement partiel) ─────────────────────────────
  let loanInput: RawLoanInput | undefined
  if (debt) {
    const principal = debt.initial_amount ?? undefined
    // Un crédit DB existe → on transmet ce qu'on a, runSimulation gère l'incomplétude
    loanInput = {
      ...(principal != null ? { principal } : {}),
      ...(debt.interest_rate  != null ? { annualRatePct:    debt.interest_rate  } : {}),
      ...(debt.insurance_rate != null ? { insuranceRatePct: debt.insurance_rate } : {}),
      ...(debt.duration_months != null
        ? { durationYears: debt.duration_months / 12 }
        : {}),
      ...(debt.start_date
        ? { startDate: new Date(debt.start_date) }
        : {}),
      ...(debt.bank_fees      != null ? { bankFees:      debt.bank_fees      } : {}),
      ...(debt.guarantee_fees != null ? { guaranteeFees: debt.guarantee_fees } : {}),
      ...(debt.amortization_type
        ? { amortizationType: debt.amortization_type as 'constant' | 'linear' | 'in_fine' }
        : {}),
      // ── Migration 005 : différé ──
      ...(debt.deferral_type
        ? { deferralType: debt.deferral_type as 'none' | 'partial' | 'total' }
        : {}),
      ...(debt.deferral_months != null ? { deferralMonths: debt.deferral_months } : {}),
      // ── Migration 006 : assurance enrichie ──
      ...(debt.insurance_base
        ? { insuranceBase: debt.insurance_base as 'capital_initial' | 'capital_remaining' }
        : {}),
      ...(debt.insurance_quotite != null
        ? { insuranceQuotitePct: debt.insurance_quotite }
        : {}),
    }
  }

  // ─── RENT (assumed_total_rent prime sur somme des lots) ─────────
  // Pour la courte duree, le revenu mensuel = netOwnerRevenue / 12
  // (apres commissions plateformes + charges operationnelles).
  const lotsSum = lots.reduce((s, l) => s + computeMonthlyRentForLot(l), 0)
  const monthlyRent = property.assumed_total_rent != null
    ? property.assumed_total_rent
    : lotsSum

  const rentInput: RentInput = {
    monthlyRent,
    vacancyMonths:  property.vacancy_months ?? 0,
    rentalIndexPct: property.rental_index_pct ?? 2.0,
  }

  // ─── CHARGES ────────────────────────────────────────────────────
  // Migration 040 : on agrège les nouvelles colonnes dans `other`
  // (fourre-tout déductible dans toutes les calculatrices fiscales).
  // La GLI et les frais d'agence sont résolus via resolveCharges() —
  // si saisis en % ils sont convertis à partir des loyers annuels.
  const num = (v: number | null | undefined) => Math.max(0, v ?? 0)
  const annualRent = monthlyRent * 12
  const resolved = resolveCharges(charges ?? undefined, annualRent)

  // Le calcul existant utilise déjà charges.insurance pour la PNO,
  // donc on ne double-compte pas. On déduit les charges explicites de
  // `resolved.totalAnnualEur` pour ne garder QUE les nouvelles colonnes
  // (migration 040) à injecter dans `other`.
  const alreadyAccountedExplicitly =
    num(charges?.insurance) +        // PNO → champ pno
    num(charges?.taxe_fonciere) +    // → propertyTax
    num(charges?.cfe) +              // → cfe
    num(charges?.accountant) +       // → accountant
    num(charges?.condo_fees) +       // → condoFees
    num(charges?.maintenance) +      // → maintenance
    num(charges?.other)              // → other (déjà inclus ci-dessous)

  const extraChargesFrom040 = Math.max(
    0, resolved.totalAnnualEur - alreadyAccountedExplicitly,
  )

  const chargesInput: ChargesInput = {
    pno:               num(charges?.insurance),
    gliPct:            property.gli_pct ?? 0,
    propertyTax:       num(charges?.taxe_fonciere),
    cfe:               num(charges?.cfe),
    accountant:        num(charges?.accountant),
    condoFees:         num(charges?.condo_fees),
    managementPct:     property.management_pct ?? 0,
    maintenance:       num(charges?.maintenance),
    // `other` cumule l'éventuelle saisie historique + toutes les
    // nouvelles charges (taxe_habitation, GLI résolue en €, copro
    // travaux/ELAN, frais agence résolus, plateformes, gros travaux,
    // legal/diagnostics, utilities) qui passent toutes en charges
    // déductibles standard.
    other:             num(charges?.other) + extraChargesFrom040,
    chargesIndexPct:   property.charges_index_pct ?? 2.0,
  }

  // ─── REGIME (résolution selon fiscal_regime DB) ─────────────────
  const tmiPct = profile?.tmi_rate ?? opts.fallbackTmiPct ?? 30
  const regime = buildFiscalRegime(property, tmiPct)

  return {
    property: propertyInput,
    loan:     loanInput,
    rent:     rentInput,
    charges:  chargesInput,
    regime,
    downPayment:    opts.downPayment,
    ...(opts.simulationDate ? { simulationDate: opts.simulationDate } : {}),
    ...(opts.horizonYears   ? { horizonYears:   opts.horizonYears   } : {}),
  }
}

/**
 * Traduit la colonne `fiscal_regime` (string DB) + paramètres associés
 * en union discriminée FiscalRegime.
 */
function buildFiscalRegime(property: DbProperty, tmiPct: number): FiscalRegime {
  const kind = (property.fiscal_regime ?? 'foncier_nu') as FiscalRegime['kind']

  // Paramètres communs aux régimes "réels"
  const realParams = {
    landSharePct:             property.land_share_pct        ?? 15,
    amortBuildingYears:       property.amort_building_years  ?? 30,
    amortWorksYears:          property.amort_works_years     ?? 15,
    amortFurnitureYears:      property.amort_furniture_years ?? 7,
    furnitureAmount:          property.furniture_amount      ?? 0,
    acquisitionFeesTreatment:
      (property.acquisition_fees_treatment ?? 'expense_y1') as 'expense_y1' | 'amortized',
  }

  switch (kind) {
    case 'sci_is':
      return { kind: 'sci_is', ...realParams }
    case 'sci_ir':
      return { kind: 'sci_ir', tmiPct }
    case 'lmnp_reel':
      return { kind: 'lmnp_reel', tmiPct, ...realParams }
    case 'lmnp_micro':
      return {
        kind: 'lmnp_micro',
        tmiPct,
        abattementPct: property.lmnp_micro_abattement_pct ?? 50,
      }
    case 'lmp':
      return {
        kind: 'lmp',
        tmiPct,
        ssiRatePct: property.lmp_ssi_rate ?? 35,
        ...realParams,
      }
    case 'foncier_nu':
      return { kind: 'foncier_nu', tmiPct }
    case 'foncier_micro':
      return { kind: 'foncier_micro', tmiPct }
    default:
      // Fallback safe : foncier_nu
      return { kind: 'foncier_nu', tmiPct }
  }
}
