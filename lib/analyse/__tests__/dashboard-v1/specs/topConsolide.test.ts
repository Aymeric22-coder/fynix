/**
 * Spec P0.5 — Top 5 consolidé par enveloppe / bien — activé V2.3.
 *
 * Vérifie le câblage de bout en bout via `computeDashboardData(inputs)` :
 *   - Le champ exposé est désormais `topAssetsConsolidated` (et non plus
 *     l'ancien `topAssets` atomique, supprimé en V2.3).
 *   - 1 enveloppe = 1 ligne, 1 bien = 1 ligne, 1 livret = 1 ligne.
 *   - Pas de positions atomiques mélangées.
 *
 * Les tests unitaires fins (tri, fallback, tie-breaker, % du brut) sont
 * couverts par `lib/portfolio/__tests__/top-assets-consolidated.test.ts`.
 * Ici on vérifie le câblage pipeline + les invariants pertinents pour Z8.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import type { DashboardPipelineInputs } from '@/lib/analyse/dashboard-pipeline'

const ASOF = new Date('2026-06-02')

function makeInputs(over: Partial<DashboardPipelineInputs>): DashboardPipelineInputs {
  return {
    assets:              [],
    debts:               [],
    snapshots:           [],
    portfolioSummary: {
      totalMarketValue: 0, totalCostBasis: 0, totalCostBasisValued: 0,
      totalUnrealizedPnL: null, totalUnrealizedPnLPct: null,
      positionsCount: 0, valuedPositionsCount: 0, freshnessRatio: 0,
      allocationByClass: [],
    },
    portfolioPositions:  [],
    realEstatePortfolio: {
      properties: [], totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
    },
    cashAccounts:        [],
    envelopes:           [],
    transactionsPortefeuille: [],
    asOfDate: ASOF,
    ...over,
  }
}

describe('P0.5 V2.3 — Top consolidé via le pipeline complet', () => {
  it('investisseur-boursier-like : 1 PEA + 1 CTO + 1 AV + 1 Livret = 4 lignes', () => {
    const inputs = makeInputs({
      assets: [
        { id: 'a1', name: 'PEA Lyxor STOXX', asset_type: 'other',
          current_value: 80_000, acquisition_price: null, confidence: 'high', last_valued_at: null },
      ],
      envelopes: [
        { id: 'env-pea', name: 'PEA',            envelopeType: 'pea' },
        { id: 'env-cto', name: 'CTO',            envelopeType: 'cto' },
        { id: 'env-av',  name: 'Assurance-vie',  envelopeType: 'assurance_vie' },
      ],
      portfolioPositions: [
        { positionId: 'P_pea1', name: 'ETF World',  assetClass: 'etf', status: 'active',
          marketValue: 50_000, costBasis: 40_000, priceStale: false, envelopeId: 'env-pea' },
        { positionId: 'P_pea2', name: 'ETF Emerging', assetClass: 'etf', status: 'active',
          marketValue: 30_000, costBasis: 25_000, priceStale: false, envelopeId: 'env-pea' },
        { positionId: 'P_cto',  name: 'Tesla',       assetClass: 'actions', status: 'active',
          marketValue: 37_000, costBasis: 30_000, priceStale: false, envelopeId: 'env-cto' },
        { positionId: 'P_av',   name: 'Fonds €',     assetClass: 'obligations', status: 'active',
          marketValue: 30_000, costBasis: 30_000, priceStale: false, envelopeId: 'env-av' },
      ],
      portfolioSummary: {
        totalMarketValue: 147_000, totalCostBasis: 125_000, totalCostBasisValued: 125_000,
        totalUnrealizedPnL: 22_000, totalUnrealizedPnLPct: 17.6,
        positionsCount: 4, valuedPositionsCount: 4, freshnessRatio: 1,
        allocationByClass: [
          { assetClass: 'etf',     value: 80_000 },
          { assetClass: 'actions', value: 37_000 },
          { assetClass: 'obligations', value: 30_000 },
        ],
      },
      cashAccounts: [
        { id: 'c_la', asset_id: null, balance: 10_000, currency: 'EUR',
          account_type: 'livret_a', interest_rate: 3.0, bank_name: 'Crédit Agricole' },
      ],
    })
    const data = computeDashboardData(inputs)
    const top = data.topAssetsConsolidated
    expect(top.length).toBeGreaterThanOrEqual(4)
    // Les labels d'enveloppes attendus doivent apparaître.
    const labels = top.map((r) => r.label)
    expect(labels).toContain('PEA')
    expect(labels).toContain('CTO')
    expect(labels).toContain('Assurance-vie')
    expect(labels.find((l) => l.startsWith('livret_a'))).toBeDefined()
    // Pas de positions atomiques (« ETF World », « Tesla », etc.).
    expect(labels.find((l) => l === 'ETF World')).toBeUndefined()
    expect(labels.find((l) => l === 'Tesla')).toBeUndefined()
  })

  it('un livret = 1 ligne (Livret A + LDDS + LEP = 3 lignes distinctes)', () => {
    const inputs = makeInputs({
      cashAccounts: [
        { id: 'c_la',   asset_id: null, balance: 22_950, currency: 'EUR',
          account_type: 'livret_a', interest_rate: 3.0, bank_name: 'Bourso' },
        { id: 'c_ldds', asset_id: null, balance: 12_000, currency: 'EUR',
          account_type: 'ldds',     interest_rate: 3.0, bank_name: 'Bourso' },
        { id: 'c_lep',  asset_id: null, balance: 10_300, currency: 'EUR',
          account_type: 'lep',      interest_rate: 5.0, bank_name: 'Bourso' },
      ],
    })
    const data = computeDashboardData(inputs)
    const cashRows = data.topAssetsConsolidated.filter((r) => r.key.startsWith('cash:'))
    expect(cashRows).toHaveLength(3)
  })

  it('1 bien immo = 1 ligne, RP incluse (contrairement au best/worst Z8.5)', () => {
    const inputs = makeInputs({
      assets: [
        { id: 'a_rp',  name: 'RP Lyon', asset_type: 'real_estate',
          current_value: 350_000, acquisition_price: 300_000, confidence: 'high', last_valued_at: null },
        { id: 'a_loc', name: 'Locatif Saint-Étienne', asset_type: 'real_estate',
          current_value: 200_000, acquisition_price: 180_000, confidence: 'medium', last_valued_at: null },
      ],
    })
    const data = computeDashboardData(inputs)
    const reRows = data.topAssetsConsolidated.filter((r) => r.envelopeType === 'real_estate')
    expect(reRows).toHaveLength(2)
    expect(reRows.map((r) => r.label)).toContain('RP Lyon')
    expect(reRows.map((r) => r.label)).toContain('Locatif Saint-Étienne')
  })

  it('limite à 5 entrées strictes même avec 10+ items', () => {
    const envelopes = Array.from({ length: 8 }, (_, i) => ({
      id:           `env-${i}`,
      name:         `Env${i}`,
      envelopeType: 'cto' as const,
    }))
    const portfolioPositions = envelopes.map((e, i) => ({
      positionId:  `P${i}`,
      name:        `Pos${i}`,
      assetClass:  'etf',
      status:      'active',
      marketValue: 1000 * (10 - i),
      costBasis:   1000 * (10 - i),
      priceStale:  false,
      envelopeId:  e.id,
    }))
    const inputs = makeInputs({
      envelopes,
      portfolioPositions,
      portfolioSummary: {
        totalMarketValue: portfolioPositions.reduce((s, p) => s + p.marketValue, 0),
        totalCostBasis: 0, totalCostBasisValued: 0,
        totalUnrealizedPnL: null, totalUnrealizedPnLPct: null,
        positionsCount: 8, valuedPositionsCount: 8, freshnessRatio: 1,
        allocationByClass: [{ assetClass: 'etf', value: 50_000 }],
      },
    })
    const data = computeDashboardData(inputs)
    expect(data.topAssetsConsolidated).toHaveLength(5)
  })

  it('fallback asset_class : ≥ 50 % positions sans envelopeId', () => {
    const inputs = makeInputs({
      // Pas d'enveloppes définies → toutes les positions seront sans envelopeId
      // (le mapping côté pipeline pose envelopeId = null pour celles sans match).
      portfolioPositions: [
        { positionId: 'P1', name: 'X', assetClass: 'etf',     status: 'active',
          marketValue: 12_000, costBasis: 10_000, priceStale: false, envelopeId: null },
        { positionId: 'P2', name: 'Y', assetClass: 'etf',     status: 'active',
          marketValue: 13_000, costBasis: 10_000, priceStale: false, envelopeId: null },
        { positionId: 'P3', name: 'Z', assetClass: 'actions', status: 'active',
          marketValue:  5_000, costBasis:  4_000, priceStale: false, envelopeId: null },
      ],
      portfolioSummary: {
        totalMarketValue: 30_000, totalCostBasis: 24_000, totalCostBasisValued: 24_000,
        totalUnrealizedPnL: 6_000, totalUnrealizedPnLPct: 25,
        positionsCount: 3, valuedPositionsCount: 3, freshnessRatio: 1,
        allocationByClass: [
          { assetClass: 'etf',     value: 25_000 },
          { assetClass: 'actions', value:  5_000 },
        ],
      },
    })
    const data = computeDashboardData(inputs)
    // Toutes les lignes doivent être des `class:*` (fallback).
    expect(data.topAssetsConsolidated.every((r) => r.key.startsWith('class:'))).toBe(true)
  })
})
