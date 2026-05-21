/**
 * V3.1 — Tests de cohérence multi-crédit :
 *
 *   1. NON-RÉGRESSION mono-crédit : un bien à 1 seul crédit passé via
 *      `loans: [x]` doit produire des KPIs (monthlyCashFlowYear1,
 *      monthlyPayment, totalCost, capitalRemaining) STRICTEMENT identiques
 *      à ceux produits par l'ancien chemin `loan: x`. Objectif : zéro drift
 *      sur les biens mono-crédit existants après cette refonte.
 *
 *   2. COHÉRENCE INTER-ÉCRANS multi-crédit : un même bien à 2 crédits (principal
 *      + PTZ) doit donner le MÊME monthlyCashFlowYear1 et la MÊME LTV via :
 *        (a) le moteur direct : runSimulation({ loans: [...] })
 *        (b) le portfolio agrégé : computeRealEstatePortfolio (via mock supabase)
 *      C'est l'invariant garantissant que la carte de la liste, la Synthèse de
 *      la fiche détail et l'onglet Rentabilité affichent le même chiffre.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSimulationInputFromDb,
  runSimulation,
} from '..'
import type { LoanInput, SimulationInput } from '../types'
import { computeRealEstatePortfolio } from '../portfolio'
import type {
  DbAsset,
  DbCharges,
  DbDebt,
  DbLot,
  DbProfile,
  DbProperty,
} from '../build-from-db'

// ─── Fixtures ─────────────────────────────────────────────────────────

const PRINCIPAL_LOAN: LoanInput = {
  principal:        200_000,
  annualRatePct:    3.5,
  durationYears:    20,
  insuranceRatePct: 0.25,
  bankFees:         800,
  guaranteeFees:    1_500,
  startDate:        new Date('2024-01-01'),
}

const PTZ_LOAN: LoanInput = {
  principal:        40_000,
  annualRatePct:    0,
  durationYears:    20,
  insuranceRatePct: 0,
  bankFees:         0,
  guaranteeFees:    0,
  startDate:        new Date('2024-01-01'),
}

// NOTE : on ne fixe pas `simulationDate` ici. La cohérence CRD entre les
// chemins direct et portfolio repose sur le fait qu'ils utilisent tous deux
// `new Date()` à quelques ms d'écart (CRD analytique stable à cette échelle).
const BASE_INPUT_NO_LOAN: Omit<SimulationInput, 'loan' | 'loans'> = {
  property: {
    purchasePrice:    200_000,
    notaryFees:       15_000,
    worksAmount:      10_000,
    currentEstimatedValue: 250_000,
    propertyIndexPct: 1.0,
  },
  rent:    { monthlyRent: 1_200, vacancyMonths: 0.5, rentalIndexPct: 2.0 },
  charges: {
    pno: 350, gliPct: 0, propertyTax: 1_500, cfe: 0, accountant: 0,
    condoFees: 600, managementPct: 0, maintenance: 400, other: 0,
    chargesIndexPct: 2.0,
  },
  regime: { kind: 'foncier_nu', tmiPct: 30 },
  downPayment: 26_300,   // = totalCost - 240k empruntés
}

// ─── Test 1 — Non-régression mono-crédit ──────────────────────────────

describe('V3.1 — non-régression mono-crédit (loans: [x] == loan: x)', () => {

  it('KPIs strictement identiques entre loan:x et loans:[x] (taux > 0)', () => {
    const viaLegacy = runSimulation({
      ...BASE_INPUT_NO_LOAN,
      loan: PRINCIPAL_LOAN,
    })
    const viaMulti = runSimulation({
      ...BASE_INPUT_NO_LOAN,
      loans: [PRINCIPAL_LOAN],
    })

    expect(viaLegacy.incompleteData).toBeFalsy()
    expect(viaMulti.incompleteData).toBeFalsy()

    // Précision 1e-10 € : on tolère uniquement le bruit floating-point pur.
    expect(viaMulti.kpis.monthlyCashFlowYear1).toBeCloseTo(viaLegacy.kpis.monthlyCashFlowYear1, 10)
    expect(viaMulti.kpis.monthlyPayment      ).toBeCloseTo(viaLegacy.kpis.monthlyPayment,       10)
    expect(viaMulti.kpis.totalCost           ).toBeCloseTo(viaLegacy.kpis.totalCost,            10)
    expect(viaMulti.kpis.currentNetPropertyValue).toBeCloseTo(viaLegacy.kpis.currentNetPropertyValue, 10)
    expect(viaMulti.kpis.borrowedAmount      ).toBe(viaLegacy.kpis.borrowedAmount)
    expect(viaMulti.kpis.grossYieldFAI       ).toBeCloseTo(viaLegacy.kpis.grossYieldFAI,        10)
    expect(viaMulti.kpis.netNetYield         ).toBeCloseTo(viaLegacy.kpis.netNetYield,          10)
    expect(viaMulti.kpis.paybackYear         ).toBe(viaLegacy.kpis.paybackYear)
  })

  it('projection année par année identique entre les deux chemins', () => {
    const viaLegacy = runSimulation({ ...BASE_INPUT_NO_LOAN, loan: PRINCIPAL_LOAN })
    const viaMulti  = runSimulation({ ...BASE_INPUT_NO_LOAN, loans: [PRINCIPAL_LOAN] })

    expect(viaMulti.projection.length).toBe(viaLegacy.projection.length)
    for (let i = 0; i < viaLegacy.projection.length; i++) {
      const a = viaLegacy.projection[i]!
      const b = viaMulti.projection[i]!
      expect(b.cashFlowAfterTax  ).toBeCloseTo(a.cashFlowAfterTax,   10)
      expect(b.loanPayment       ).toBeCloseTo(a.loanPayment,        10)
      expect(b.remainingCapital  ).toBeCloseTo(a.remainingCapital,   10)
      expect(b.principalRepaid   ).toBeCloseTo(a.principalRepaid,    10)
      expect(b.interest          ).toBeCloseTo(a.interest,           10)
    }
  })

  it('PTZ (taux 0) seul : identique entre les deux chemins', () => {
    const viaLegacy = runSimulation({ ...BASE_INPUT_NO_LOAN, loan: PTZ_LOAN, downPayment: 185_000 })
    const viaMulti  = runSimulation({ ...BASE_INPUT_NO_LOAN, loans: [PTZ_LOAN], downPayment: 185_000 })
    expect(viaMulti.kpis.monthlyPayment      ).toBeCloseTo(viaLegacy.kpis.monthlyPayment,       10)
    expect(viaMulti.kpis.monthlyCashFlowYear1).toBeCloseTo(viaLegacy.kpis.monthlyCashFlowYear1, 10)
  })
})

// ─── Test 2 — Multi-crédit : moteur direct vs portfolio agrégé ────────

/**
 * Mock minimal Supabase client pour `computeRealEstatePortfolio`.
 * Implémente uniquement ce qui est lu par la fonction : `.from(table)`
 * chaîné avec `.select / .eq / .order / .maybeSingle`.
 */
