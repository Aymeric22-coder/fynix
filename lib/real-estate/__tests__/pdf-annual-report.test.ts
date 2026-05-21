import { describe, it, expect } from 'vitest'
import { generateAnnualReport, type AnnualReportInput } from '../pdf/annual-report'
import type {
  DbProperty, DbAsset, DbLot, DbCharges, DbDebt, DbProfile,
} from '../build-from-db'
import { buildSimulationInputFromDb, runSimulation } from '../index'

/**
 * Tests basiques du generateur de PDF : verifie qu'on obtient bien un
 * Uint8Array non vide commencant par les bytes magiques %PDF-.
 */

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
const lots: DbLot[]   = [{ rent_amount: 800, status: 'rented' }]
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

function buildInput(year: number): AnnualReportInput {
  const input = buildSimulationInputFromDb(
    property, asset, lots, charges, [debt], profile,
    { downPayment: 55_000 },
  )
  const simulation = runSimulation(input)
  return {
    year,
    propertyName: 'Test Bien',
    property,
    asset,
    lots,
    charges,
    debt,
    profile,
    simulation,
  }
}

describe('generateAnnualReport — bilan annuel PDF', () => {
  it('Test 1 — genere un PDF non vide qui commence par %PDF-', async () => {
    const buffer = await generateAnnualReport(buildInput(2025))
    expect(buffer).toBeInstanceOf(Uint8Array)
    expect(buffer.length).toBeGreaterThan(1000)
    // Bytes magiques PDF : "%PDF-"
    const header = String.fromCharCode(...buffer.slice(0, 5))
    expect(header).toBe('%PDF-')
  })

  it('Test 2 — gere un bien sans credit (pas de debt)', async () => {
    const input = buildInput(2025)
    input.debt = null
    const buffer = await generateAnnualReport(input)
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('Test 3 — gere un bien sans charges saisies', async () => {
    const input = buildInput(2025)
    input.charges = null
    const buffer = await generateAnnualReport(input)
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('Test 4 — taille realiste pour 4 pages (> 5 kB)', async () => {
    const buffer = await generateAnnualReport(buildInput(2025))
    // Les metadonnees PDF sont compressees (FlateDecode), on ne peut pas
    // grep le texte en clair. On verifie juste que la taille correspond
    // a ~ 4 pages : 5-50 kB.
    expect(buffer.length).toBeGreaterThan(5_000)
    expect(buffer.length).toBeLessThan(200_000)
  })

  it('Test 5 — gere une annee future (hors projection)', async () => {
    // L'annee 2099 est hors du horizon de projection : doit gerer sans crash
    const input = buildInput(2099)
    const buffer = await generateAnnualReport(input)
    expect(buffer.length).toBeGreaterThan(1000)
  })
})
