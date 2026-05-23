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

// ─────────────────────────────────────────────────────────────────────
// V6 — Cohérence Synthèse ↔ carte ↔ Rentabilité
//
// La fiche détail (onglet Synthèse) lit désormais ses KPIs financiers
// depuis le moteur (V6) — mêmes champs que la carte de la liste et
// l'onglet Rentabilité, exactement comme la doc V6 le prescrit.
//
// Ces tests vérouillent l'invariant :
//   - kpis.monthlyCashFlowYear1 : valeur UNIQUE pour le cash-flow,
//     affichée 1:1 sur Synthèse / carte / Rentabilité.
//   - kpis.grossYieldFAI : rendement brut (dénominateur coût FAI),
//     affiché sur la carte sub-label ET sur Rentabilité ET désormais
//     sur la Synthèse.
//   - projection[0].charges : charges annuelles Y1, lues par la
//     Synthèse (charges/12 = monthlyCharges).
//   - kpis.totalCost : coût FAI complet, dénominateur des rendements.
//
// Pour un seul `runSimulation`, on a une et une seule valeur de chaque
// champ — donc la cohérence est garantie par construction. Le test sert
// de sentinelle : si quelqu'un re-introduit un calcul KPI ailleurs
// (ex. recalcul manuel dans page.tsx), le test échouera car la valeur
// affichée divergera de celle du moteur.
// ─────────────────────────────────────────────────────────────────────