function makeMockSupabase(opts: {
  properties: unknown[]
  charges:    unknown[]
  debts:      unknown[]
  profile:    { tmi_rate: number | null } | null
}) {
  // Une chaîne `from(...).select(...).eq(...).eq(...).maybeSingle()` doit
  // renvoyer { data, error }. On distingue par nom de table.
  function fromTable(table: string) {
    const result =
      table === 'real_estate_properties' ? { data: opts.properties, error: null } :
      table === 'property_charges'       ? { data: opts.charges,    error: null } :
      table === 'debts'                  ? { data: opts.debts,      error: null } :
      table === 'profiles'               ? { data: opts.profile,    error: null } :
                                            { data: null, error: null }
    // Chaîne fluide : tout renvoie `this`, sauf `maybeSingle()` qui renvoie
    // directement `{ data, error }` (sans tableau).
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq:     () => chain,
      order:  () => chain,
      maybeSingle: () => (table === 'profiles' ? { data: opts.profile, error: null } : result),
      then: undefined,
    }
    // Comme la fonction await directement le résultat de `.eq(...)`, on
    // expose les valeurs `data` / `error` via `then` (thenable).
    chain.then = (cb: (v: unknown) => unknown) => cb(result)
    return chain
  }
  return { from: fromTable } as unknown as Parameters<typeof computeRealEstatePortfolio>[0]
}

