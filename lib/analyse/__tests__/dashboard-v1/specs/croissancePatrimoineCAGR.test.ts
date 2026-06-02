/**
 * Spec P0.3 — Croissance patrimoniale annualisée (apports inclus, livré V1.3).
 *
 * Sur les 6 fixtures, le KPI `croissance_patrimoine_pct` correspond aux
 * valeurs `expected` (à 0,1 pp près). Reprend l'ancien calcul `cagr` mais
 * explicitement labellé pour éviter la confusion avec une performance.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ALL_FIXTURES } from '../fixtures'

const EPS_PP = 0.1

describe('P0.3 — Croissance patrimoniale (apports inclus) [livré V1.3]', () => {
  describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))(
    'profil %s',
    (_id, fixture) => {
      const data = computeDashboardData(fixture.inputs)

      it('croissance_patrimoine_pct correspond à expected', () => {
        const exp = fixture.expected.croissance_patrimoine_pct
        const got = data.kpis.croissance_patrimoine_pct
        if (exp === null) {
          expect(got).toBeNull()
        } else {
          expect(got).not.toBeNull()
          expect(Math.abs(got! - exp)).toBeLessThanOrEqual(EPS_PP)
        }
      })

      it('label exposé : contient le mot « apports » si valeur non null', () => {
        if (data.kpis.croissance_patrimoine_pct !== null) {
          expect(data.kpis.croissance_patrimoine_label).toMatch(/apports/i)
          expect(data.kpis.croissance_patrimoine_label).toMatch(/\/an/)
        }
      })
    },
  )

  it('Débutant (1 snapshot) : croissance = null + label « Pas assez d\'historique »', () => {
    const f = ALL_FIXTURES.find((x) => x.id === 'debutant')!
    const data = computeDashboardData(f.inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeNull()
    expect(data.kpis.croissance_patrimoine_label).toMatch(/Pas assez/i)
  })

  it('Préretraité (24 mois) : croissance ≈ +2,06 %/an (formule sur snapshots)', () => {
    const f = ALL_FIXTURES.find((x) => x.id === 'preretraite')!
    const data = computeDashboardData(f.inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeCloseTo(2.06, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────
// V2.5 — Floor protection contre les snapshots pollués
// ─────────────────────────────────────────────────────────────────────
//
// Calibré sur l'incident V1.4-BIS (CAGR = +132 026 369 %). Le seuil 90 j
// (V1.3) protège déjà beaucoup, mais ne suffit pas si un snapshot ancien
// a une valeur extrêmement basse (saisie de bien après coup, import CSV
// incomplet, etc.). 3 garde-fous additionnels.
//
// Les tests utilisent un input pipeline minimal pour cibler exclusivement
// `computeCroissancePatrimoine` (pas d'aller-retour fixture lourde).

import type { DashboardPipelineInputs } from '@/lib/analyse/dashboard-pipeline'

const ASOF = new Date('2026-06-02')

function makeSnapshotsInput(rows: Array<{ date: string; net: number }>): DashboardPipelineInputs {
  return {
    assets:              [],
    debts:               [],
    // snapshots en DESC (latest first) — convention V1.1 héritée de la DB.
    snapshots: [...rows]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => ({
        snapshot_date:     r.date,
        total_net_value:   r.net,
        total_gross_value: r.net,
        total_debt:        0,
      })),
    portfolioSummary: {
      totalMarketValue: 0, totalCostBasis: 0, totalCostBasisValued: 0,
      totalUnrealizedPnL: null, totalUnrealizedPnLPct: null,
      positionsCount: 0, valuedPositionsCount: 0, freshnessRatio: 0,
      allocationByClass: [],
    },
    portfolioPositions:  [],
    realEstatePortfolio: { properties: [], totalCapitalRemaining: 0, totalMonthlyCFYear1: 0 },
    cashAccounts:        [],
    envelopes:           [],
    transactionsPortefeuille: [],
    asOfDate: ASOF,
  }
}

describe('V2.5 — Floor protection contre les snapshots pollués', () => {
  it('oldest=100 €, latest=500 000 € (ratio 5000×) → null (oldest sous le seuil 1 000 €)', () => {
    const inputs = makeSnapshotsInput([
      { date: '2025-01-01', net:     100 },
      { date: '2026-06-01', net: 500_000 },
    ])
    const data = computeDashboardData(inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeNull()
    expect(data.kpis.croissance_patrimoine_label).toMatch(/historique pollué|pas fiable|insuffisantes/i)
  })

  it('oldest=500 €, latest=1 000 € → null (oldest sous le seuil 1 000 €)', () => {
    const inputs = makeSnapshotsInput([
      { date: '2025-01-01', net:   500 },
      { date: '2026-06-01', net: 1_000 },
    ])
    const data = computeDashboardData(inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeNull()
    expect(data.kpis.croissance_patrimoine_label).toMatch(/insuffisantes/i)
  })

  it('oldest=2 000 €, latest=200 000 € (ratio 100×) → null (variation trop forte)', () => {
    const inputs = makeSnapshotsInput([
      { date: '2025-01-01', net:   2_000 },
      { date: '2026-06-01', net: 200_000 },
    ])
    const data = computeDashboardData(inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeNull()
    expect(data.kpis.croissance_patrimoine_label).toMatch(/variation/i)
  })

  it('annualisation > 500 % (ratio modéré mais durée courte) → null', () => {
    // oldest=5 000 € le 2026-03-01, latest=40 000 € le 2026-06-01 :
    //   ratio = 8 (< 50× donc passe le Floor 2)
    //   days = 92 (passe le seuil 90 j)
    //   years = 92/365.25 ≈ 0.252
    //   rate = (8 ^ (1/0.252) − 1) × 100 ≈ 130 000 %/an → coupé par Floor 3
    const inputs = makeSnapshotsInput([
      { date: '2026-03-01', net:  5_000 },
      { date: '2026-06-01', net: 40_000 },
    ])
    const data = computeDashboardData(inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeNull()
    expect(data.kpis.croissance_patrimoine_label).toMatch(/trop forte/i)
  })

  it('cas réaliste +12 %/an sur 1 an → calcul normal, valeur conservée', () => {
    // oldest=100 000 € le 2025-06-01, latest=112 000 € le 2026-06-01
    //   ratio = 1.12, days = 365 → rate ≈ 12 %/an
    const inputs = makeSnapshotsInput([
      { date: '2025-06-01', net: 100_000 },
      { date: '2026-06-01', net: 112_000 },
    ])
    const data = computeDashboardData(inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeCloseTo(12, 0)
    expect(data.kpis.croissance_patrimoine_label).toMatch(/Croissance/i)
  })

  it('cas hyper-réaliste −5 %/an (correction de marché) → calcul normal', () => {
    const inputs = makeSnapshotsInput([
      { date: '2025-06-01', net: 100_000 },
      { date: '2026-06-01', net:  95_000 },
    ])
    const data = computeDashboardData(inputs)
    expect(data.kpis.croissance_patrimoine_pct).toBeCloseTo(-5, 0)
  })
})
