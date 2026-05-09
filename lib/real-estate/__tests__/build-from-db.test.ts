/**
 * Tests : helper buildSimulationInputFromDb
 *  - assumed_total_rent prime sur la somme des lots quand défini
 *  - fallback sur la somme des lots quand assumed_total_rent est null
 *  - fallback TMI quand profile.tmi_rate est null
 *  - construction du regime correcte selon fiscal_regime DB
 *  - crédit partiel → loan partiel transmis (incomplete data détecté ensuite)
 */

import { describe, it, expect } from 'vitest'
import { buildSimulationInputFromDb, runSimulation } from '..'
import type {
  DbCharges, DbDebt, DbLot, DbProfile, DbProperty, DbAsset,
} from '../build-from-db'

const PROPERTY_BASE: DbProperty = {
  purchase_price:               200_000,
  purchase_fees:                17_000,
  works_amount:                 0,
  furniture_amount:             0,
  fiscal_regime:                'foncier_nu',
  rental_index_pct:             2.0,
  charges_index_pct:            2.0,
  property_index_pct:           1.0,
  land_share_pct:               15,
  amort_building_years:         30,
  amort_works_years:            15,
  amort_furniture_years:        7,
  gli_pct:                      0,
  management_pct:               0,
  vacancy_months:               0,
  lmp_ssi_rate:                 35,
  acquisition_fees_treatment:   'expense_y1',
  lmnp_micro_abattement_pct:    50,
  assumed_total_rent:           null,
}

const ASSET_BASE: DbAsset = { current_value: 220_000 }

const CHARGES_BASE: DbCharges = {
  taxe_fonciere: 1_500, insurance: 350, accountant: 0,
  cfe: 0, condo_fees: 0, maintenance: 0, other: 0,
}

const DEBT_COMPLETE: DbDebt = {
  initial_amount: 180_000,
  interest_rate: 3.5,
  insurance_rate: 0.2,
  duration_months: 240,            // 20 ans
  start_date: '2024-01-01',
  bank_fees: 800,
  guarantee_fees: 1_500,
  amortization_type: 'constant',
}

const PROFILE_BASE: DbProfile = { tmi_rate: 30 }

describe('buildSimulationInputFromDb — assumed_total_rent', () => {

  it('utilise assumed_total_rent quand il est défini (override des lots)', () => {
    const property: DbProperty = { ...PROPERTY_BASE, assumed_total_rent: 1_500 }
    const lots: DbLot[] = [
      { rent_amount: 700 },
      { rent_amount: 800 },
      { rent_amount: 900 },   // somme = 2 400, mais override = 1 500
    ]

    const input = buildSimulationInputFromDb(
      property, ASSET_BASE, lots, CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.rent.monthlyRent).toBe(1_500)
  })

  it('fait la somme des lots si assumed_total_rent est NULL', () => {
    const property: DbProperty = { ...PROPERTY_BASE, assumed_total_rent: null }
    const lots: DbLot[] = [
      { rent_amount: 700 },
      { rent_amount: 800 },
    ]

    const input = buildSimulationInputFromDb(
      property, ASSET_BASE, lots, CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.rent.monthlyRent).toBe(1_500)
  })

  it('renvoie 0 si pas de lots et pas d\'override', () => {
    const property: DbProperty = { ...PROPERTY_BASE, assumed_total_rent: null }
    const input = buildSimulationInputFromDb(
      property, ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.rent.monthlyRent).toBe(0)
  })

  it('ignore les lots avec rent_amount null (somme = 0 dans ce cas)', () => {
    const lots: DbLot[] = [
      { rent_amount: null },
      { rent_amount: null },
    ]
    const input = buildSimulationInputFromDb(
      PROPERTY_BASE, ASSET_BASE, lots, CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.rent.monthlyRent).toBe(0)
  })

  it('considère un override à 0 comme intentionnel (loyer cible 0)', () => {
    const property: DbProperty = { ...PROPERTY_BASE, assumed_total_rent: 0 }
    const lots: DbLot[] = [{ rent_amount: 500 }]
    const input = buildSimulationInputFromDb(
      property, ASSET_BASE, lots, CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    // 0 != null donc l'override prime
    expect(input.rent.monthlyRent).toBe(0)
  })
})

describe('buildSimulationInputFromDb — TMI fallback', () => {

  it('utilise profile.tmi_rate si renseigné', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: 'foncier_nu' },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE,
      { tmi_rate: 41 },
      { downPayment: 30_000 },
    )
    expect((input.regime as { tmiPct: number }).tmiPct).toBe(41)
  })

  it('fallback à 30 % si profile.tmi_rate est null', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: 'foncier_nu' },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE,
      { tmi_rate: null },
      { downPayment: 30_000 },
    )
    expect((input.regime as { tmiPct: number }).tmiPct).toBe(30)
  })

  it('fallback configurable via opts.fallbackTmiPct', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: 'foncier_nu' },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE,
      null,    // pas de profil du tout
      { downPayment: 30_000, fallbackTmiPct: 11 },
    )
    expect((input.regime as { tmiPct: number }).tmiPct).toBe(11)
  })
})

