import { describe, it, expect } from 'vitest'
import { runWhatIfSim } from '@/components/real-estate/what-if-simulator'
import type {
  DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile,
} from '../build-from-db'

/**
 * Tests du calcul what-if : verifie que les variations de parametres
 * ont l'effet attendu sur les KPIs comparatifs.
 */

// ─── Fixture : un bien locatif simple, foncier nu ──────────────────────

const property: DbProperty = {
  purchase_price:              200_000,
  purchase_fees:               15_000,
  works_amount:                0,
  furniture_amount:            0,
  fiscal_regime:               'foncier_nu',
  rental_index_pct:            2.0,
  charges_index_pct:           2.0,
  property_index_pct:          1.0,
  land_share_pct:              15,
  amort_building_years:        30,
  amort_works_years:           15,
  amort_furniture_years:       7,
  gli_pct:                     0,
  management_pct:              0,
  vacancy_months:              0,
  lmp_ssi_rate:                35,
  acquisition_fees_treatment:  'expense_y1',
  lmnp_micro_abattement_pct:   50,
  assumed_total_rent:          null,
}

const asset: DbAsset = { current_value: 220_000 }

const lots: DbLot[] = [
  { rent_amount: 800, status: 'rented' },
]

const charges: DbCharges = {
  taxe_fonciere: 1200, insurance: 240, accountant: 0, cfe: 0,
  condo_fees: 600, maintenance: 480, other: 0,
}

const debt: DbDebt = {
  initial_amount:    160_000,
  interest_rate:     3.5,
  insurance_rate:    0.3,
  duration_months:   300,
  start_date:        '2024-01-01',
  bank_fees:         0,
  guarantee_fees:    0,
  amortization_type: 'constant',
}

const profile: DbProfile = { tmi_rate: 30 }

const baseParams = {
  monthlyRent:    800,
  annualRatePct:  3.5,
  vacancyMonths:  0,
  annualCharges:  1200 + 240 + 600 + 480, // 2520
  currentValue:   220_000,
}

describe('runWhatIfSim — what-if calculation', () => {
  it('Test 1 — loyer +10 % => cash-flow augmente', () => {
    const base = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    const up10 = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams, monthlyRent: 880,
    })
    expect(up10.monthlyCashFlow).toBeGreaterThan(base.monthlyCashFlow)
    // Le rendement brut augmente proportionnellement
    expect(up10.grossYield).toBeGreaterThan(base.grossYield)
  })

  it('Test 2 — taux +1 % => mensualite augmente, CF diminue', () => {
    const base = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    const rateUp = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams, annualRatePct: 4.5,
    })
    expect(rateUp.monthlyPayment).toBeGreaterThan(base.monthlyPayment)
    expect(rateUp.monthlyCashFlow).toBeLessThan(base.monthlyCashFlow)
  })

  it('Test 3 — vacance 2 mois => CF inferieur, ~2/12 de loyers perdus', () => {
    const base = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    const vac = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams, vacancyMonths: 2,
    })
    expect(vac.monthlyCashFlow).toBeLessThan(base.monthlyCashFlow)
    // 2 mois de vacance ≈ -800 EUR x 2 / 12 mois = -133 EUR/mois en pure brut
    // Apres fiscalite : un peu different, mais la perte est significative
    const expectedLoss = 800 * 2 / 12  // ~133 EUR/mois en brut
    expect(base.monthlyCashFlow - vac.monthlyCashFlow).toBeGreaterThan(expectedLoss * 0.5)
  })

  it('Test 4 — reinitialisation => resultats identiques a la base', () => {
    const a = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    const b = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    expect(a.monthlyCashFlow).toBe(b.monthlyCashFlow)
    expect(a.grossYield).toBe(b.grossYield)
    expect(a.monthlyPayment).toBe(b.monthlyPayment)
    expect(a.netNetYield).toBe(b.netNetYield)
    expect(a.netValue).toBe(b.netValue)
  })

  it('Test 5 — scenario pessimiste => CF inferieur a optimiste', () => {
    const pessimist = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams,
      monthlyRent:   Math.round(800 * 0.92),
      annualRatePct: 3.5 + 0.75,
      vacancyMonths: 1.5,
      annualCharges: Math.round(2520 * 1.15),
    })
    const optimist = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams,
      monthlyRent:   Math.round(800 * 1.08),
      vacancyMonths: 0,
      annualCharges: Math.round(2520 * 0.95),
    })
    expect(pessimist.monthlyCashFlow).toBeLessThan(optimist.monthlyCashFlow)
  })

  it('Test 6 — current_value override change netValue lineairement', () => {
    const base = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    const valueUp = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams, currentValue: 250_000,
    })
    // +30k de valeur estimee => +30k de net value (CRD inchange)
    expect(valueUp.netValue - base.netValue).toBeCloseTo(30_000, -2)
  })

  it('Test 7 — charges +30 % => CF diminue', () => {
    const base = runWhatIfSim(property, asset, lots, charges, debt, profile, baseParams)
    const chargesUp = runWhatIfSim(property, asset, lots, charges, debt, profile, {
      ...baseParams, annualCharges: Math.round(2520 * 1.3),
    })
    expect(chargesUp.monthlyCashFlow).toBeLessThan(base.monthlyCashFlow)
  })
})
