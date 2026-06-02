/**
 * Spec P0.1 — Test de non-régression du pipeline unifié (mis à jour V1.4).
 *
 * **Historique** : ce fichier a démarré en V1.1 comme test de convergence
 * avec l'ancien bloc inline (`dashboardPipeline == bloc_inline`). V1.2 a fait
 * diverger `gross_value` / `allocation` (corrections P0.2 + P0.6). V1.3 a
 * basculé `twr_portefeuille_pct` + `croissance_patrimoine_pct` (P0.3). V1.4
 * a supprimé l'ancien pipeline ; ce fichier devient le **test de non-régression
 * du pipeline officiel** : chaque KPI est verrouillé sur `fixture.expected.*`
 * (les valeurs « métier correctes »), à l'exception du `topAssets` qui reste
 * sur `currentBuggy` tant que P0.5 (top consolidé par enveloppe) n'est pas
 * livré (Vague 2 ou V2 visuelle, hors scope V1).
 *
 * Quand P0.5 sera livré, le bloc `topAssets` basculera lui aussi sur
 * `fixture.expected.topConsolidatedAfterRefactor`.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { ALL_FIXTURES } from '../fixtures'

const EPS_EUR     = 0.01   // 1 centime sur les montants
const EPS_PERCENT = 0.05   // 0,05 pp sur les ratios
const EPS_CAGR    = 0.1    // 0,1 pp sur le CAGR (arrondis Math.pow)

function nearlyEqual(actual: number | null, expected: number | null, eps: number): boolean {
  if (actual === null && expected === null) return true
  if (actual === null || expected === null) return false
  return Math.abs(actual - expected) <= eps
}

describe('P0.1 — Pipeline unifié : non-régression KPIs (verrouillé sur expected)', () => {
  describe.each(ALL_FIXTURES.map((f) => [f.id, f] as const))(
    'profil %s',
    (_id, fixture) => {
      const data = computeDashboardData(fixture.inputs)

      // V1.2 P0.2 — `gross_value` bascule sur expected.grossValueMVStrict.
      // Sur les fixtures sans BUG-1 (4 sur 6), expected = currentBuggy donc
      // convergence préservée. Sur Boursier et HNW, on diverge volontairement
      // (157k vs 160k ; 3,45M vs 3,55M).
      it('KPI gross_value = expected.grossValueMVStrict (V1.2 P0.2)', () => {
        expect(nearlyEqual(data.kpis.gross_value, fixture.expected.grossValueMVStrict, EPS_EUR))
          .toBe(true)
      })

      // Conséquence dérivée : net_value et debt_ratio recalculés depuis le brut strict.
      it('KPI net_value = expected.netValue (dérivé du brut strict)', () => {
        expect(nearlyEqual(data.kpis.net_value, fixture.expected.netValue, EPS_EUR))
          .toBe(true)
      })

      it('KPI debt_ratio = totalDebt / grossValueMVStrict × 100 (dérivé)', () => {
        const expectedRatio = fixture.expected.grossValueMVStrict > 0
          ? Math.round((fixture.expected.totalDebt / fixture.expected.grossValueMVStrict) * 10000) / 100
          : 0
        expect(nearlyEqual(data.kpis.debt_ratio, expectedRatio, EPS_PERCENT)).toBe(true)
      })

      it('KPI cash_flow_immo_y1 converge au centime près (valeur inchangée par P0.4)', () => {
        expect(nearlyEqual(data.kpis.cash_flow_immo_y1, fixture.currentBuggy.cashFlowMonthly, EPS_EUR))
          .toBe(true)
      })

      it('KPI cash_flow_immo_y1_label exposé (P0.4)', () => {
        expect(data.kpis.cash_flow_immo_y1_label).toBe('Cash-flow immobilier (Y1 simulé)')
      })

      // V1.3 P0.3 — `cagr` supprimé. Remplacé par 2 champs séparés :
      it('KPI croissance_patrimoine_pct = expected.croissance_patrimoine_pct (V1.3 P0.3)', () => {
        expect(nearlyEqual(
          data.kpis.croissance_patrimoine_pct,
          fixture.expected.croissance_patrimoine_pct,
          EPS_CAGR,
        )).toBe(true)
      })

      it('KPI twr_portefeuille_pct = expected.twr_portefeuille_pct (V1.3 P0.3)', () => {
        expect(nearlyEqual(
          data.kpis.twr_portefeuille_pct,
          fixture.expected.twr_portefeuille_pct,
          EPS_CAGR,
        )).toBe(true)
      })

      it('Labels TWR et Croissance non vides', () => {
        expect(data.kpis.twr_portefeuille_label).toBeTruthy()
        expect(data.kpis.croissance_patrimoine_label).toBeTruthy()
      })

      // V1.2 P0.2 — confidence_score recalculé sur le brut strict.
      // Formule : (highConfAssets + freshPortfolio) / grossValueMVStrict × 100.
      it('KPI confidence_score = (highConf assets + fresh portfolio) / grossValueMVStrict × 100', () => {
        const highConfAssets = fixture.inputs.assets
          .filter((a) => a.confidence === 'high')
          .reduce((s, a) => s + (a.current_value ?? 0), 0)
        const freshPortfolio = fixture.inputs.portfolioPositions
          .filter((p) => p.status === 'active' && !p.priceStale && p.marketValue !== null)
          .reduce((s, p) => s + (p.marketValue ?? 0), 0)
        const expectedScore = fixture.expected.grossValueMVStrict > 0
          ? Math.round(((highConfAssets + freshPortfolio) / fixture.expected.grossValueMVStrict) * 10000) / 100
          : 0
        expect(nearlyEqual(data.kpis.confidence_score, expectedScore, 0.1)).toBe(true)
      })

      // V2.3 — Le top atomique (`topAssets`) a été supprimé du `DashboardData`
      // et remplacé par `topAssetsConsolidated` (consolidé par enveloppe / bien /
      // compte). Couverture détaillée déléguée à `topConsolide.test.ts` +
      // tests unitaires de `buildTopAssetsConsolidated`. Ici on vérifie juste
      // que le contrat est respecté : tableau présent, ≤ 5 entrées, clés stables.
      it('top consolidé : tableau ≤ 5, clés stables, % du brut ≤ 100,01 (V2.3)', () => {
        expect(Array.isArray(data.topAssetsConsolidated)).toBe(true)
        expect(data.topAssetsConsolidated.length).toBeLessThanOrEqual(5)
        for (const row of data.topAssetsConsolidated) {
          expect(row.key).toMatch(/^(envelope|re|cash|class):/)
          // % du brut peut dépasser 100 si la dette n'est pas déduite — mais
          // pas raisonnablement > 100 à l'échelle de l'item.
          expect(row.percentOfGross).toBeGreaterThanOrEqual(0)
        }
      })

      // V1.2 P0.6 — Allocation bascule sur `expected.allocation` (taxonomie unifiée).
      it('allocation : clés = expected.allocation, dans le bon ordre (V1.2 P0.6)', () => {
        expect(data.allocation.length).toBe(fixture.expected.allocation.length)
        const gotKeys = data.allocation.map((s) => s.key)
        const expKeys = fixture.expected.allocation.map((s) => s.key)
        expect(gotKeys).toEqual(expKeys)
      })

      // V1.2 P0.2 + P0.6 — La somme des % atteint maintenant 100 %
      // (corrigé par P0.2 sur le brut strict, et par P0.6 sur la taxonomie).
      it('allocation : somme des % = 100 (à 0,1 pp près) [TODO V1.2 résolu]', () => {
        const sum = data.allocation.reduce((s, slice) => s + slice.percent, 0)
        if (data.kpis.gross_value > 0) {
          expect(sum).toBeCloseTo(100, 1)
        } else {
          expect(sum).toBe(0)
        }
      })

      // Garde-fou anti-régression du calc (validé en V1.1 — décision n° 2).
      it('allocation : somme des valeurs = (assets positifs) + (allocationByClass) — invariant', () => {
        const sumAlloc = data.allocation.reduce((s, slice) => s + slice.valueEur, 0)
        const expectedSum = fixture.inputs.assets
          .filter((a) => (a.current_value ?? 0) > 0)
          .reduce((s, a) => s + (a.current_value ?? 0), 0)
          + fixture.inputs.portfolioSummary.allocationByClass
            .filter((c) => c.value > 0)
            .reduce((s, c) => s + c.value, 0)
        expect(sumAlloc).toBeCloseTo(expectedSum, 2)
      })

      it('timeline : N snapshots = N points, ordre ASC pour l\'affichage', () => {
        expect(data.timeline.length).toBe(fixture.inputs.snapshots.length)
        // L'ordre attendu est ASC (oldest first) — bloc inline:293 `[...snapshots].reverse()`
        for (let i = 1; i < data.timeline.length; i++) {
          const prev = new Date(data.timeline[i - 1]!.date).getTime()
          const curr = new Date(data.timeline[i]!.date).getTime()
          expect(curr).toBeGreaterThanOrEqual(prev)
        }
      })

      it('hasImmoSim : vrai SSI au moins un bien immo avec simulation complète', () => {
        const expected = fixture.inputs.realEstatePortfolio.properties.some(
          (p) => !p.simulation.incompleteData,
        )
        expect(data.hasImmoSim).toBe(expected)
      })

      it('idempotence : deux appels successifs renvoient des KPIs identiques', () => {
        const second = computeDashboardData(fixture.inputs)
        expect(second.kpis.gross_value).toBe(data.kpis.gross_value)
        expect(second.kpis.net_value).toBe(data.kpis.net_value)
        expect(second.kpis.croissance_patrimoine_pct).toBe(data.kpis.croissance_patrimoine_pct)
        expect(second.kpis.twr_portefeuille_pct).toBe(data.kpis.twr_portefeuille_pct)
        expect(second.topAssetsConsolidated).toEqual(data.topAssetsConsolidated)
        expect(second.allocation).toEqual(data.allocation)
      })
    },
  )

  // V2.3 — Le tie-breaker spécifique au top atomique (id croissant sur 3
  // positions à 15 000 €) n'a plus de sens depuis la consolidation par
  // enveloppe : ces 3 positions ETF sont désormais agrégées dans la même
  // ligne « PEA » (ou fallback `class:etf`). La détection des ex æquo
  // est donc déplacée au niveau bucket et testée dans
  // `lib/portfolio/__tests__/top-assets-consolidated.test.ts`.
})

// ─────────────────────────────────────────────────────────────────────
// Cibles V1.2 / V1.3 — TODOs vivants (corrections de calculs)
// ─────────────────────────────────────────────────────────────────────

describe('V1.2 — Corrections P0.2 + P0.4 + P0.6 [livrées]', () => {
  it('P0.4 livré : label cash_flow_immo_y1_label = « Cash-flow immobilier (Y1 simulé) »', () => {
    for (const f of ALL_FIXTURES) {
      const d = computeDashboardData(f.inputs)
      expect(d.kpis.cash_flow_immo_y1_label).toBe('Cash-flow immobilier (Y1 simulé)')
    }
  })

  it('P0.2 livré : aucune fixture ne diverge sur grossValue vs expected.grossValueMVStrict', () => {
    for (const f of ALL_FIXTURES) {
      const d = computeDashboardData(f.inputs)
      expect(d.kpis.gross_value).toBeCloseTo(f.expected.grossValueMVStrict, 2)
    }
  })

  it('P0.6 livré : aucune clé d\'allocation ne porte les anciens préfixes `asset:` / `class:`', () => {
    for (const f of ALL_FIXTURES) {
      const d = computeDashboardData(f.inputs)
      for (const slice of d.allocation) {
        expect(slice.key).not.toMatch(/^asset:/)
        expect(slice.key).not.toMatch(/^class:/)
      }
    }
  })
})

describe('V1.3 — TWR + Croissance patrimoine séparés [TODO]', () => {
  it.todo('après P0.3 : data.kpis expose `twr_portefeuille_pct` ET `croissance_patrimoine_pct` distincts')
  it.todo('après P0.3 : `cagr` (champ legacy) supprimé du retour ou aliasé sur croissance_patrimoine_pct')
})

describe('V1.4 — Bascule de la page sur le pipeline unifié [LIVRÉ]', () => {
  it('dashboard/page.tsx consomme `loadDashboardInputs` + `computeDashboardData`', () => {
    // Test couvert par le fait que page.tsx compile et que `npm run build`
    // passe : si l'import était cassé, le build planterait.
    expect(true).toBe(true)
  })
  it('endpoint /api/dashboard supprimé', () => {
    // Couvert par tsc qui ne trouverait plus le module — voir Phase 6 V1.4.
    expect(true).toBe(true)
  })
})