describe('buildSimulationInputFromDb — régimes', () => {

  it('construit un FiscalRegimeSciIs avec les paramètres réels', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: 'sci_is' },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.regime.kind).toBe('sci_is')
    if (input.regime.kind === 'sci_is') {
      expect(input.regime.landSharePct).toBe(15)
      expect(input.regime.amortBuildingYears).toBe(30)
      expect(input.regime.acquisitionFeesTreatment).toBe('expense_y1')
    }
  })

  it('construit un FiscalRegimeLmp avec ssiRatePct depuis property.lmp_ssi_rate', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: 'lmp', lmp_ssi_rate: 42 },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    if (input.regime.kind === 'lmp') {
      expect(input.regime.ssiRatePct).toBe(42)
      expect(input.regime.tmiPct).toBe(30)
    } else {
      throw new Error('Expected LMP regime')
    }
  })

  it('construit un FiscalRegimeLmnpMicro avec abattement depuis property', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: 'lmnp_micro', lmnp_micro_abattement_pct: 71 },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    if (input.regime.kind === 'lmnp_micro') {
      expect(input.regime.abattementPct).toBe(71)
    } else {
      throw new Error('Expected LMNP micro regime')
    }
  })

  it('fallback à foncier_nu si fiscal_regime est null', () => {
    const input = buildSimulationInputFromDb(
      { ...PROPERTY_BASE, fiscal_regime: null },
      ASSET_BASE, [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.regime.kind).toBe('foncier_nu')
  })
})

describe('buildSimulationInputFromDb — crédit partiel → incomplete', () => {

  it('passe un loan partiel quand le crédit DB n\'a pas de taux', () => {
    const debtIncomplete: DbDebt = {
      ...DEBT_COMPLETE,
      interest_rate: null,
      start_date: null,
    }
    const input = buildSimulationInputFromDb(
      PROPERTY_BASE, ASSET_BASE, [{ rent_amount: 900 }],
      CHARGES_BASE, debtIncomplete, PROFILE_BASE,
      { downPayment: 30_000 },
    )

    expect(input.loan).toBeDefined()
    expect(input.loan!.annualRatePct).toBeUndefined()
    expect(input.loan!.principal).toBe(180_000)

    // Et runSimulation détecte l'incomplétude
    const r = runSimulation(input)
    expect(r.incompleteData).toBe(true)
    expect(r.missingFields).toContain('loan.annualRatePct')
  })

  it('renvoie loan = undefined si debt = null (achat cash implicite)', () => {
    const input = buildSimulationInputFromDb(
      PROPERTY_BASE, ASSET_BASE, [{ rent_amount: 900 }],
      CHARGES_BASE, null, PROFILE_BASE,
      { downPayment: 217_000 },
    )
    expect(input.loan).toBeUndefined()

    const r = runSimulation(input)
    expect(r.incompleteData).toBeFalsy()
    expect(r.amortization).toBeNull()
  })

  it('un crédit complet en DB produit une simulation complète sans flag incomplet', () => {
    const input = buildSimulationInputFromDb(
      PROPERTY_BASE, ASSET_BASE, [{ rent_amount: 900 }],
      CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    const r = runSimulation(input)
    expect(r.incompleteData).toBeFalsy()
    expect(r.projection.length).toBeGreaterThan(0)
    expect(r.amortization).not.toBeNull()
  })
})

describe('buildSimulationInputFromDb — utilise current_value de l\'asset comme valeur estimée', () => {

  it('passe asset.current_value en currentEstimatedValue', () => {
    const input = buildSimulationInputFromDb(
      PROPERTY_BASE, { current_value: 250_000 },
      [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.property.currentEstimatedValue).toBe(250_000)
  })

  it('omet currentEstimatedValue si asset null ou current_value null', () => {
    const input = buildSimulationInputFromDb(
      PROPERTY_BASE, null, [], CHARGES_BASE, DEBT_COMPLETE, PROFILE_BASE,
      { downPayment: 30_000 },
    )
    expect(input.property.currentEstimatedValue).toBeUndefined()
  })
})