describe('V3.1 — cohérence inter-écrans multi-crédit (principal + PTZ)', () => {

  // Données DB équivalentes à PRINCIPAL_LOAN + PTZ_LOAN ci-dessus.
  const dbProperty: DbProperty = {
    purchase_price:               200_000,
    purchase_fees:                15_000,
    works_amount:                 10_000,
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
    vacancy_months:               0.5,
    lmp_ssi_rate:                 35,
    acquisition_fees_treatment:   'expense_y1',
    lmnp_micro_abattement_pct:    50,
    assumed_total_rent:           1_200,
  }
  const dbAsset:   DbAsset      = { current_value: 250_000 }
  const dbLots:    DbLot[]      = [{ rent_amount: 1_200, status: 'rented' }]
  const dbCharges: DbCharges    = {
    taxe_fonciere: 1_500, insurance: 350, accountant: 0, cfe: 0,
    condo_fees: 600, maintenance: 400, other: 0,
  }
  const dbProfile: DbProfile    = { tmi_rate: 30 }

  const dbDebts: DbDebt[] = [
    {
      initial_amount: 200_000, interest_rate: 3.5, insurance_rate: 0.25,
      duration_months: 240, start_date: '2024-01-01',
      bank_fees: 800, guarantee_fees: 1_500, amortization_type: 'constant',
      loan_kind: 'principal',
    },
    {
      initial_amount: 40_000, interest_rate: 0, insurance_rate: 0,
      duration_months: 240, start_date: '2024-01-01',
      bank_fees: 0, guarantee_fees: 0, amortization_type: 'constant',
      loan_kind: 'ptz',
    },
  ]

  const acqCost     = 200_000 + 15_000 + 10_000    // 225_000
  const totalBorrow = 200_000 + 40_000             // 240_000
  const downPayment = Math.max(0, acqCost - totalBorrow)   // 0
  // Pas de simulationDate : on laisse les deux chemins prendre `new Date()`

  it('moteur direct (runSimulation) : multi-crédit ≠ mono-crédit', () => {
    // Sanity : mensualité avec 2 prêts > mensualité avec le principal seul
    const monoResult = runSimulation({ ...BASE_INPUT_NO_LOAN, loans: [PRINCIPAL_LOAN] })
    const multi      = runSimulation({
      ...BASE_INPUT_NO_LOAN,
      loans: [PRINCIPAL_LOAN, PTZ_LOAN],
      downPayment,
    })
    expect(multi.kpis.monthlyPayment).toBeGreaterThan(monoResult.kpis.monthlyPayment)
    expect(multi.kpis.monthlyPayment).toBeCloseTo(
      monoResult.kpis.monthlyPayment + 40_000 / 240,  // PTZ taux 0 = 40k / 240 mois
      0,
    )
  })

  it('cohérence : runSimulation(loans) == computeRealEstatePortfolio (mêmes KPIs)', async () => {
    // Chemin (a) — moteur direct via buildSimulationInputFromDb (= ce que fait
    // SimulationPanel) :
    const inputA = buildSimulationInputFromDb(
      dbProperty, dbAsset, dbLots, dbCharges, dbDebts, dbProfile,
      { downPayment },
    )
    const resultA = runSimulation(inputA)

    // Chemin (b) — portfolio agrégé via mock supabase (= ce que fait la liste
    // /immobilier) :
    const mockSupabase = makeMockSupabase({
      properties: [
        {
          ...dbProperty,
          id:       'prop-1',
          asset_id: 'asset-1',
          asset:    { name: 'Test', current_value: 250_000 },
          lots:     dbLots.map(l => ({ rent_amount: l.rent_amount, status: l.status })),
        },
      ],
      charges: [{ property_id: 'prop-1', ...dbCharges }],
      debts: dbDebts.map((d, i) => ({
        ...d,
        id:       `debt-${i}`,
        asset_id: 'asset-1',
      })),
      profile: { tmi_rate: 30 },
    })
    const portfolio = await computeRealEstatePortfolio(mockSupabase, 'user-1')

    expect(portfolio.properties).toHaveLength(1)
    const propResult = portfolio.properties[0]!
    expect(propResult.simulation.incompleteData).toBeFalsy()

    // INVARIANT clé : même CF mensuel Y1 entre la simulation directe et la
    // simulation portfolio. Garantit que la carte de la liste == fiche détail.
    expect(propResult.simulation.kpis.monthlyCashFlowYear1).toBeCloseTo(
      resultA.kpis.monthlyCashFlowYear1, 6,
    )
    // Mensualité crédit identique (multi-crédit agrégé via aggregateLoans).
    expect(propResult.simulation.kpis.monthlyPayment).toBeCloseTo(
      resultA.kpis.monthlyPayment, 6,
    )
    // Coût total et borrowedAmount identiques (frais bancaires cumulés).
    expect(propResult.simulation.kpis.totalCost).toBeCloseTo(resultA.kpis.totalCost, 6)
    expect(propResult.simulation.kpis.borrowedAmount).toBe(resultA.kpis.borrowedAmount)

    // CRD à date : capitalRemaining du portfolio == 250k − currentNetPropertyValue.
    // (currentNetPropertyValue est calculé par kpis.ts comme valeur estimée − CRD.)
    // Tolérance 0,5 € car les deux chemins appellent `new Date()` à quelques
    // ms d'écart, soit ~0 € d'écart d'amortissement.
    const crdViaKpis = 250_000 - resultA.kpis.currentNetPropertyValue
    expect(propResult.capitalRemaining).toBeCloseTo(crdViaKpis, 0)
    expect(propResult.capitalRemaining).toBeGreaterThan(0)
    expect(propResult.capitalRemaining).toBeLessThan(totalBorrow)

    // LTV implicite : capitalRemaining / valeur estimée (cohérent partout).
    const ltvViaPortfolio  = propResult.capitalRemaining / 250_000
    const ltvViaKpisDirect = crdViaKpis / 250_000
    expect(ltvViaPortfolio).toBeCloseTo(ltvViaKpisDirect, 5)
    expect(ltvViaPortfolio).toBeGreaterThan(0)
    expect(ltvViaPortfolio).toBeLessThan(1)
  })

  it('cohérence CRD : portfolio.capitalRemaining == kpis multi-crédit', async () => {
    // Test ciblé : le CRD calculé par portfolio.ts (via aggregateLoans direct)
    // doit être strictement égal à ce qui sort de la projection multi-crédit
    // (premier remaining annuel - capital remboursé pendant les mois écoulés).
    const inputA = buildSimulationInputFromDb(
      dbProperty, dbAsset, dbLots, dbCharges, dbDebts, dbProfile,
      { downPayment },
    )
    const resultA = runSimulation(inputA)

    const mockSupabase = makeMockSupabase({
      properties: [
        {
          ...dbProperty,
          id:       'prop-1',
          asset_id: 'asset-1',
          asset:    { name: 'Test', current_value: 250_000 },
          lots:     dbLots.map(l => ({ rent_amount: l.rent_amount, status: l.status })),
        },
      ],
      charges: [{ property_id: 'prop-1', ...dbCharges }],
      debts: dbDebts.map((d, i) => ({
        ...d, id: `debt-${i}`, asset_id: 'asset-1',
      })),
      profile: { tmi_rate: 30 },
    })
    const portfolio = await computeRealEstatePortfolio(mockSupabase, 'user-1')
    const propResult = portfolio.properties[0]!

    // currentNetPropertyValue = currentEstimatedValue - remainingCapitalNow
    // Donc remainingCapitalNow = currentEstimatedValue - currentNetPropertyValue.
    // Tolérance 0,5 € : les deux appels à `new Date()` se font à quelques
    // ms d'écart, écart d'amortissement négligeable.
    const crdViaKpis = 250_000 - resultA.kpis.currentNetPropertyValue
    expect(propResult.capitalRemaining).toBeCloseTo(crdViaKpis, 0)
  })
})
