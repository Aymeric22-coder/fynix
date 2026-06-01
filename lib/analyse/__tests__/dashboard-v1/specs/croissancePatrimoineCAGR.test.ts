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
