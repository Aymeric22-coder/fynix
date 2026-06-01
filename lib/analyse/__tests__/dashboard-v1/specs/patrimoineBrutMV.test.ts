/**
 * Spec P0.2 — Patrimoine brut = MV stricte (pas d'hybride MV/CB).
 *
 * Statut : **livré en V1.2**. Le brut du nouveau pipeline (`DashboardKpis.gross_value`)
 * est désormais `assetsValue + portfolioSummary.totalMarketValue` strictement.
 * Les positions sans MV sont exposées séparément via `unvaluedPositionsCount`,
 * `unvaluedPositionsCostBasis` et `unvaluedPositionsLabel`.
 *
 * Le bloc inline `dashboard/page.tsx` garde l'ancien calcul hybride jusqu'à V1.4.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ALL_FIXTURES } from '../fixtures'

describe('P0.2 — Patrimoine brut MV stricte [livré V1.2]', () => {
  describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))(
    'profil %s',
    (_id, fixture) => {
      const data = computeDashboardData(fixture.inputs)

      it('gross_value = expected.grossValueMVStrict (au centime près)', () => {
        expect(data.kpis.gross_value).toBeCloseTo(fixture.expected.grossValueMVStrict, 2)
      })
    },
  )

  it('investisseur-boursier : 157 000 € (et non plus 160 000 €)', () => {
    const boursier = ALL_FIXTURES.find((f) => f.id === 'investisseur-boursier')!
    const data = computeDashboardData(boursier.inputs)
    expect(data.kpis.gross_value).toBe(157_000)
    expect(data.unvaluedPositionsCount).toBe(1)
    expect(data.unvaluedPositionsCostBasis).toBe(3_000)
  })

  it('hnw-complexe : 3 450 000 € (et non plus 3 550 000 €)', () => {
    const hnw = ALL_FIXTURES.find((f) => f.id === 'hnw-complexe')!
    const data = computeDashboardData(hnw.inputs)
    expect(data.kpis.gross_value).toBe(3_450_000)
    expect(data.unvaluedPositionsCount).toBe(1)
    expect(data.unvaluedPositionsCostBasis).toBe(100_000)
  })

  describe('Fixtures sans positions non valorisées : convergence préservée', () => {
    it.each(
      ['debutant', 'investisseur-immo', 'patrimoine-diversifie', 'preretraite']
        .map((id) => [id] as const),
    )('%s : gross_value = currentBuggy.grossValueHybrid (= expected.grossValueMVStrict)', (id) => {
      const f = ALL_FIXTURES.find((x) => x.id === id)!
      const data = computeDashboardData(f.inputs)
      expect(data.kpis.gross_value).toBe(f.expected.grossValueMVStrict)
      expect(f.expected.grossValueMVStrict).toBe(f.currentBuggy.grossValueHybrid)
      expect(data.unvaluedPositionsCount).toBe(0)
      expect(data.unvaluedPositionsCostBasis).toBe(0)
      expect(data.unvaluedPositionsLabel).toBe('')
    })
  })

  describe('Label « positions non valorisées »', () => {
    it('1 position : singulier (« 1 position non valorisée »)', () => {
      const boursier = ALL_FIXTURES.find((f) => f.id === 'investisseur-boursier')!
      const data = computeDashboardData(boursier.inputs)
      expect(data.unvaluedPositionsLabel).toMatch(/^1 position non valorisée · /)
      expect(data.unvaluedPositionsLabel).toMatch(/manquants$/)
    })

    it('format : « N position(s) non valorisée(s) · X € manquants »', () => {
      const hnw = ALL_FIXTURES.find((f) => f.id === 'hnw-complexe')!
      const data = computeDashboardData(hnw.inputs)
      // Pas d'assertion stricte sur l'espacement (formatEur gère le NBSP)
      // mais on vérifie la structure logique.
      expect(data.unvaluedPositionsLabel).toContain('1 position non valorisée')
      expect(data.unvaluedPositionsLabel).toContain('·')
      expect(data.unvaluedPositionsLabel).toContain('manquants')
    })
  })
})
