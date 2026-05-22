/**
 * V4 — Tests de cohérence inter-écrans : /analyse vs fiche détail.
 *
 * Invariant clé : pour un même bien, le `BienImmo` produit par le
 * helper V4 `buildBienImmoFromSimulation` doit avoir des KPIs
 * STRICTEMENT identiques à la simulation de référence sortant de
 * `runSimulation` (= ce que la fiche détail et la liste affichent
 * depuis V3.1).
 *
 * 3 cas couverts :
 *   1. Mono-crédit standard
 *   2. Multi-crédit (principal + PTZ)
 *   3. Bien avec charges enrichies (colonnes mig 040)
 *
 * Avant V4, le dashboard /analyse calculait ses propres KPIs (`calculerKPIsBien`
 * + `calculerImpotFoncier`) avec un moteur fiscal simplifié. Cette divergence
 * (BUG-007/008, INCOH-002/003/004 de l'audit) est résolue en V4 en réutilisant
 * `computeRealEstatePortfolio` comme source unique.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSimulationInputFromDb,
  runSimulation,
} from '@/lib/real-estate'
import { aggregateLoans } from '@/lib/real-estate/multi-credit'
import { computeRemainingCapitalAt } from '@/lib/real-estate/amortization'
import type {
  DbAsset,
  DbCharges,
  DbDebt,
  DbLot,
  DbProfile,
  DbProperty,
} from '@/lib/real-estate/build-from-db'
import type { LoanInput } from '@/lib/real-estate/types'
import type { PropertySimResult } from '@/lib/real-estate/portfolio'
import {
  buildBienImmoFromSimulation,
  type BienImmoMeta,
} from '../immoFromSimulation'

// ─── Fixtures communes ────────────────────────────────────────────────

const PROFILE: DbProfile = { tmi_rate: 30 }

const META_BASE: BienImmoMeta = {
  uiType:                  'Locatif (LMNP)',
  city:                    'Lyon',
  country:                 'France',
  fiscal_regime:           'lmnp_reel',
  acquisitionDate:         '2024-01-01',
  chargesEstimated:        false,
  principalRatePct:        3.5,
  principalDurationMonths: 240,
  principalStartDate:      '2024-01-01',
}

/**
 * Helper interne : construit un PropertySimResult depuis les inputs DB
 * (= reproduit la logique de `computeRealEstatePortfolio` pour un seul
 * bien, sans avoir besoin de mocker tout Supabase).
 */
function buildPropertySimResult(args: {
  propertyId:   string
  propertyName: string
  assetId:      string
  property:     DbProperty
  asset:        DbAsset | null
  lots:         DbLot[]
  charges:      DbCharges | null
  debts:        DbDebt[]
  profile:      DbProfile | null
}): PropertySimResult {
  const today = new Date()

  // Apport = coût acquisition − somme capitaux empruntés
  const acqCost = (args.property.purchase_price ?? 0)
                + (args.property.purchase_fees ?? 0)
                + (args.property.works_amount ?? 0)
  const totalBorrowed = args.debts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)
  const downPayment = Math.max(0, acqCost - totalBorrowed)

  const input = buildSimulationInputFromDb(
    args.property, args.asset, args.lots, args.charges, args.debts, args.profile,
    { downPayment },
  )
  const simulation = runSimulation(input)

  // CRD analytique multi-crédit (cf. portfolio.ts)
  const validLoans: LoanInput[] = args.debts
    .filter(d => d.interest_rate != null && d.duration_months != null && d.initial_amount != null)
    .map(d => ({
      principal:        d.initial_amount!,
      annualRatePct:    d.interest_rate!,
      durationYears:    d.duration_months! / 12,
      insuranceRatePct: d.insurance_rate ?? 0,
      bankFees:         d.bank_fees      ?? 0,
      guaranteeFees:    d.guarantee_fees ?? 0,
      ...(d.start_date ? { startDate: new Date(d.start_date) } : {}),
    }))
  const capitalRemaining = validLoans.length === 1
    ? computeRemainingCapitalAt(validLoans[0]!, today)
    : validLoans.length > 1
      ? aggregateLoans(validLoans, today).totalRemainingCapital
      : args.debts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)

  return {
    propertyId:   args.propertyId,
    propertyName: args.propertyName,
    assetId:      args.assetId,
    simulation,
    capitalRemaining,
  }
}

// ─── CAS 1 — Mono-crédit standard ─────────────────────────────────────

