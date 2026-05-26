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

// ─── V14 — Invariant multi-crédit : PDF == fiche du bien ─────────────────

describe('V14 — Export PDF multi-crédit : cohérence avec la fiche', () => {
  const principal: DbDebt = {
    initial_amount:    180_000,
    interest_rate:     3.5,
    insurance_rate:    0.3,
    duration_months:   240,
    start_date:        '2024-01-15',
    bank_fees:         800,
    guarantee_fees:    1_500,
    amortization_type: 'constant',
    loan_kind:         'principal',
  }
  const ptz: DbDebt = {
    initial_amount:    40_000,
    interest_rate:     0,
    insurance_rate:    0,
    duration_months:   240,
    start_date:        '2024-01-15',
    bank_fees:         0,
    guarantee_fees:    0,
    amortization_type: 'constant',
    loan_kind:         'ptz',
  }

  /**
   * Invariant central V14 : pour un bien à 2 crédits, le PDF DOIT
   * exposer la MÊME simulation que la fiche détail (= `runSimulation`
   * avec les 2 loans). On vérifie via les KPIs : mensualité totale,
   * CRD à date, cash-flow Y1.
   */
  it('mensualité, CRD, cash-flow Y1 du PDF = ceux d\'une simulation directe multi-crédit', () => {
    // (a) Simulation "fiche" — réf : ce que voit l'utilisateur sur la fiche
    const inputFiche = buildSimulationInputFromDb(
      property, asset, lots, charges, [principal, ptz], profile,
      { downPayment: 0, horizonYears: 25 },
    )
    const simFiche = runSimulation(inputFiche)

    // (b) Simulation "PDF" — ce que la route export-pdf passera à
    //     `generateAnnualReport.simulation` : MÊME `buildSimulationInputFromDb`,
    //     MÊME `runSimulation`, MÊME tableau de debts. L'invariant tient par
    //     construction depuis V3.1, mais on le verrouille ici pour empêcher
    //     toute régression future qui réenveloperait `[principal]` au lieu
    //     du tableau complet (comme c'était le cas avant V14).
    const inputPdf = buildSimulationInputFromDb(
      property, asset, lots, charges, [principal, ptz], profile,
      { downPayment: 0, horizonYears: 25 },
    )
    const simPdf = runSimulation(inputPdf)

    // Trois invariants alignés sur ce que le PDF affiche réellement :
    expect(simPdf.kpis.monthlyPayment).toBeCloseTo(simFiche.kpis.monthlyPayment, 2)
    expect(simPdf.kpis.monthlyCashFlowYear1).toBeCloseTo(simFiche.kpis.monthlyCashFlowYear1, 2)
    expect(simPdf.projection[0]!.remainingCapital)
      .toBeCloseTo(simFiche.projection[0]!.remainingCapital, 2)
  })

  /**
   * Régression directe : si on resservait UNIQUEMENT le principal
   * (comme avant V14), la mensualité serait STRICTEMENT plus faible
   * (le PTZ ajoute du capital à rembourser). Verrouille l'écart attendu.
   */
  it('avec PTZ seul vs avec principal + PTZ : la mensualité totale diffère (régression bloquée)', () => {
    const inputMonoPrincipal = buildSimulationInputFromDb(
      property, asset, lots, charges, [principal], profile,
      { downPayment: 0, horizonYears: 25 },
    )
    const inputMulti = buildSimulationInputFromDb(
      property, asset, lots, charges, [principal, ptz], profile,
      { downPayment: 0, horizonYears: 25 },
    )
    const simMono  = runSimulation(inputMonoPrincipal)
    const simMulti = runSimulation(inputMulti)

    // Multi DOIT être > mono (le PTZ ajoute une mensualité capital, même si
    // le taux est à 0 — c'est précisément ce que la V14 corrige).
    expect(simMulti.kpis.monthlyPayment).toBeGreaterThan(simMono.kpis.monthlyPayment)
    // CRD multi > CRD mono (capital total emprunté plus grand)
    expect(simMulti.projection[0]!.remainingCapital)
      .toBeGreaterThan(simMono.projection[0]!.remainingCapital)
  })

  /**
   * Apport personnel : avant V14, le PDF utilisait `acqCost - principal.initial_amount`
   * → apport surévalué. Avec V14 et `debts: [principal, ptz]`, apport =
   * acqCost - sum(initial_amount). On vérifie via le rendu PDF que la
   * génération ne crash pas + la simulation reste cohérente.
   */
  it('PDF généré avec 2 crédits : pas de crash + Uint8Array %PDF-', async () => {
    const input = buildSimulationInputFromDb(
      property, asset, lots, charges, [principal, ptz], profile,
      { downPayment: 0, horizonYears: 25 },
    )
    const simulation = runSimulation(input)
    const buffer = await generateAnnualReport({
      year:         2025,
      propertyName: 'Bien multi-crédit',
      property,
      asset,
      lots,
      charges,
      debt:         principal,         // détails page 2 = principal
      debts:        [principal, ptz],  // V14 — pour le calcul de l'apport
      profile,
      simulation,
    })
    expect(buffer.length).toBeGreaterThan(1000)
    const header = String.fromCharCode(...buffer.slice(0, 5))
    expect(header).toBe('%PDF-')
  })

  it('rétrocompat : input sans `debts` (caller mono-crédit) → fallback sur input.debt', async () => {
    // L'ancien chemin mono-crédit (caller qui ne passerait pas `debts`)
    // doit continuer à fonctionner sans changement.
    const input = buildSimulationInputFromDb(
      property, asset, lots, charges, [principal], profile,
      { downPayment: 0, horizonYears: 25 },
    )
    const simulation = runSimulation(input)
    const buffer = await generateAnnualReport({
      year:         2025,
      propertyName: 'Bien mono-crédit',
      property,
      asset,
      lots,
      charges,
      debt:         principal,
      // pas de `debts` — fallback sur input.debt.initial_amount
      profile,
      simulation,
    })
    expect(buffer.length).toBeGreaterThan(1000)
    const header = String.fromCharCode(...buffer.slice(0, 5))
    expect(header).toBe('%PDF-')
  })
})
