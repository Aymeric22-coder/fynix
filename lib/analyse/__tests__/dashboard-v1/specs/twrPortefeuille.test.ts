/**
 * Spec P0.3 — TWR portefeuille (livré V1.3).
 *
 * Vérifie sur les 6 fixtures que `twr_portefeuille_pct` correspond aux
 * valeurs `expected` calibrées manuellement. Les fixtures sans historique
 * (Débutant, Immo, Boursier, HNW) doivent retourner `null` avec un label
 * explicite ; Diversifié et Préretraité retournent une valeur calculée.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ALL_FIXTURES } from '../fixtures'

const EPS_PP = 0.1

describe('P0.3 — TWR portefeuille [livré V1.3]', () => {
  describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))(
    'profil %s',
    (_id, fixture) => {
      const data = computeDashboardData(fixture.inputs)

      it('twr_portefeuille_pct correspond à expected', () => {
        const exp = fixture.expected.twr_portefeuille_pct
        const got = data.kpis.twr_portefeuille_pct
        if (exp === null) {
          expect(got).toBeNull()
        } else {
          expect(got).not.toBeNull()
          expect(Math.abs(got! - exp)).toBeLessThanOrEqual(EPS_PP)
        }
      })

      it('twr_portefeuille_label non vide', () => {
        expect(data.kpis.twr_portefeuille_label).toBeTruthy()
      })

      it('twr_portefeuille_extrapole : booléen valide', () => {
        expect(typeof data.kpis.twr_portefeuille_extrapole).toBe('boolean')
      })
    },
  )

  describe('Labels conditionnels (P0.3 cf. brief)', () => {
    it('fixtures sans transactions : label « Pas assez d\'historique pour calculer la performance »', () => {
      for (const id of ['debutant', 'investisseur-immo', 'investisseur-boursier', 'hnw-complexe']) {
        const f = ALL_FIXTURES.find((x) => x.id === id)!
        const data = computeDashboardData(f.inputs)
        expect(data.kpis.twr_portefeuille_pct).toBeNull()
        expect(data.kpis.twr_portefeuille_label).toMatch(/Pas assez d'historique/i)
      }
    })

    it('fixtures enrichies (Diversifié, Préretraité) : label « Performance portefeuille : … »', () => {
      for (const id of ['patrimoine-diversifie', 'preretraite']) {
        const f = ALL_FIXTURES.find((x) => x.id === id)!
        const data = computeDashboardData(f.inputs)
        expect(data.kpis.twr_portefeuille_pct).not.toBeNull()
        expect(data.kpis.twr_portefeuille_label).toMatch(/Performance portefeuille/i)
        expect(data.kpis.twr_portefeuille_label).toMatch(/\/an/)
      }
    })

    it('extrapolation : Diversifié totalDays=514 → extrapole=false (≥ 365 j)', () => {
      const f = ALL_FIXTURES.find((x) => x.id === 'patrimoine-diversifie')!
      const data = computeDashboardData(f.inputs)
      expect(data.kpis.twr_portefeuille_extrapole).toBe(false)
    })

    it('extrapolation : Préretraité totalDays=728 → extrapole=false (≥ 365 j)', () => {
      const f = ALL_FIXTURES.find((x) => x.id === 'preretraite')!
      const data = computeDashboardData(f.inputs)
      expect(data.kpis.twr_portefeuille_extrapole).toBe(false)
    })
  })
})