describe('V4 — cohérence /analyse vs fiche détail : mono-crédit', () => {
  const property: DbProperty = {
    purchase_price:               200_000,
    purchase_fees:                15_000,
    works_amount:                 10_000,
    furniture_amount:             5_000,
    fiscal_regime:                'lmnp_reel',
    rental_index_pct:             2,
    charges_index_pct:            2,
    property_index_pct:           1,
    land_share_pct:               15,
    amort_building_years:         30,
    amort_works_years:            15,
    amort_furniture_years:        7,
    gli_pct:                      0,
    management_pct:               0,
    vacancy_months:               0.5,
    lmp_ssi_rate:                 35,
    acquisition_fees_treatment:   'expense_y1',
    lmnp_micro_abattement_pct:    50,
    assumed_total_rent:           1_200,
  }
  const asset: DbAsset = { current_value: 250_000 }
  const lots: DbLot[] = [{ rent_amount: 1_200, status: 'rented' }]
  const charges: DbCharges = {
    taxe_fonciere: 1_500, insurance: 350, accountant: 0, cfe: 0,
    condo_fees: 600, maintenance: 400, other: 0,
  }
  const debts: DbDebt[] = [{
    initial_amount:    180_000,
    interest_rate:     3.5,
    insurance_rate:    0.2,
    duration_months:   240,
    start_date:        '2024-01-01',
    bank_fees:         800,
    guarantee_fees:    1_500,
    amortization_type: 'constant',
  }]

  const sim = buildPropertySimResult({
    propertyId:   'prop-mono',
    propertyName: 'Studio Lyon',
    assetId:      'asset-mono',
    property, asset, lots, charges, debts, profile: PROFILE,
  })
  const bien = buildBienImmoFromSimulation(sim, META_BASE)

  it('cashflow_net_fiscal × 12 == simulation.kpis.annualCashFlowYear1', () => {
    expect(bien.cashflow_net_fiscal * 12).toBeCloseTo(
      sim.simulation.kpis.annualCashFlowYear1, 10,
    )
  })

  it('credit_restant == sim.capitalRemaining (CRD analytique)', () => {
    expect(bien.credit_restant).toBe(sim.capitalRemaining)
  })

  it('rendement_brut == kpis.grossYieldFAI (dénominateur coût FAI)', () => {
    expect(bien.rendement_brut).toBe(sim.simulation.kpis.grossYieldFAI)
  })

  it('rendement_net == kpis.netYield', () => {
    expect(bien.rendement_net).toBe(sim.simulation.kpis.netYield)
  })

  it('mensualite_credit == kpis.monthlyPayment (avec assurance)', () => {
    expect(bien.mensualite_credit).toBe(sim.simulation.kpis.monthlyPayment)
  })

  it('valeur == kpis.currentNetPropertyValue + capitalRemaining (= currentEstimatedValue)', () => {
    expect(bien.valeur).toBeCloseTo(
      sim.simulation.kpis.currentNetPropertyValue + sim.capitalRemaining, 10,
    )
    // Cohérence : on doit retomber sur asset.current_value (250 000) à la précision flottante
    expect(bien.valeur).toBeCloseTo(250_000, 0)
  })
})

// ─── CAS 2 — Multi-crédit (principal + PTZ) ────────────────────────────

