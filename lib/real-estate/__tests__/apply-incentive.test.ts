/**
 * Tests de la propagation des réductions fiscales (Pinel, Pinel+,
 * Denormandie, Loc'Avantages) dans la projection annuelle.
 *
 * Architecture FYNIX :
 *  - `buildIncentiveReductionPerYear` construit le tableau année par année
 *  - `runSimulation` applique : taxPaid = max(0, taxPaid − reduction)
 *  - 3 champs exposés dans ProjectionYear :
 *      taxReductionTotal   (théorique avant plafonnement)
 *      taxReductionApplied (effectivement imputée, bornée à l'IR)
 *      taxReductionLost    (excédent perdu, non reportable)
 */

import { describe, it, expect } from 'vitest'
import { runSimulation } from '..'
import { buildIncentiveReductionPerYear } from '../fiscal/incentives/reduction-schedule'
import type { SimulationInput } from '../types'

const CURRENT_YEAR = new Date().getUTCFullYear()

/**
 * Construit un input calibré pour viser un IR foncier_micro précis.
 * foncier_micro = netRent × 0.7 × (TMI + 17.2) / 100
 * Avec TMI 30 : coef = 0,7 × 0,472 = 0,3304
 */
function makeInputForTargetIR(targetIR: number, tmiPct = 30): SimulationInput {
  const coef = 0.7 * (tmiPct + 17.2) / 100
  const monthlyRent = targetIR / (12 * coef)
  return {
    property: {
      purchasePrice: 200_000, notaryFees: 0, worksAmount: 0,
      propertyIndexPct: 0,
    },
    rent:    { monthlyRent, vacancyMonths: 0, rentalIndexPct: 0 },
    charges: {
      pno: 0, gliPct: 0, propertyTax: 0, cfe: 0, accountant: 0,
      condoFees: 0, managementPct: 0, maintenance: 0, other: 0,
      chargesIndexPct: 0,
    },
    regime: { kind: 'foncier_micro', tmiPct },
    downPayment: 0, horizonYears: 1,
  }
}

