/**
 * V5 — Tests de cohérence inter-écrans : bandeau /immobilier vs cartes.
 *
 * Invariants clés : le `summary` produit par `computePortfolioSummary` à
 * partir de `buildPropertySummariesFromPortfolio(sims, metas)` doit
 * s'aligner STRICTEMENT sur l'agrégation des KPIs par bien sortant du
 * moteur (cf. V3.1 + V3.2). Avant V5, le bandeau divergait des cartes :
 *   - cash-flow net global à 0 € (bien complet flaggé `incomplete=true` à
 *     cause du `?? true` qui transformait `incompleteData === undefined`)
 *   - charges mensuelles totales à 0 (BUG-D1-M03 — hardcoded)
 *   - plus-value latente agrégée surévaluée (totalCost partiel sans
 *     furniture / bank_fees / guarantee_fees)
 *   - rendement net-net moyen à « Aucun loyer »
 *
 * Portefeuille fictif : 3 biens couvrant les cas typiques.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSimulationInputFromDb,
  runSimulation,
} from '@/lib/real-estate'
import { aggregateLoans } from '@/lib/real-estate/multi-credit'
import { computeRemainingCapitalAt } from '@/lib/real-estate/amortization'
import type {
  DbAsset, DbCharges, DbDebt, DbLot, DbProfile, DbProperty,
} from '@/lib/real-estate/build-from-db'
import type { LoanInput } from '@/lib/real-estate/types'
import type { PropertySimResult } from '@/lib/real-estate/portfolio'
import {
  buildPropertySummariesFromPortfolio,
  computePortfolioSummary,
  type PropertyMetaForPortfolio,
} from '../portfolio-summary'
import type { PropertyUsageType } from '@/types/database.types'
import type { FiscalRegimeKind } from '../types'

// ─── Helper : construit un PropertySimResult depuis les inputs DB ─────
// (reproduit la logique de `computeRealEstatePortfolio` pour 1 bien)
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
  const acqCost = (args.property.purchase_price ?? 0)
                + (args.property.purchase_fees ?? 0)
                + (args.property.works_amount ?? 0)
  const totalBorrowed = args.debts.reduce((s, d) => s + (d.initial_amount ?? 0), 0)
  const downPayment   = Math.max(0, acqCost - totalBorrowed)

  const input = buildSimulationInputFromDb(
    args.property, args.asset, args.lots, args.charges, args.debts, args.profile,
    { downPayment },
  )
  const simulation = runSimulation(input)

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

// ─── Fixtures : portefeuille fictif (mono + multi + RP) ───────────────
const PROFILE: DbProfile = { tmi_rate: 30 }

function makePortfolio() {
  // BIEN 1 — Mono-crédit locatif complet (analogue Tandoori : CF positif)
  const mono = buildPropertySimResult({
    propertyId: 'p-mono', propertyName: 'Studio Lyon', assetId: 'a-mono',
    property: {
      purchase_price: 200_000, purchase_fees: 15_000, works_amount: 10_000,
      furniture_amount: 5_000, fiscal_regime: 'lmnp_reel',
      rental_index_pct: 2, charges_index_pct: 2, property_index_pct: 1,
      land_share_pct: 15, amort_building_years: 30, amort_works_years: 15,
      amort_furniture_years: 7, gli_pct: 0, management_pct: 0,
      vacancy_months: 0.5, lmp_ssi_rate: 35,
      acquisition_fees_treatment: 'expense_y1', lmnp_micro_abattement_pct: 50,
      assumed_total_rent: 1_200,
    },
    asset: { current_value: 250_000 },
    lots: [{ rent_amount: 1_200, status: 'rented' }],
    charges: {
      taxe_fonciere: 1_500, insurance: 350, accountant: 0, cfe: 0,
      condo_fees: 600, maintenance: 400, other: 0,
    },
    debts: [{
      initial_amount: 180_000, interest_rate: 3.5, insurance_rate: 0.2,
      duration_months: 240, start_date: '2024-01-01',
      bank_fees: 800, guarantee_fees: 1_500, amortization_type: 'constant',
    }],
    profile: PROFILE,
  })

  // BIEN 2 — Multi-crédit locatif (principal + PTZ)
  const multi = buildPropertySimResult({
    propertyId: 'p-multi', propertyName: 'Maison Bordeaux', assetId: 'a-multi',
    property: {
      purchase_price: 300_000, purchase_fees: 22_000, works_amount: 0,
      furniture_amount: 0, fiscal_regime: 'foncier_nu',
      rental_index_pct: 2, charges_index_pct: 2, property_index_pct: 1,
      land_share_pct: 15, amort_building_years: 30, amort_works_years: 15,
      amort_furniture_years: 7, gli_pct: 0, management_pct: 0,
      vacancy_months: 0, lmp_ssi_rate: 35,
      acquisition_fees_treatment: 'expense_y1', lmnp_micro_abattement_pct: 50,
      assumed_total_rent: 1_500,
    },
    asset: { current_value: 320_000 },
    lots: [{ rent_amount: 1_500, status: 'rented' }],
    charges: {
      taxe_fonciere: 1_800, insurance: 400, accountant: 0, cfe: 0,
      condo_fees: 720, maintenance: 500, other: 0,
    },
    debts: [
      { initial_amount: 250_000, interest_rate: 3.5, insurance_rate: 0.2,
        duration_months: 240, start_date: '2024-01-01',
        bank_fees: 800, guarantee_fees: 1_500, amortization_type: 'constant',
        loan_kind: 'principal' },
      { initial_amount: 40_000, interest_rate: 0, insurance_rate: 0,
        duration_months: 240, start_date: '2024-01-01',
        bank_fees: 0, guarantee_fees: 0, amortization_type: 'constant',
        loan_kind: 'ptz' },
    ],
    profile: PROFILE,
  })

  // BIEN 3 — RP sans loyer (génère une dépense via mensualité crédit)
  const rp = buildPropertySimResult({
    propertyId: 'p-rp', propertyName: 'RP Paris', assetId: 'a-rp',
    property: {
      purchase_price: 400_000, purchase_fees: 30_000, works_amount: 0,
      furniture_amount: 0, fiscal_regime: 'foncier_nu',  // null → default 'foncier_nu' downstream
      rental_index_pct: 2, charges_index_pct: 2, property_index_pct: 1,
      land_share_pct: 15, amort_building_years: 30, amort_works_years: 15,
      amort_furniture_years: 7, gli_pct: 0, management_pct: 0,
      vacancy_months: 0, lmp_ssi_rate: 35,
      acquisition_fees_treatment: 'expense_y1', lmnp_micro_abattement_pct: 50,
      assumed_total_rent: 0,
    },
    asset: { current_value: 450_000 },
    lots: [{ rent_amount: 0, status: 'owner_occupied' }],
    charges: null,   // pas de charges DB
    debts: [{
      initial_amount: 350_000, interest_rate: 3.2, insurance_rate: 0.3,
      duration_months: 300, start_date: '2024-01-01',
      bank_fees: 600, guarantee_fees: 1_000, amortization_type: 'constant',
    }],
    profile: PROFILE,
  })

  const sims = [mono, multi, rp]
  const metas: PropertyMetaForPortfolio[] = [
    { id: 'p-mono',  name: 'Studio Lyon',     city: 'Lyon',     usageType: 'long_term_rental' as PropertyUsageType, fiscalRegime: 'lmnp_reel' as FiscalRegimeKind, currentValue: 250_000, isShortTerm: false, alertCount: 0 },
    { id: 'p-multi', name: 'Maison Bordeaux', city: 'Bordeaux', usageType: 'long_term_rental' as PropertyUsageType, fiscalRegime: 'foncier_nu' as FiscalRegimeKind, currentValue: 320_000, isShortTerm: false, alertCount: 0 },
    { id: 'p-rp',    name: 'RP Paris',        city: 'Paris',    usageType: 'primary_residence' as PropertyUsageType, fiscalRegime: null,                            currentValue: 450_000, isShortTerm: false, alertCount: 0 },
  ]
  return { sims, metas }
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('V5 — buildPropertySummariesFromPortfolio (cohérence bandeau ↔ cartes)', () => {
  const { sims, metas } = makePortfolio()
  const summaries = buildPropertySummariesFromPortfolio(sims, metas)
  const summary   = computePortfolioSummary(summaries)

  // ── INVARIANT #1 — Cash-flow net global ────────────────────────────
  // Le bandeau doit refléter la VRAIE somme des CF par bien (= ce que les
  // cartes affichent). Avant V5, un bien complet (incompleteData=undefined)
  // était flaggé incomplet à cause du `?? true` → CF forcé à 0 → bandeau à 0.
  it('Invariant #1 — totalMonthlyCashFlow = sum(rentals.kpis.monthlyCashFlowYear1) − sum(non-rentals.kpis.monthlyPayment)', () => {
    const rentalSims  = sims.filter(s => s.propertyId !== 'p-rp')
    const nonRentSims = sims.filter(s => s.propertyId === 'p-rp')

    const expectedCfRentals = rentalSims.reduce(
      (s, x) => s + x.simulation.kpis.monthlyCashFlowYear1, 0,
    )
    const expectedNonRentCost = nonRentSims.reduce(
      (s, x) => s + x.simulation.kpis.monthlyPayment, 0,
    )
    const expected = expectedCfRentals - expectedNonRentCost

    expect(summary.totalMonthlyCashFlow).toBeCloseTo(expected, 6)

    // Sanity : sur ce portefeuille avec biens complets, le CF DOIT être non-nul
    // (c'est le bug le plus visible que V5 corrige : avant le bandeau renvoyait 0).
    expect(summary.totalMonthlyCashFlow).not.toBe(0)
    expect(Math.abs(summary.totalMonthlyCashFlow)).toBeGreaterThan(1)
  })

  // ── INVARIANT #2 — Plus-value latente ──────────────────────────────
  it('Invariant #2 — totalLatentGain = sum(asset.current_value - kpis.totalCost)', () => {
    const expected = sims.reduce((s, x) => {
      const meta = metas.find(m => m.id === x.propertyId)!
      const cv   = meta.currentValue ?? 0
      return s + (cv - x.simulation.kpis.totalCost)
    }, 0)
    expect(summary.totalLatentGain).toBeCloseTo(expected, 6)
  })

  // ── INVARIANT #3 — Charges mensuelles totales ──────────────────────
  // BUG-D1-M03 : avant V5, monthlyCharges hardcodé à 0 → totalMonthlyCharges = 0.
  // Maintenant : somme projection[0].charges / 12 sur les biens locatifs.
  it('Invariant #3 — totalMonthlyCharges = sum(rentals.projection[0].charges) / 12', () => {
    const rentalSims = sims.filter(s => s.propertyId !== 'p-rp')
    const expected = rentalSims.reduce(
      (s, x) => s + (x.simulation.projection[0]?.charges ?? 0) / 12, 0,
    )
    expect(summary.totalMonthlyCharges).toBeCloseTo(expected, 6)
    expect(summary.totalMonthlyCharges).toBeGreaterThan(0)  // BUG-D1-M03 fix
  })

  // ── INVARIANT #4 — Loyers bruts mensuels totaux ─────────────────────
  it('Invariant #4 — totalMonthlyRent = sum(rentals.projection[0].grossRent) / 12', () => {
    const rentalSims = sims.filter(s => s.propertyId !== 'p-rp')
    const expected = rentalSims.reduce(
      (s, x) => s + (x.simulation.projection[0]?.grossRent ?? 0) / 12, 0,
    )
    expect(summary.totalMonthlyRent).toBeCloseTo(expected, 6)
    // Sanity : 1200 + 1500 = 2700 €/mois (loyers attendus du fixture)
    expect(summary.totalMonthlyRent).toBeCloseTo(2_700, 1)
  })

  // ── INVARIANT BONUS — Cartes ↔ bandeau ──────────────────────────────
  // PropertyCard depuis V3.2 : `latentGain = currentValue - kpis.totalCost`.
  // Bandeau V5 : `totalLatentGain = sum(currentValue - kpis.totalCost)`.
  // Donc somme(cartes) doit être strictement égale au total bandeau.
  it('Bonus — totalLatentGain ≡ sum(PropertyCard.latentGain) (cohérence cartes ↔ bandeau)', () => {
    const sumCardLatentGain = sims.reduce((s, sim) => {
      const meta = metas.find(m => m.id === sim.propertyId)!
      // Reproduction exacte de la formule PropertyCard:48-50 (V3.2)
      const cv = meta.currentValue ?? 0
      const totalCostCarte = sim.simulation.kpis.totalCost  // fallback acqCost ignoré ici car kpis présent
      return s + (cv - totalCostCarte)
    }, 0)
    expect(summary.totalLatentGain).toBeCloseTo(sumCardLatentGain, 6)
  })

  // ── Cas particulier : bien complet (Tandoori-like) ──────────────────
  // Garde-fou contre la régression du bug `incompleteData ?? true`. Un bien
  // dont `incompleteData === undefined` (cas nominal du moteur) NE DOIT PAS
  // être traité comme incomplet par le helper V5.
  it('Garde-fou — bien complet (incompleteData === undefined) contribue bien au CF', () => {
    const monoSummary = summaries.find(s => s.id === 'p-mono')!
    const monoSim     = sims.find(s => s.propertyId === 'p-mono')!
    // La simulation marche bien (CF > 0)
    expect(monoSim.simulation.incompleteData).toBeUndefined()
    expect(monoSim.simulation.kpis.monthlyCashFlowYear1).not.toBe(0)
    // Le summary doit propager ce CF (avant V5 il était écrasé à 0)
    expect(monoSummary.monthlyNetCashFlow).toBe(monoSim.simulation.kpis.monthlyCashFlowYear1)
    expect(monoSummary.monthlyNetCashFlow).not.toBe(0)
  })
})

// ─── Cas dégradés ──────────────────────────────────────────────────────

describe('V5 — cas dégradés', () => {
  it('portefeuille vide → tous totaux à 0', () => {
    const summary = computePortfolioSummary(
      buildPropertySummariesFromPortfolio([], []),
    )
    expect(summary.totalProperties).toBe(0)
    expect(summary.totalMonthlyCashFlow).toBe(0)
    expect(summary.totalLatentGain).toBe(0)
  })

  it('bien avec sim incompleteData=true → KPIs financiers forcés à 0', () => {
    // Construit une sim qui retourne incompleteData=true (crédit sans rate).
    const incompleteSim: PropertySimResult = {
      propertyId: 'p-bad', propertyName: 'Bien incomplet', assetId: 'a-bad',
      simulation: {
        amortization:    null,
        projection:      [],
        kpis: {
          totalCost: 0, borrowedAmount: 0, downPayment: 0,
          monthlyPayment: 0, monthlyInsurance: 0,
          grossYieldOnPrice: 0, grossYieldFAI: 0, netYield: 0, netNetYield: 0,
          monthlyCashFlowYear1: 0, annualCashFlowYear1: 0,
          currentNetPropertyValue: 0, leverageRatio: 0, paybackYear: null,
        },
        incompleteData: true,
        missingFields:  ['loan.annualRatePct'],
      },
      capitalRemaining: 50_000,
    }
    const meta: PropertyMetaForPortfolio = {
      id: 'p-bad', name: 'Incomplet', city: null,
      usageType: 'long_term_rental' as PropertyUsageType,
      fiscalRegime: 'lmnp_reel' as FiscalRegimeKind,
      currentValue: 200_000, isShortTerm: false, alertCount: 0,
    }
    const summary = buildPropertySummariesFromPortfolio([incompleteSim], [meta])[0]!
    expect(summary.monthlyNetCashFlow).toBe(0)
    expect(summary.grossYieldPct).toBe(0)
    expect(summary.netNetYieldPct).toBe(0)
    // Mais le CRD reste (calcul indépendant de la sim, depuis aggregateLoans)
    expect(summary.remainingCapital).toBe(50_000)
  })
})