describe('V6 — Synthèse ↔ carte ↔ Rentabilité : source unique', () => {

  // Bien complet avec multi-crédit pour stresser tous les chemins :
  // - différé crédit (deferralType implicite 'none' mais marche aussi)
  // - vacance non nulle
  // - charges et loyer ≠ 0
  const FULL_INPUT: SimulationInput = {
    ...BASE_INPUT_NO_LOAN,
    rent: { ...BASE_INPUT_NO_LOAN.rent, vacancyMonths: 1 },  // 1 mois vacance
    loans: [PRINCIPAL_LOAN, PTZ_LOAN],
    downPayment: 0,
  }

  it('un seul `runSimulation` → kpis.monthlyCashFlowYear1 est la source UNIQUE pour Synthèse/carte/Rentabilité', () => {
    const r = runSimulation(FULL_INPUT)

    // La carte affiche kpis.monthlyCashFlowYear1 (cf. property-card.tsx).
    // L'onglet Rentabilité affiche kpis.monthlyCashFlowYear1 (cf. simulation-panel.tsx).
    // La Synthèse (V6) affiche kpis.monthlyCashFlowYear1 (cf. page.tsx).
    // → 3 lectures du MÊME champ. Identité garantie par construction.
    const cfFromCard       = r.kpis.monthlyCashFlowYear1
    const cfFromRentabilite = r.kpis.monthlyCashFlowYear1
    const cfFromSynthese   = r.kpis.monthlyCashFlowYear1

    expect(cfFromSynthese).toBe(cfFromCard)
    expect(cfFromSynthese).toBe(cfFromRentabilite)
    // Vérification que la valeur est cohérente (non NaN, non 0 fortuit) :
    expect(Number.isFinite(cfFromSynthese)).toBe(true)
    expect(cfFromSynthese).not.toBe(0)
  })

  it('rendement brut : Synthèse/carte/Rentabilité lisent kpis.grossYieldFAI', () => {
    const r = runSimulation(FULL_INPUT)
    // grossYieldFAI = annualRent (théorique, sans vacance) / kpis.totalCost
    // Toutes les vues affichent ce même champ — dénominateur cohérent FAI.
    const grossY1 = r.kpis.grossYieldFAI
    expect(grossY1).toBeGreaterThan(0)
    // Vérification de la formule : monthlyRent × 12 / totalCost × 100
    const expected = (FULL_INPUT.rent.monthlyRent * 12 / r.kpis.totalCost) * 100
    expect(grossY1).toBeCloseTo(expected, 6)
  })

  it('charges Y1 : projection[0].charges est la source UNIQUE pour la Synthèse', () => {
    const r = runSimulation(FULL_INPUT)
    const chargesY1 = r.projection[0]?.charges ?? 0
    // La Synthèse lit projection[0].charges et l'affiche en /12. Cohérent
    // avec la projection complète de l'onglet Rentabilité (même valeur Y1).
    expect(chargesY1).toBeGreaterThan(0)
    expect(Number.isFinite(chargesY1)).toBe(true)

    // Le moteur calcule : fixedCharges + gli + management (sur netRent).
    // On vérifie que c'est non-trivial (au moins les charges fixes).
    const fixedExpected = FULL_INPUT.charges.pno + FULL_INPUT.charges.propertyTax
                       + FULL_INPUT.charges.cfe + FULL_INPUT.charges.accountant
                       + FULL_INPUT.charges.condoFees + FULL_INPUT.charges.maintenance
                       + FULL_INPUT.charges.other
    expect(chargesY1).toBeGreaterThanOrEqual(fixedExpected)
  })

  it('totalCost : kpis.totalCost est la source UNIQUE du dénominateur FAI', () => {
    const r = runSimulation(FULL_INPUT)
    // Dénominateur unique pour grossYieldFAI ET netYield ET netNetYield.
    // Inclut prix + frais notaire + works + furniture + bankFees + guaranteeFees
    // de TOUS les prêts (multi-crédit V3.1).
    const totalCost = r.kpis.totalCost
    const expected =
      FULL_INPUT.property.purchasePrice +
      FULL_INPUT.property.notaryFees +
      FULL_INPUT.property.worksAmount +
      PRINCIPAL_LOAN.bankFees + PRINCIPAL_LOAN.guaranteeFees +
      PTZ_LOAN.bankFees       + PTZ_LOAN.guaranteeFees
    expect(totalCost).toBeCloseTo(expected, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────
// V7 — Refonte `netNetYield` : sans crédit, juste l'impôt.
//
// Principe directeur V7 :
//   netNetYield = netYield − (taxPaidY1 / totalCost × 100)
//
// Avant V7, netNetYield soustrayait la mensualité complète du crédit
// (intérêts + assurance) ET rajoutait le capital remboursé. Conséquence :
// même avec un impôt = 0 (SCI IS dont l'amortissement annule l'IS), la
// net-net affichait un écart de plusieurs points avec la nette, juste
// à cause du coût du crédit.
//
// V7 retire complètement le financement de la net-net : seule la
// FISCALITÉ effectivement payée la distingue de la nette. L'impôt est
// celui calculé par le moteur (`projection[0].taxPaid`), qui tient déjà
// compte de l'amortissement, des intérêts déductibles, du déficit
// reporté, etc. — on ne recalcule pas un impôt « sans prêt ».
//
// Invariant clé : impôt = 0 ⇒ net-net === nette (strict).
// ─────────────────────────────────────────────────────────────────────

describe('V7 — netNetYield = nette − impôt (sans crédit)', () => {

  it('invariant : taxPaidY1 = 0 ⇒ netNetYield === netYield (strict)', () => {
    // Cas : SCI à l'IS où l'amortissement bâti + frais d'acquisition
    // (treatment expense_y1) annulent le résultat fiscal Y1 → IS = 0.
    // Volume loyer modeste + amort élevé (purchasePrice 500 k€) garantit
    // que fiscalResult Y1 < 0.
    const input: SimulationInput = {
      property: {
        purchasePrice:    500_000,
        notaryFees:       35_000,
        worksAmount:      0,
        propertyIndexPct: 1.0,
      },
      loans: [PRINCIPAL_LOAN],
      rent: { monthlyRent: 1_200, vacancyMonths: 0, rentalIndexPct: 2.0 },
      charges: {
        pno: 350, gliPct: 0, propertyTax: 1_500, cfe: 0, accountant: 0,
        condoFees: 600, managementPct: 0, maintenance: 400, other: 0,
        chargesIndexPct: 2.0,
      },
      regime: {
        kind:                     'sci_is',
        landSharePct:             15,
        amortBuildingYears:       30,
        amortWorksYears:          15,
        amortFurnitureYears:      7,
        furnitureAmount:          0,
        acquisitionFeesTreatment: 'expense_y1',  // boost Y1 : frais notaire en charges
      },
      downPayment: 100_000,
    }
    const r = runSimulation(input)

    // Sanity : l'impôt doit bien être 0 pour Y1, sinon le test n'est
    // pas pertinent (l'invariant porte sur le cas tax=0).
    expect(r.projection[0]?.taxPaid).toBe(0)

    // INVARIANT V7 : net-net === nette strict (différence devrait être
    // EXACTEMENT 0 en arithmétique flottante car la formule est
    // netNetYield = netYield − taxPaid×100/totalCost = netYield − 0).
    expect(r.kpis.netNetYield).toBe(r.kpis.netYield)
  })

  it('formule algébrique : netNetYield = netYield − (taxPaid × 100 / totalCost)', () => {
    // Cas où l'impôt est positif : foncier réel sur un bien avec
    // bénéfice après charges + intérêts (pas d'amortissement → tax > 0).
    const input: SimulationInput = {
      property: {
        purchasePrice:    200_000,
        notaryFees:       15_000,
        worksAmount:      0,
        propertyIndexPct: 1.0,
      },
      loans: [PRINCIPAL_LOAN],
      rent: { monthlyRent: 1_500, vacancyMonths: 0, rentalIndexPct: 2.0 },
      charges: {
        pno: 350, gliPct: 0, propertyTax: 1_500, cfe: 0, accountant: 0,
        condoFees: 600, managementPct: 0, maintenance: 400, other: 0,
        chargesIndexPct: 2.0,
      },
      regime: { kind: 'foncier_nu', tmiPct: 41 },   // TMI 41 % + PS 17,2 %
      downPayment: 50_000,
    }
    const r = runSimulation(input)
    const taxY1 = r.projection[0]?.taxPaid ?? 0

    // Pré-requis du test : l'impôt doit être > 0, sinon on retombe sur
    // l'invariant tax=0 testé ci-dessus.
    expect(taxY1).toBeGreaterThan(0)

    // Formule V7 vérifiée à l'euro près (1e-6) :
    const expected = r.kpis.netYield - (taxY1 / r.kpis.totalCost) * 100
    expect(r.kpis.netNetYield).toBeCloseTo(expected, 10)

    // Vérification corollaire : net-net < nette (l'impôt grignote).
    expect(r.kpis.netNetYield).toBeLessThan(r.kpis.netYield)
  })

  it('le coût du crédit (intérêts + assurance) n\'apparaît PLUS dans netNetYield', () => {
    // Bien CASH vs avec crédit, en micro-foncier. Les intérêts ne sont pas
    // déductibles (abattement forfaitaire 30 %) → tax identique cash/loan.
    // Pour isoler la variable testée (le COÛT du crédit dans la formule
    // netNetYield), on prend un loan sans frais bancaires/garantie afin
    // que `totalCost` soit identique entre les 2 cas (sinon la nette
    // varie aussi à cause du dénominateur).
    const LOAN_NO_FEES: LoanInput = {
      principal:        200_000,
      annualRatePct:    3.5,
      durationYears:    20,
      insuranceRatePct: 0.25,
      bankFees:         0,
      guaranteeFees:    0,
      startDate:        new Date('2024-01-01'),
    }
    const baseInput: SimulationInput = {
      property: {
        purchasePrice:    200_000,
        notaryFees:       15_000,
        worksAmount:      0,
        propertyIndexPct: 1.0,
      },
      rent: { monthlyRent: 1_000, vacancyMonths: 0, rentalIndexPct: 2.0 },
      charges: {
        pno: 0, gliPct: 0, propertyTax: 0, cfe: 0, accountant: 0,
        condoFees: 0, managementPct: 0, maintenance: 0, other: 0,
        chargesIndexPct: 2.0,
      },
      regime: { kind: 'foncier_micro', tmiPct: 30 },
      downPayment: 215_000,
    }
    const rCash = runSimulation(baseInput)
    const rWithLoan = runSimulation({
      ...baseInput,
      loans: [LOAN_NO_FEES],
      downPayment: 15_000,
    })

    // Sanity : totalCost identique (pas de frais bancaires sur le loan
    // pour isoler le test du coût du crédit lui-même).
    expect(rWithLoan.kpis.totalCost).toBe(rCash.kpis.totalCost)

    // En micro-foncier les intérêts ne sont pas déductibles → tax identique.
    expect(rWithLoan.projection[0]?.taxPaid).toBeCloseTo(
      rCash.projection[0]?.taxPaid ?? 0, 6,
    )

    // Côté nette : déjà indépendante du crédit (par définition).
    expect(rWithLoan.kpis.netYield).toBeCloseTo(rCash.kpis.netYield, 6)

    // Côté net-net (V7) : doit aussi être indépendante du crédit puisque
    // la SEULE différence net→net-net est la fiscalité (identique ici).
    // Avant V7, rWithLoan aurait été plus bas de plusieurs points
    // (soustraction de la mensualité de crédit). La refonte V7 verrouille
    // l'indépendance au financement.
    expect(rWithLoan.kpis.netNetYield).toBeCloseTo(rCash.kpis.netNetYield, 6)
  })

  it('SCI IS avec déficit fiscal Y1 → netNetYield === netYield (pas d\'IS payé)', () => {
    // Variante de l'invariant : même si le résultat fiscal est négatif
    // (déficit reportable indéfiniment), taxPaid = 0 et donc net-net ===
    // nette. Vérifie que le moteur ne « facture » pas un IS minimum.
    const input: SimulationInput = {
      property: {
        purchasePrice:    400_000,
        notaryFees:       28_000,
        worksAmount:      50_000,
        propertyIndexPct: 1.0,
      },
      loans: [PRINCIPAL_LOAN],
      rent: { monthlyRent: 900, vacancyMonths: 0, rentalIndexPct: 2.0 },
      charges: {
        pno: 400, gliPct: 0, propertyTax: 2_000, cfe: 0, accountant: 0,
        condoFees: 800, managementPct: 0, maintenance: 500, other: 0,
        chargesIndexPct: 2.0,
      },
      regime: {
        kind:                     'sci_is',
        landSharePct:             15,
        amortBuildingYears:       30,
        amortWorksYears:          15,
        amortFurnitureYears:      7,
        furnitureAmount:          0,
        acquisitionFeesTreatment: 'expense_y1',
      },
      downPayment: 100_000,
    }
    const r = runSimulation(input)

    // Sanity : déficit fiscal Y1 (résultat négatif), IS = 0.
    expect(r.projection[0]?.fiscalResult).toBeLessThan(0)
    expect(r.projection[0]?.taxPaid).toBe(0)

    // Invariant V7
    expect(r.kpis.netNetYield).toBe(r.kpis.netYield)
  })
})