describe('Propagation des réductions fiscales — runSimulation + reduction-schedule', () => {
  it('Test 1 — Pinel+ dans la fenêtre, IR suffisant : réduction pleinement imputée', () => {
    const input = makeInputForTargetIR(8_000)
    const result = runSimulation({ ...input, incentiveReductionPerYear: [4_760] })
    const y1 = result.projection[0]!
    expect(y1.taxReductionTotal).toBe(4_760)
    expect(y1.taxReductionApplied).toBe(4_760)
    expect(y1.taxReductionLost).toBe(0)
    expect(y1.taxPaid).toBeCloseTo(8_000 - 4_760, 0)   // 3 240 €
  })

  it('Test 2 — Pinel+, IR insuffisant : excédent perdu (non reportable)', () => {
    const input = makeInputForTargetIR(3_200)
    const result = runSimulation({ ...input, incentiveReductionPerYear: [4_760] })
    const y1 = result.projection[0]!
    expect(y1.taxReductionTotal).toBe(4_760)
    expect(y1.taxReductionApplied).toBeCloseTo(3_200, 0)
    expect(y1.taxReductionLost).toBeCloseTo(1_560, 0)
    expect(y1.taxPaid).toBe(0)
  })

  it('Test 3 — Année hors fenêtre Pinel : 0 (taxPaid inchangé)', () => {
    // Pinel 6 ans démarré en 2020 → fenêtre 2020-2025
    // Si on simule en 2027, on est hors fenêtre
    const reductionPerYear = buildIncentiveReductionPerYear(
      {
        kind: 'pinel', duration_years: 6, zone: 'A',
        start_year: CURRENT_YEAR - 10,   // expirée depuis 5 ans
        works_amount: null, is_pinel_plus: false,
      },
      { purchasePrice: 250_000, notaryFees: 0, worksAmount: 0, propertyIndexPct: 0 },
      { monthlyRent: 800, vacancyMonths: 0, rentalIndexPct: 0 },
      30, 5,
    )
    // Toutes les années doivent être à 0 (hors fenêtre)
    expect(reductionPerYear.every(v => v === 0)).toBe(true)
  })

  it('Test 4 — Pas d\'incentive : aucune modification', () => {
    expect(buildIncentiveReductionPerYear(
      null,
      { purchasePrice: 250_000, notaryFees: 0, worksAmount: 0, propertyIndexPct: 0 },
      { monthlyRent: 800, vacancyMonths: 0, rentalIndexPct: 0 },
      30, 5,
    )).toEqual([])

    // Vérification via projection : sans incentive, taxReductionApplied = 0
    const input = makeInputForTargetIR(5_000)
    const result = runSimulation(input)
    const y1 = result.projection[0]!
    expect(y1.taxReductionTotal).toBe(0)
    expect(y1.taxReductionApplied).toBe(0)
    expect(y1.taxReductionLost).toBe(0)
  })

  it('Test 5 — Denormandie dans la fenêtre : réduction calculée et imputée', () => {
    // Denormandie 12 ans / zone A bis / prix 150k + travaux 55k (27 % > 25 %)
    // → base = 205 000, taux Pinel+ 12 ans = 21 % → réduction totale 43 050 €
    // → par an = 43 050 / 12 = 3 587,50 €
    const reduction = buildIncentiveReductionPerYear(
      {
        kind: 'denormandie', duration_years: 12, zone: 'A_bis',
        start_year: CURRENT_YEAR,
        works_amount: 55_000, is_pinel_plus: false,
      },
      { purchasePrice: 150_000, notaryFees: 0, worksAmount: 55_000, propertyIndexPct: 0 },
      { monthlyRent: 500, vacancyMonths: 0, rentalIndexPct: 0 },
      30, 1,
    )
    expect(reduction[0]).toBeCloseTo((150_000 + 55_000) * 0.21 / 12, 1)
  })

  it('Test 6 — Loc\'Avantages Loc2 : réduction = loyers × 35 %', () => {
    // Loc2 : taux 35 % sur les loyers annuels
    // Loyers 9 240 €/an → réduction = 9 240 × 0,35 = 3 234 €
    const reduction = buildIncentiveReductionPerYear(
      {
        kind: 'loc_avantages',
        duration_years: null, zone: null, start_year: null,
        works_amount: null, is_pinel_plus: null,
        convention_type:  'loc2',
        convention_start: `${CURRENT_YEAR}-01-01`,
        convention_end:   `${CURRENT_YEAR + 5}-12-31`,
      },
      { purchasePrice: 0, notaryFees: 0, worksAmount: 0, propertyIndexPct: 0 },
      { monthlyRent: 770, vacancyMonths: 0, rentalIndexPct: 0 },   // 770 × 12 = 9 240
      30, 1,
    )
    expect(reduction[0]).toBeCloseTo(3_234, 1)
  })

  it('Test 7 — Loc\'Avantages Loc3 (65 %) sur la fenêtre 6 ans', () => {
    const reduction = buildIncentiveReductionPerYear(
      {
        kind: 'loc_avantages',
        duration_years: null, zone: null, start_year: null,
        works_amount: null, is_pinel_plus: null,
        convention_type:  'loc3',
        convention_start: `${CURRENT_YEAR}-01-01`,
        convention_end:   `${CURRENT_YEAR + 5}-12-31`,
      },
      { purchasePrice: 0, notaryFees: 0, worksAmount: 0, propertyIndexPct: 0 },
      { monthlyRent: 550, vacancyMonths: 0, rentalIndexPct: 0 },   // 6 600 €/an
      30, 8,   // horizon > fenêtre
    )
    // Années 1 à 6 : 6 600 × 0,65 = 4 290 € chacune
    // Années 7 et 8 : 0
    expect(reduction.slice(0, 6).every(v => Math.abs(v - 4_290) < 1)).toBe(true)
    expect(reduction.slice(6)).toEqual([0, 0])
  })

  it('Test 8 — MH / Censi-Bouvard : pas de réduction d\'IR via cette voie', () => {
    // MH = déduction du revenu global, pas réduction d'IR
    // Cette fonction renvoie [] pour MH
    expect(buildIncentiveReductionPerYear(
      {
        kind: 'monuments_historiques',
        duration_years: null, zone: null, start_year: null,
        works_amount: 100_000, is_pinel_plus: null,
      },
      { purchasePrice: 200_000, notaryFees: 0, worksAmount: 0, propertyIndexPct: 0 },
      { monthlyRent: 800, vacancyMonths: 0, rentalIndexPct: 0 },
      30, 5,
    )).toEqual([])
  })
})
