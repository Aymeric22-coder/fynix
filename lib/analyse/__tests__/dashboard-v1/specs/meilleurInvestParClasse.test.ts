/**
 * Spec P0.7 — Meilleur / Pire investissement PAR CLASSE (V2.4-BIS).
 *
 * Vérifie le câblage de bout en bout via `computeDashboardData(inputs)` :
 *   - Plus-value latente (financier + crypto)
 *   - Rendement locatif net (immobilier, RP exclue par fiscalRegime null)
 *   - Taux contractuel (cash)
 *   - 4 buckets strictement isolés
 *   - Buckets vides absents de l'objet final
 *   - Aucun seuil temporel (90 j supprimé en V2.4-BIS)
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

describe('P0.7 V2.4-BIS — Meilleur / Pire par classe (rendement instantané)', () => {
  it('inputs vides → tous les buckets absents (objet vide)', () => {
    const data = computeDashboardData(makeInputs({}))
    expect(data.investmentRankings.financier).toBeUndefined()
    expect(data.investmentRankings.crypto).toBeUndefined()
    expect(data.investmentRankings.immobilier).toBeUndefined()
    expect(data.investmentRankings.cash).toBeUndefined()
  })

  it('financier : classement par plus-value latente (MV − CB) / CB', () => {
    const inputs = makeInputs({
      envelopes: [
        { id: 'env-pea', name: 'PEA', envelopeType: 'pea' },
        { id: 'env-cto', name: 'CTO', envelopeType: 'cto' },
      ],
      portfolioPositions: [
        { positionId: 'P_msci', name: 'MSCI World Swap', assetClass: 'etf', status: 'active',
          marketValue: 12_430, costBasis: 10_000, priceStale: false, envelopeId: 'env-pea' },
        { positionId: 'P_aca',  name: 'Crédit Agricole', assetClass: 'actions', status: 'active',
          marketValue:  9_790, costBasis: 10_000, priceStale: false, envelopeId: 'env-cto' },
      ],
    })
    const data = computeDashboardData(inputs)
    const fin = data.investmentRankings.financier!
    expect(fin.best[0]!.label).toBe('MSCI World Swap')
    expect(fin.best[0]!.envelopeLabel).toBe('PEA')
    expect(fin.best[0]!.yieldPct).toBeCloseTo(24.3, 1)
    expect(fin.worst[0]!.label).toBe('Crédit Agricole')
    expect(fin.worst[0]!.yieldPct).toBeCloseTo(-2.1, 1)
  })

  it('crypto : classement par plus-value latente, séparé du financier', () => {
    const inputs = makeInputs({
      envelopes: [{ id: 'env-pea', name: 'PEA', envelopeType: 'pea' }],
      portfolioPositions: [
        { positionId: 'P_pea', name: 'ETF', assetClass: 'etf', status: 'active',
          marketValue: 12_000, costBasis: 10_000, priceStale: false, envelopeId: 'env-pea' },
        { positionId: 'P_btc', name: 'Bitcoin', assetClass: 'crypto', status: 'active',
          marketValue: 11_850, costBasis: 10_000, priceStale: false },
        { positionId: 'P_xrp', name: 'XRP', assetClass: 'crypto', status: 'active',
          marketValue:  9_180, costBasis: 10_000, priceStale: false },
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.financier!.best[0]!.label).toBe('ETF')
    expect(data.investmentRankings.crypto!.best[0]!.label).toBe('Bitcoin')
    expect(data.investmentRankings.crypto!.worst[0]!.label).toBe('XRP')
    // Le PEA ne contamine JAMAIS le bucket crypto.
    expect(data.investmentRankings.crypto!.best.find((i) => i.label === 'ETF')).toBeUndefined()
  })

  it('immobilier : rendement locatif net = (netYield × totalCost) / valeur — RP exclue', () => {
    const inputs = makeInputs({
      realEstatePortfolio: {
        properties: [
          // Tandoori : netYield 4 %, totalCost 410_000 € → loyers nets = 16 400 €/an
          //          / valeur 410_000 → rendement_locatif = 4 %
          { propertyId: 'p_tand', propertyName: 'Immeuble Tandoori', assetId: 'a_tand',
            simulation: { incompleteData: false, netYieldPct: 4, totalCostEur: 410_000 },
            currentValueEur: 410_000,
            fiscalRegime: 'lmnp_reel' },
          // RP : fiscalRegime null → exclue
          { propertyId: 'p_rp', propertyName: 'Maison RP', assetId: 'a_rp',
            simulation: { incompleteData: false, netYieldPct: undefined, totalCostEur: undefined },
            currentValueEur: 350_000,
            fiscalRegime: null },
        ],
        totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
      },
    })
    const data = computeDashboardData(inputs)
    const immo = data.investmentRankings.immobilier!
    expect(immo.best[0]!.label).toBe('Immeuble Tandoori')
    expect(immo.best[0]!.yieldPct).toBeCloseTo(4, 1)
    expect(immo.best[0]!.metricType).toBe('rendement_locatif')
    expect(immo.worst).toEqual([])  // 1 seul bien locatif éligible
  })

  it('cash : classement par taux contractuel — compte courant sans taux exclu', () => {
    const inputs = makeInputs({
      cashAccounts: [
        { id: 'c_lep',  asset_id: null, balance: 10_300, currency: 'EUR',
          account_type: 'lep',      interest_rate: 5.0, bank_name: null },
        { id: 'c_la',   asset_id: null, balance:  8_000, currency: 'EUR',
          account_type: 'livret_a', interest_rate: 3.0, bank_name: 'Boursorama' },
        { id: 'c_cc',   asset_id: null, balance:  2_000, currency: 'EUR',
          account_type: 'compte_courant', interest_rate: null, bank_name: 'BNP' },
      ],
    })
    const data = computeDashboardData(inputs)
    const cash = data.investmentRankings.cash!
    expect(cash.best[0]!.label).toContain('lep')
    expect(cash.best[0]!.yieldPct).toBe(5.0)
    expect(cash.worst[0]!.label).toContain('livret_a')
    expect(cash.worst[0]!.yieldPct).toBe(3.0)
  })

  it('bucket à 1 position → uniquement dans best, worst vide', () => {
    const inputs = makeInputs({
      portfolioPositions: [
        { positionId: 'P', name: 'Solo', assetClass: 'etf', status: 'active',
          marketValue: 12_000, costBasis: 10_000, priceStale: false },
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.financier!.best).toHaveLength(1)
    expect(data.investmentRankings.financier!.worst).toEqual([])
  })

  it('aucun seuil temporel : une position de quelques jours figure tout de suite', () => {
    const inputs = makeInputs({
      portfolioPositions: [
        // Position « ouverte aujourd\'hui » : aucune tx, juste MV + CB.
        { positionId: 'P', name: 'Fresh', assetClass: 'etf', status: 'active',
          marketValue: 11_000, costBasis: 10_000, priceStale: false,
          acquisitionDate: '2026-05-30' },  // 3 jours seulement
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.financier).toBeDefined()
    expect(data.investmentRankings.financier!.best[0]!.label).toBe('Fresh')
    expect(data.investmentRankings.financier!.best[0]!.yieldPct).toBeCloseTo(10, 1)
  })
})