describe('V4 — cohérence /analyse vs fiche détail : multi-crédit (principal + PTZ)', () => {
  const property: DbProperty = {
    purchase_price:               300_000,
    purchase_fees:                22_000,
    works_amount:                 0,
    furniture_amount:             0,
    fiscal_regime:                'foncier_nu',
    rental_index_pct:             2,
    charges_index_pct:            2,
    property_index_pct:           1,
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
    assumed_total_rent:           1_500,
  }
  const asset: DbAsset = { current_value: 320_000 }
  const lots: DbLot[] = [{ rent_amount: 1_500, status: 'rented' }]
  const charges: DbCharges = {
    taxe_fonciere: 1_800, insurance: 400, accountant: 0, cfe: 0,
    condo_fees: 720, maintenance: 500, other: 0,
  }
  const debts: DbDebt[] = [
    {
      initial_amount:    250_000,
      interest_rate:     3.5,
      insurance_rate:    0.2,
      duration_months:   240,
      start_date:        '2024-01-01',
      bank_fees:         800,
      guarantee_fees:    1_500,
      amortization_type: 'constant',
      loan_kind:         'principal',
    },
    {
      initial_amount:    40_000,
      interest_rate:     0,
      insurance_rate:    0,
      duration_months:   240,
      start_date:        '2024-01-01',
      bank_fees:         0,
      guarantee_fees:    0,
      amortization_type: 'constant',
      loan_kind:         'ptz',
    },
  ]

  const sim = buildPropertySimResult({
    propertyId:   'prop-multi',
    propertyName: 'Maison Bordeaux (PTZ)',
    assetId:      'asset-multi',
    property, asset, lots, charges, debts, profile: PROFILE,
  })
  const bien = buildBienImmoFromSimulation(sim, {
    ...META_BASE,
    uiType:        'Locatif nu',
    fiscal_regime: 'foncier_nu',
  })

  it('multi-crédit : mensualite_credit > mensualité du principal seul', () => {
    // Sanity check : la mensualité agrégée doit être > celle du principal isolé
    const monoInput = buildSimulationInputFromDb(
      property, asset, lots, charges, [debts[0]!], PROFILE,
      { downPayment: 50_000 },
    )
    const monoResult = runSimulation(monoInput)
    expect(bien.mensualite_credit).toBeGreaterThan(monoResult.kpis.monthlyPayment)
    // Différence ≈ PTZ taux 0 = 40 000 / 240 mois = 166,67 €/mois
    expect(bien.mensualite_credit - monoResult.kpis.monthlyPayment).toBeCloseTo(40_000 / 240, 1)
  })

  it('cashflow_net_fiscal × 12 == annualCashFlowYear1 (multi)', () => {
    expect(bien.cashflow_net_fiscal * 12).toBeCloseTo(
      sim.simulation.kpis.annualCashFlowYear1, 10,
    )
  })

  it('credit_restant == aggregateLoans.totalRemainingCapital (CRD multi)', () => {
    expect(bien.credit_restant).toBe(sim.capitalRemaining)
    // Le CRD doit être inférieur à la somme des principaux (amortissement écoulé)
    expect(bien.credit_restant).toBeLessThan(250_000 + 40_000)
    expect(bien.credit_restant).toBeGreaterThan(0)
  })

  it('rendement_brut multi == kpis.grossYieldFAI (basé sur totalCost FAI)', () => {
    expect(bien.rendement_brut).toBe(sim.simulation.kpis.grossYieldFAI)
    // Sanity : totalCost FAI = 300k + 22k + 800 + 1500 + 800 + 0 (PTZ frais 0) = ~325k
    // grossYield = 1500 × 12 / 325k ≈ 5,53 %
    expect(bien.rendement_brut).toBeGreaterThan(5)
    expect(bien.rendement_brut).toBeLessThan(7)
  })
})

// ─── CAS 3 — Bien avec charges enrichies (colonnes mig 040) ───────────

describe('V4 — cohérence /analyse vs fiche détail : charges enrichies mig 040', () => {
  const property: DbProperty = {
    purchase_price:               200_000,
    purchase_fees:                15_000,
    works_amount:                 0,
    furniture_amount:             0,
    fiscal_regime:                'foncier_nu',
    rental_index_pct:             2,
    charges_index_pct:            2,
    property_index_pct:           1,
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
    assumed_total_rent:           1_100,
  }
  const asset: DbAsset = { current_value: 220_000 }
  const lots: DbLot[] = [{ rent_amount: 1_100, status: 'rented' }]
  // Charges mig 040 : taxe_habitation, teom, GLI %, MRH, gestion agence,
  // entretien gros œuvre, etc. Le moteur les résout via charges-resolver.
  const charges: DbCharges = {
    // mig 001/005
    taxe_fonciere: 1_500,
    insurance:     350,        // PNO
    accountant:    0,
    cfe:           0,
    condo_fees:    600,
    maintenance:   400,
    other:         0,
    // mig 040 (toutes nullable, ignorées par l'ancien calcul /analyse)
    taxe_habitation:        0,
    taxe_logements_vacants: 0,
    teom:                   180,
    insurance_gli_eur:      0,
    insurance_gli_pct:      2.5,       // 2,5 % des loyers HC → ~330 €/an
    insurance_mrh:          0,
    condo_fees_works:       300,
    condo_special_fund:     0,
    management_agency_eur:  0,
    management_agency_pct:  7,         // 7 % des loyers HC → ~924 €/an
    management_airbnb_pct:  0,
    management_booking_pct: 0,
    management_cleaning:    0,
    management_concierge:   0,
    maintenance_major:      0,
    repairs_provision:      0,
    legal_fees:             0,
    diagnostics_fees:       0,
    utilities_internet:     0,
    utilities_electricity:  0,
    utilities_water:        0,
    other_note:             null,
  } as DbCharges   // notre type DbCharges est étendu mig 040 cf. build-from-db.ts
  const debts: DbDebt[] = [{
    initial_amount:    180_000,
    interest_rate:     3.5,
    insurance_rate:    0.2,
    duration_months:   240,
    start_date:        '2024-01-01',
    bank_fees:         800,
    guarantee_fees:    1_500,
    amortization_type: 'constant',
  }]

  const sim = buildPropertySimResult({
    propertyId:   'prop-mig040',
    propertyName: 'T2 Paris (charges enrichies)',
    assetId:      'asset-mig040',
    property, asset, lots, charges, debts, profile: PROFILE,
  })
  const bien = buildBienImmoFromSimulation(sim, {
    ...META_BASE,
    fiscal_regime: 'foncier_nu',
  })

  it('charges_annuelles inclut bien les colonnes mig 040 (GLI %, gestion %, teom, condo_fees_works)', () => {
    // L'ancien calcul /analyse aurait ignoré insurance_gli_pct (2,5 %),
    // management_agency_pct (7 %), teom (180), condo_fees_works (300).
    // Total ignoré ≈ 330 + 924 + 180 + 300 = 1 734 €/an.
    // Le moteur V4 les inclut → charges_annuelles plus élevées.
    const sumBaseCharges = 1_500 + 350 + 600 + 400   // mig 001/005
    expect(bien.charges_annuelles).toBeGreaterThan(sumBaseCharges + 1_500)
  })

  it('cashflow_net_fiscal × 12 == annualCashFlowYear1 (charges enrichies)', () => {
    expect(bien.cashflow_net_fiscal * 12).toBeCloseTo(
      sim.simulation.kpis.annualCashFlowYear1, 10,
    )
  })

  it('rendement_net basé sur les charges enrichies (cohérent kpis.netYield)', () => {
    expect(bien.rendement_net).toBe(sim.simulation.kpis.netYield)
  })

  it('charges_are_estimated reste exposé via le meta (mode strict V4)', () => {
    // META_BASE a chargesEstimated: false → on attend false
    expect(bien.charges_are_estimated).toBe(false)
    // Et si on passe true (cas "bien sans property_charges en DB") :
    const bienSansCharges = buildBienImmoFromSimulation(sim, {
      ...META_BASE,
      fiscal_regime:    'foncier_nu',
      chargesEstimated: true,
    })
    expect(bienSansCharges.charges_are_estimated).toBe(true)
  })
})

