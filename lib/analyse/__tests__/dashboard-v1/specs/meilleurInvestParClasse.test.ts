/**
 * Spec P0.7 — Meilleur / Pire investissement PAR CLASSE d'actifs (activé V2.4).
 *
 * Cible : afficher un meilleur ET un pire par classe (financier, crypto,
 * immobilier, cash), AVEC isolation stricte (pas de mélange inter-classes).
 *
 * V2.4 ST6 — Ces tests vérifient le contrat de bout en bout via
 * `computeDashboardData(inputs)` qui doit exposer `investmentRankings`
 * avec 4 catégories non mélangées.
 *
 * Les tests unitaires fins (split crypto/financier, tri, tie-breaker)
 * sont déjà couverts par `lib/portfolio/__tests__/investment-rankings.test.ts`.
 * Ici on vérifie le câblage pipeline.
 */
import { describe, it, expect } from 'vitest'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import type { DashboardPipelineInputs } from '@/lib/analyse/dashboard-pipeline'

const ASOF = new Date('2026-06-02')

/** Fabrique un input minimal valide pour `computeDashboardData`. */
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

describe('P0.7 — Meilleur / Pire par classe (V2.4)', () => {
  it('expose toujours 4 catégories dans investmentRankings (financier, crypto, immobilier, cash)', () => {
    const data = computeDashboardData(makeInputs({}))
    expect(data.investmentRankings.map((r) => r.category))
      .toEqual(['financier', 'crypto', 'immobilier', 'cash'])
  })

  it('financier : range correctement les enveloppes non-crypto via envelope_type', () => {
    const inputs = makeInputs({
      envelopes: [
        { id: 'env-pea', name: 'PEA Bourso', envelopeType: 'pea' },
        { id: 'env-cto', name: 'CTO TR',    envelopeType: 'cto' },
      ],
      portfolioPositions: [
        {
          positionId: 'P1', name: 'ETF World', assetClass: 'etf', status: 'active',
          marketValue: 12_000, costBasis: 10_000, priceStale: false,
          currentQuantity: 100, acquisitionDate: '2024-06-01',
          averagePriceEur: 100, envelopeId: 'env-pea',
        },
        {
          positionId: 'P2', name: 'Tesla', assetClass: 'actions', status: 'active',
          marketValue: 8_000, costBasis: 10_000, priceStale: false,
          currentQuantity: 50, acquisitionDate: '2024-06-01',
          averagePriceEur: 200, envelopeId: 'env-cto',
        },
      ],
      transactionsPortefeuille: [
        { executedAt: '2024-06-01', type: 'purchase', positionId: 'P1', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
        { executedAt: '2024-06-01', type: 'purchase', positionId: 'P2', quantity:  50, unitPriceEur: 200, amountEur: 10_000 },
      ],
    })
    const data = computeDashboardData(inputs)
    const fin = data.investmentRankings.find((r) => r.category === 'financier')!
    expect(fin.totalCandidates).toBe(2)
    expect(fin.best.map((b) => b.label).sort()).toEqual(['CTO TR', 'PEA Bourso'].sort())
  })

  it('crypto : seules les enveloppes wallet_crypto y atterrissent (pas de mélange)', () => {
    const inputs = makeInputs({
      envelopes: [
        { id: 'env-pea',    name: 'PEA',  envelopeType: 'pea' },           // ne doit PAS aller en crypto
        { id: 'env-ledger', name: 'Ledger Nano X', envelopeType: 'wallet_crypto' },
      ],
      portfolioPositions: [
        { positionId: 'P_pea', name: 'ETF', assetClass: 'etf', status: 'active',
          marketValue: 12_000, costBasis: 10_000, priceStale: false,
          currentQuantity: 100, acquisitionDate: '2024-06-01',
          averagePriceEur: 100, envelopeId: 'env-pea' },
        { positionId: 'P_btc', name: 'BTC', assetClass: 'crypto', status: 'active',
          marketValue: 20_000, costBasis: 10_000, priceStale: false,
          currentQuantity: 0.5, acquisitionDate: '2024-06-01',
          averagePriceEur: 20_000, envelopeId: 'env-ledger' },
      ],
      transactionsPortefeuille: [
        { executedAt: '2024-06-01', type: 'purchase', positionId: 'P_pea', quantity: 100, unitPriceEur: 100,     amountEur: 10_000 },
        { executedAt: '2024-06-01', type: 'purchase', positionId: 'P_btc', quantity: 0.5, unitPriceEur: 20_000, amountEur: 10_000 },
      ],
    })
    const data = computeDashboardData(inputs)
    const cry = data.investmentRankings.find((r) => r.category === 'crypto')!
    expect(cry.totalCandidates).toBe(1)
    expect(cry.best[0]!.label).toBe('Ledger Nano X')
    // Une enveloppe PEA ne doit JAMAIS apparaître dans la catégorie crypto.
    expect(cry.best.find((i) => i.label === 'PEA')).toBeUndefined()
    expect(cry.worst.find((i) => i.label === 'PEA')).toBeUndefined()
  })

  it('immobilier : utilise netNetYield + acquisitionDate, exclut sim incomplete sans yield', () => {
    const inputs = makeInputs({
      realEstatePortfolio: {
        properties: [
          { propertyId: 'p1', propertyName: 'T2 Lyon',  assetId: 'a1',
            simulation: { incompleteData: false, netNetYieldPct: 5.5 },
            acquisitionDate: '2024-06-01' },
          { propertyId: 'p2', propertyName: 'Studio M', assetId: 'a2',
            simulation: { incompleteData: false, netNetYieldPct: -1.2 },
            acquisitionDate: '2024-06-01' },
        ],
        totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
      },
    })
    const data = computeDashboardData(inputs)
    const immo = data.investmentRankings.find((r) => r.category === 'immobilier')!
    expect(immo.totalCandidates).toBe(2)
    expect(immo.best[0]!.label).toBe('T2 Lyon')
    expect(immo.worst[0]!.label).toBe('Studio M')
  })

  it('cash : utilise interest_rate + created_at, label « type — banque »', () => {
    const inputs = makeInputs({
      cashAccounts: [
        { id: 'c1', asset_id: null, balance: 22_950, currency: 'EUR',
          account_type: 'livret_a', interest_rate: 3.0, created_at: '2024-01-15',
          bank_name: 'Boursorama' },
        { id: 'c2', asset_id: null, balance: 5_000, currency: 'EUR',
          account_type: 'compte_courant', interest_rate: 0.0, created_at: '2024-01-15',
          bank_name: 'BNP' },
      ],
    })
    const data = computeDashboardData(inputs)
    const cash = data.investmentRankings.find((r) => r.category === 'cash')!
    expect(cash.totalCandidates).toBe(2)
    expect(cash.best[0]!.label).toBe('livret_a — Boursorama')
    expect(cash.best[0]!.annualizedReturnPct).toBe(3.0)
    expect(cash.worst[0]!.label).toBe('compte_courant — BNP')
  })

  it('pas de mélange inter-classes : un PEA gagnant ne contamine pas immobilier ni cash', () => {
    const inputs = makeInputs({
      envelopes: [{ id: 'env-pea', name: 'PEA gagnant', envelopeType: 'pea' }],
      portfolioPositions: [
        { positionId: 'P', name: 'X', assetClass: 'etf', status: 'active',
          marketValue: 50_000, costBasis: 10_000, priceStale: false,
          currentQuantity: 100, acquisitionDate: '2024-06-01',
          averagePriceEur: 100, envelopeId: 'env-pea' },
      ],
      transactionsPortefeuille: [
        { executedAt: '2024-06-01', type: 'purchase', positionId: 'P', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.find((r) => r.category === 'immobilier')!.totalCandidates).toBe(0)
    expect(data.investmentRankings.find((r) => r.category === 'cash')!.totalCandidates).toBe(0)
    expect(data.investmentRankings.find((r) => r.category === 'crypto')!.totalCandidates).toBe(0)
  })
})
