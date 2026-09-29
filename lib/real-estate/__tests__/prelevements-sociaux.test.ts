/**
 * Sprint H — Prélèvements sociaux par catégorie de revenu (LFSS 2026).
 *
 * Toutes les dates / années sont fixées explicitement : aucun test ne dépend
 * de l'horloge système.
 */
import { describe, it, expect } from 'vitest'
import {
  ANNEE_FISCALE_REFERENCE,
  getTauxPfu,
  getTauxPrelevementsSociaux,
  type CategorieRevenuPS,
} from '../fiscal/prelevements-sociaux'
import { runSimulation } from '..'
import { computeDividendDistribution } from '../fiscal/sci-is'
import { calculerPlusValue } from '../plusValue'
import type { FiscalRegime, SimulationInput } from '../types'

describe('getTauxPrelevementsSociaux — catégories × années charnières', () => {
  const cas: Array<[CategorieRevenuPS, number, number]> = [
    ['foncier_nu',           2024, 17.2],
    ['foncier_nu',           2025, 17.2],
    ['foncier_nu',           2026, 17.2],
    ['plus_value_immo',      2024, 17.2],
    ['plus_value_immo',      2025, 17.2],
    ['plus_value_immo',      2026, 17.2],
    ['bic_meuble_non_pro',   2024, 17.2],
    ['bic_meuble_non_pro',   2025, 18.6],
    ['bic_meuble_non_pro',   2026, 18.6],
    ['dividendes_placement', 2024, 17.2],
    ['dividendes_placement', 2025, 17.2],
    ['dividendes_placement', 2026, 18.6],
  ]
  it.each(cas)('%s en %i → %d %%', (categorie, annee, attendu) => {
    expect(getTauxPrelevementsSociaux(categorie, annee)).toBe(attendu)
  })

  it('années lointaines : dernière règle connue', () => {
    expect(getTauxPrelevementsSociaux('bic_meuble_non_pro', 1990)).toBe(17.2)
    expect(getTauxPrelevementsSociaux('dividendes_placement', 2040)).toBe(18.6)
  })
})

describe('getTauxPfu', () => {
  it('2025 → 30 %', () => expect(getTauxPfu(2025)).toBe(30))
  it('2026 → 31,4 %', () => expect(getTauxPfu(2026)).toBe(31.4))
  it('2024 → 30 %', () => expect(getTauxPfu(2024)).toBe(30))
})

describe('ANNEE_FISCALE_REFERENCE', () => {
  it('vaut 2026 (à mettre à jour chaque année avec les barèmes)', () => {
    expect(ANNEE_FISCALE_REFERENCE).toBe(2026)
  })
})

// ─── Intégration moteur ─────────────────────────────────────────────────────

const BASE = (regime: FiscalRegime, simulationDate: Date): SimulationInput => ({
  property: { purchasePrice: 150_000, notaryFees: 12_000, worksAmount: 0, propertyIndexPct: 0 },
  rent:     { monthlyRent: 1_000, vacancyMonths: 0, rentalIndexPct: 0 },
  charges:  {
    pno: 0, gliPct: 0, propertyTax: 0, cfe: 0, accountant: 0,
    condoFees: 0, managementPct: 0, maintenance: 0, other: 0, chargesIndexPct: 0,
  },
  regime,
  downPayment:  162_000,
  horizonYears: 4,
  simulationDate,
})

describe('projection — année calendaire (simulationDate + yearIndex − 1)', () => {
  it('LMNP micro démarré en 2024 : 17,2 % en 2024, 18,6 % à partir de 2025', () => {
    const r = runSimulation(BASE(
      { kind: 'lmnp_micro', tmiPct: 30, abattementPct: 50 },
      new Date('2024-03-01T00:00:00Z'),
    ))
    // Loyers 12 000 €, base 6 000 € chaque année (indexations à 0).
    expect(r.projection[0]!.taxPaid).toBeCloseTo(6_000 * 0.472, 6)   // 2024
    expect(r.projection[1]!.taxPaid).toBeCloseTo(6_000 * 0.486, 6)   // 2025
    expect(r.projection[3]!.taxPaid).toBeCloseTo(6_000 * 0.486, 6)   // 2027
  })

  it('micro-foncier : 17,2 % quelle que soit l\'année (dérogation revenus fonciers)', () => {
    const r = runSimulation(BASE(
      { kind: 'foncier_micro', tmiPct: 30 },
      new Date('2024-03-01T00:00:00Z'),
    ))
    // base = 12 000 × 70 % = 8 400
    r.projection.forEach(p => expect(p.taxPaid).toBeCloseTo(8_400 * 0.472, 6))
  })

  it('sans simulationDate : ANNEE_FISCALE_REFERENCE (déterministe, pas l\'horloge)', () => {
    const input = BASE({ kind: 'lmnp_micro', tmiPct: 30, abattementPct: 50 }, new Date('2030-01-01T00:00:00Z'))
    delete (input as { simulationDate?: Date }).simulationDate
    const r = runSimulation(input)
    expect(r.projection[0]!.taxPaid).toBeCloseTo(6_000 * 0.486, 6)
  })
})

describe('computeDividendDistribution — anneeRevenus', () => {
  const base = {
    netProfitAfterIS: 10_000, dividendAmount: 10_000,
    ccaAmount: 0, availableCashYear: 0, tmiPct: 41,
  }
  it('2025 : PFU 30 %, PS barème 17,2 %', () => {
    const r = computeDividendDistribution({ ...base, anneeRevenus: 2025 })
    expect(r.pfuTax).toBeCloseTo(3_000, 6)
    expect(r.pfuRatePct).toBe(30)
    expect(r.psRatePct).toBe(17.2)
    expect(r.optimalOptionLabel).toBe('Flat Tax 30 % (PFU) — plus avantageux')
  })
  it('2026 : PFU 31,4 %, PS barème 18,6 %', () => {
    const r = computeDividendDistribution({ ...base, anneeRevenus: 2026 })
    expect(r.pfuTax).toBeCloseTo(3_140, 6)
    expect(r.baremeTax).toBeCloseTo(10_000 * 0.6 * 0.41 + 10_000 * 0.186, 6)
    expect(r.pfuRatePct).toBe(31.4)
    expect(r.optimalOptionLabel).toBe('Flat Tax 31,4 % (PFU) — plus avantageux')
  })
})

describe('calculerPlusValue — SCI IS : PFU de l\'année de cession', () => {
  const input = (cession: string) => ({
    prixAchat:             150_000,
    dateAchat:             new Date('2015-06-01T00:00:00Z'),
    prixVenteEstime:       230_000,
    dateCessionEstimee:    new Date(cession),
    regimeFiscal:          'sci_is' as const,
    typeUsage:             'locatif' as const,
    amortissementsCumules: 40_000,
  })
  it('cession 2025 : PFU 30 % sur le net après IS', () => {
    const r = calculerPlusValue(input('2025-09-01T00:00:00Z'))
    // VNC 110 000 → PV IS 120 000 → IS 25 % = 30 000 → net 200 000
    expect(r.sciIsDetail!.netApresIS).toBe(200_000)
    expect(r.sciIsDetail!.tauxPfuPct).toBe(30)
    expect(r.sciIsDetail!.netApresDistributionDividendes).toBe(140_000)
  })
  it('cession 2027 : PFU 31,4 % sur le net après IS', () => {
    const r = calculerPlusValue(input('2027-09-01T00:00:00Z'))
    expect(r.sciIsDetail!.tauxPfuPct).toBe(31.4)
    expect(r.sciIsDetail!.netApresDistributionDividendes).toBe(137_200)   // 200 000 × 0,686
  })
})