// ─── CAS bonus — Edge cases ───────────────────────────────────────────

describe('V4 — edge cases du helper', () => {
  it('bien sans crédit (achat cash) : credit_restant=0, niveau_levier="Sans crédit", risque=5', () => {
    const property: DbProperty = {
      purchase_price:               150_000,
      purchase_fees:                12_000,
      works_amount:                 0,
      furniture_amount:             0,
      fiscal_regime:                'foncier_nu',
      rental_index_pct:             2, charges_index_pct: 2, property_index_pct: 1,
      land_share_pct:               15,
      amort_building_years:         30, amort_works_years: 15, amort_furniture_years: 7,
      gli_pct:                      0, management_pct: 0, vacancy_months: 0,
      lmp_ssi_rate:                 35, acquisition_fees_treatment: 'expense_y1',
      lmnp_micro_abattement_pct:    50,
      assumed_total_rent:           700,
    }
    const sim = buildPropertySimResult({
      propertyId: 'p-cash', propertyName: 'Studio Cash', assetId: 'a-cash',
      property, asset: { current_value: 160_000 },
      lots: [{ rent_amount: 700, status: 'rented' }],
      charges: { taxe_fonciere: 1_000, insurance: 200, accountant: 0, cfe: 0,
                 condo_fees: 0, maintenance: 200, other: 0 },
      debts: [], profile: PROFILE,
    })
    const bien = buildBienImmoFromSimulation(sim, {
      ...META_BASE, fiscal_regime: 'foncier_nu',
      principalRatePct: 3, principalDurationMonths: 0, principalStartDate: null,
    })
    expect(bien.credit_restant).toBe(0)
    expect(bien.mensualite_credit).toBe(0)
    expect(bien.ltv).toBe(0)
    expect(bien.niveau_levier).toBe('Sans crédit')
    expect(bien.risque_immo).toBe(5)
    expect(bien.duree_restante_mois).toBe(0)
  })

  it('mapping conserve fiscal_regime (utilisé par optimiseurFiscal)', () => {
    const property: DbProperty = {
      purchase_price: 100_000, purchase_fees: 8_000, works_amount: 0, furniture_amount: 0,
      fiscal_regime: 'sci_is', rental_index_pct: 2, charges_index_pct: 2, property_index_pct: 1,
      land_share_pct: 15, amort_building_years: 30, amort_works_years: 15, amort_furniture_years: 7,
      gli_pct: 0, management_pct: 0, vacancy_months: 0, lmp_ssi_rate: 35,
      acquisition_fees_treatment: 'expense_y1', lmnp_micro_abattement_pct: 50,
      assumed_total_rent: 500,
    }
    const sim = buildPropertySimResult({
      propertyId: 'p-sci', propertyName: 'Bien SCI', assetId: 'a-sci',
      property, asset: { current_value: 110_000 },
      lots: [], charges: null, debts: [], profile: PROFILE,
    })
    const bien = buildBienImmoFromSimulation(sim, { ...META_BASE, fiscal_regime: 'sci_is' })
    expect(bien.fiscal_regime).toBe('sci_is')
  })
})
