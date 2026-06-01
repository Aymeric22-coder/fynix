/**
 * Spec P0.6 — Taxonomie d'allocation unifiée.
 *
 * Statut : **livré en V1.2**. Le donut du nouveau pipeline ne produit plus
 * que des clés appartenant à `ASSET_TAXONOMY` (lib/finance/asset-taxonomy.ts).
 * Les anciens préfixes `asset:*` / `class:*` ont disparu de la sortie.
 *
 * Le bloc inline `dashboard/page.tsx` garde son ancien donut hétérogène
 * jusqu'à V1.4.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ASSET_TAXONOMY } from '@/lib/finance/asset-taxonomy'
import { ALL_FIXTURES } from '../fixtures'

describe('P0.6 — Taxonomie d\'allocation unifiée [livré V1.2]', () => {
  describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))(
    'profil %s',
    (_id, fixture) => {
      const data = computeDashboardData(fixture.inputs)

      it('aucune clé avec préfixe `asset:` ou `class:`', () => {
        for (const slice of data.allocation) {
          expect(slice.key).not.toMatch(/^asset:/)
          expect(slice.key).not.toMatch(/^class:/)
        }
      })

      it('toutes les clés appartiennent à ASSET_TAXONOMY', () => {
        for (const slice of data.allocation) {
          expect(ASSET_TAXONOMY).toContain(slice.key)
        }
      })

      it('somme des valueEur = grossValue (cohérence avec KPI principal)', () => {
        const sum = data.allocation.reduce((s, x) => s + x.valueEur, 0)
        expect(sum).toBeCloseTo(data.kpis.gross_value, 2)
      })

      it('somme des percent = 100 (à 0,1 pp près)', () => {
        const sum = data.allocation.reduce((s, x) => s + x.percent, 0)
        expect(sum).toBeCloseTo(100, 1)
      })

      it('ordre = valueEur DESC, puis key ASC (tie-breaker déterministe)', () => {
        for (let i = 1; i < data.allocation.length; i++) {
          const prev = data.allocation[i - 1]!
          const curr = data.allocation[i]!
          if (prev.valueEur === curr.valueEur) {
            expect(prev.key.localeCompare(curr.key)).toBeLessThan(0)
          } else {
            expect(prev.valueEur).toBeGreaterThan(curr.valueEur)
          }
        }
      })

      it('correspond à `fixture.expected.allocation` (clés, valeurs, ordres)', () => {
        const exp = fixture.expected.allocation
        expect(data.allocation.length).toBe(exp.length)
        for (let i = 0; i < exp.length; i++) {
          expect(data.allocation[i]!.key).toBe(exp[i]!.key)
          expect(data.allocation[i]!.valueEur).toBeCloseTo(exp[i]!.valueEur, 2)
          expect(data.allocation[i]!.percent).toBeCloseTo(exp[i]!.percent, 1)
        }
      })

      it('metadata : allocationBase = "gross_strict", allocationTotal = gross_value', () => {
        expect(data.allocationBase).toBe('gross_strict')
        expect(data.allocationTotal).toBeCloseTo(data.kpis.gross_value, 2)
      })

      it('chaque slice a un label, une couleur et une key cohérents', () => {
        for (const slice of data.allocation) {
          expect(slice.label).toBeTruthy()
          expect(slice.color).toMatch(/^#[0-9a-fA-F]{6}$/)
          expect(slice.key).toBeTruthy()
        }
      })
    },
  )

  it('hnw-complexe : SCI/holding (proxy other) → clé `autres` (PAS absorbés par immobilier)', () => {
    const hnw = ALL_FIXTURES.find((f) => f.id === 'hnw-complexe')!
    const data = computeDashboardData(hnw.inputs)
    const autres = data.allocation.find((s) => s.key === 'autres')
    expect(autres).toBeDefined()
    expect(autres!.valueEur).toBe(1_500_000)  // SCI 850k + holding 650k
    // Immobilier physique ne contient que les 3 biens RE (RP + 2 LMNP)
    const immo = data.allocation.find((s) => s.key === 'immobilier_physique')
    expect(immo!.valueEur).toBe(1_300_000)
  })

  it('fonds_euros (AV + PER) → clé `obligations` (ambiguïté documentée dans asset-taxonomy.ts)', () => {
    const preretraite = ALL_FIXTURES.find((f) => f.id === 'preretraite')!
    const data = computeDashboardData(preretraite.inputs)
    const obligations = data.allocation.find((s) => s.key === 'obligations')
    expect(obligations).toBeDefined()
    // 300 (FE AV) + 60 (PER FE) = 360 000
    expect(obligations!.valueEur).toBe(360_000)
  })
})
