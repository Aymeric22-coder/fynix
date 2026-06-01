/**
 * Spec P0.7 — Filtre d'ancienneté 90 jours sur Meilleur/Pire (activé V2.4).
 *
 * Cible : exclure du calcul Meilleur/Pire toute position dont la détention
 * est < 90 jours.
 *
 * V2.4 ST6 — Ces tests vérifient le câblage du seuil dans le pipeline
 * `computeDashboardData(inputs)`. Le détail unitaire (paramétrage du seuil,
 * exclusion silencieuse, fallback acquisition_date) est déjà couvert par les
 * tests dédiés (`twr-per-envelope`, `yield-per-property`, `rate-per-account`).
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

describe('P0.7 — Filtre ancienneté 90 jours (V2.4)', () => {
  it('financier : enveloppe ouverte il y a 30 j (1ʳᵉ tx récente) → exclue du ranking', () => {
    const inputs = makeInputs({
      envelopes: [{ id: 'env', name: 'CTO récent', envelopeType: 'cto' }],
      portfolioPositions: [
        { positionId: 'P', name: 'X', assetClass: 'actions', status: 'active',
          marketValue: 1_500, costBasis: 1_000, priceStale: false,
          currentQuantity: 10, acquisitionDate: '2026-05-03',
          averagePriceEur: 100, envelopeId: 'env' },
      ],
      transactionsPortefeuille: [
        { executedAt: '2026-05-03', type: 'purchase', positionId: 'P', quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.find((r) => r.category === 'financier')!.totalCandidates).toBe(0)
  })

  it('financier : enveloppe avec ~1 an d\'historique → éligible', () => {
    const inputs = makeInputs({
      envelopes: [{ id: 'env', name: 'CTO ancien', envelopeType: 'cto' }],
      portfolioPositions: [
        { positionId: 'P', name: 'X', assetClass: 'actions', status: 'active',
          marketValue: 1_200, costBasis: 1_000, priceStale: false,
          currentQuantity: 10, acquisitionDate: '2025-06-01',
          averagePriceEur: 100, envelopeId: 'env' },
      ],
      transactionsPortefeuille: [
        { executedAt: '2025-06-01', type: 'purchase', positionId: 'P', quantity: 10, unitPriceEur: 100, amountEur: 1_000 },
      ],
    })
    const data = computeDashboardData(inputs)
    const fin = data.investmentRankings.find((r) => r.category === 'financier')!
    expect(fin.totalCandidates).toBe(1)
    expect(fin.best[0]!.label).toBe('CTO ancien')
  })

  it('immobilier : bien acquis il y a 30 j → exclu ; bien acquis il y a 2 ans → inclus', () => {
    const inputs = makeInputs({
      realEstatePortfolio: {
        properties: [
          { propertyId: 'p_fresh', propertyName: 'Fresh', assetId: 'a_fresh',
            simulation: { incompleteData: false, netNetYieldPct: 8.0 },
            acquisitionDate: '2026-05-03' },
          { propertyId: 'p_old',   propertyName: 'Old',   assetId: 'a_old',
            simulation: { incompleteData: false, netNetYieldPct: 4.0 },
            acquisitionDate: '2024-06-01' },
        ],
        totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
      },
    })
    const data = computeDashboardData(inputs)
    const immo = data.investmentRankings.find((r) => r.category === 'immobilier')!
    expect(immo.totalCandidates).toBe(1)
    expect(immo.best[0]!.label).toBe('Old')
  })

  it('cash : livret ouvert il y a 30 j → exclu ; livret ouvert il y a 1 an → inclus', () => {
    const inputs = makeInputs({
      cashAccounts: [
        { id: 'c_fresh', asset_id: null, balance: 1_000, currency: 'EUR',
          account_type: 'livret_a', interest_rate: 3.0, created_at: '2026-05-03', bank_name: 'X' },
        { id: 'c_old',   asset_id: null, balance: 1_000, currency: 'EUR',
          account_type: 'pel',      interest_rate: 2.5, created_at: '2025-06-01', bank_name: 'Y' },
      ],
    })
    const data = computeDashboardData(inputs)
    const cash = data.investmentRankings.find((r) => r.category === 'cash')!
    expect(cash.totalCandidates).toBe(1)
    expect(cash.best[0]!.label).toBe('pel — Y')
  })

  it('catégorie entièrement sous le seuil 90 j → totalCandidates = 0 (Z8.5 affiche pas de ligne)', () => {
    const inputs = makeInputs({
      realEstatePortfolio: {
        properties: [
          { propertyId: 'p1', propertyName: 'A', assetId: 'a1',
            simulation: { incompleteData: false, netNetYieldPct: 5.0 },
            acquisitionDate: '2026-05-15' },
          { propertyId: 'p2', propertyName: 'B', assetId: 'a2',
            simulation: { incompleteData: false, netNetYieldPct: 4.0 },
            acquisitionDate: '2026-05-20' },
        ],
        totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
      },
    })
    const data = computeDashboardData(inputs)
    const immo = data.investmentRankings.find((r) => r.category === 'immobilier')!
    expect(immo.totalCandidates).toBe(0)
    expect(immo.best).toHaveLength(0)
    expect(immo.worst).toHaveLength(0)
  })
})
