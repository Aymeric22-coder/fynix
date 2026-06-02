/**
 * Spec P0.7 — Meilleur / Pire investissement PAR CLASSE
 * (V2.4-BIS / V2.4-TER — câblage pipeline complet).
 *
 * V2.4-TER : 2 buckets seulement (`marche` + `immobilier`). Bucket `cash`
 * complètement supprimé. Bucket `marche` = financier + crypto fusionnés.
 *
 * Vérifie le câblage de bout en bout via `computeDashboardData(inputs)` :
 *   - Plus-value latente (positions financier + crypto fusionnées en `marche`)
 *   - Rendement locatif net (immobilier, RP exclue)
 *   - Pas de bucket cash dans le retour
 *   - Aucun seuil temporel (90 j supprimé en V2.4-BIS, inchangé V2.4-TER)
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

describe('P0.7 V2.4-TER — Meilleur / Pire (2 buckets : marché + immobilier)', () => {
  it('inputs vides → tous les buckets absents (objet vide)', () => {
    const data = computeDashboardData(makeInputs({}))
    expect(data.investmentRankings.marche).toBeUndefined()
    expect(data.investmentRankings.immobilier).toBeUndefined()
  })

  it('bucket `cash` totalement absent — même avec des comptes cash renseignés', () => {
    const data = computeDashboardData(makeInputs({
      cashAccounts: [
        { id: 'c_lep',  asset_id: null, balance: 10_300, currency: 'EUR',
          account_type: 'lep', interest_rate: 5.0, bank_name: null },
        { id: 'c_la',   asset_id: null, balance: 8_000,  currency: 'EUR',
          account_type: 'livret_a', interest_rate: 3.0, bank_name: 'Boursorama' },
      ],
    }))
    // @ts-expect-error — `cash` ne fait plus partie d'InvestmentRankings depuis V2.4-TER.
    expect(data.investmentRankings.cash).toBeUndefined()
    expect(data.investmentRankings.marche).toBeUndefined()
    expect(data.investmentRankings.immobilier).toBeUndefined()
  })

  it('marché : classement par plus-value latente, financier + crypto fusionnés', () => {
    const inputs = makeInputs({
      envelopes: [
        { id: 'env-pea', name: 'PEA', envelopeType: 'pea' },
        { id: 'env-wallet', name: 'Wallet', envelopeType: 'wallet_crypto' },
      ],
      portfolioPositions: [
        { positionId: 'P_etf', name: 'Amundi Nasdaq', assetClass: 'etf', status: 'active',
          marketValue: 14_980, costBasis: 10_000, priceStale: false, envelopeId: 'env-pea' },
        { positionId: 'P_eth', name: 'Ethereum', assetClass: 'crypto', status: 'active',
          marketValue:  6_840, costBasis: 10_000, priceStale: false, envelopeId: 'env-wallet' },
      ],
    })
    const data = computeDashboardData(inputs)
    const marche = data.investmentRankings.marche!
    expect(marche.best[0]!.label).toBe('Amundi Nasdaq')
    expect(marche.best[0]!.subType).toBe('financier')
    expect(marche.best[0]!.yieldPct).toBeCloseTo(49.8, 1)
    expect(marche.worst[0]!.label).toBe('Ethereum')
    expect(marche.worst[0]!.subType).toBe('crypto')
    expect(marche.worst[0]!.yieldPct).toBeCloseTo(-31.6, 1)
  })

  it('immobilier : rendement locatif net = (netYield × totalCost) / valeur — RP exclue', () => {
    const inputs = makeInputs({
      realEstatePortfolio: {
        properties: [
          // Tandoori : netYield 4 %, totalCost 410 k€ → loyers nets = 16 400 €/an
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

  it('bucket à 1 position → uniquement dans best, worst vide', () => {
    const inputs = makeInputs({
      portfolioPositions: [
        { positionId: 'P', name: 'Solo', assetClass: 'etf', status: 'active',
          marketValue: 12_000, costBasis: 10_000, priceStale: false },
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.marche!.best).toHaveLength(1)
    expect(data.investmentRankings.marche!.worst).toEqual([])
  })

  it('aucun seuil temporel : une position de quelques jours figure tout de suite', () => {
    const inputs = makeInputs({
      portfolioPositions: [
        { positionId: 'P', name: 'Fresh', assetClass: 'etf', status: 'active',
          marketValue: 11_000, costBasis: 10_000, priceStale: false,
          acquisitionDate: '2026-05-30' },
      ],
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.marche).toBeDefined()
    expect(data.investmentRankings.marche!.best[0]!.label).toBe('Fresh')
    expect(data.investmentRankings.marche!.best[0]!.yieldPct).toBeCloseTo(10, 1)
  })

  it('asymétrie autorisée : immo à 1 bien → card Pires sans ligne immo', () => {
    const inputs = makeInputs({
      portfolioPositions: [
        // 2 positions marché : génèrent best + worst côté marché
        { positionId: 'P_a', name: 'Best', assetClass: 'etf', status: 'active',
          marketValue: 15_000, costBasis: 10_000, priceStale: false },
        { positionId: 'P_b', name: 'Worst', assetClass: 'etf', status: 'active',
          marketValue:  8_000, costBasis: 10_000, priceStale: false },
      ],
      realEstatePortfolio: {
        // 1 seul bien immo : best uniquement, worst vide côté immo
        properties: [
          { propertyId: 'p1', propertyName: 'T2', assetId: 'a1',
            simulation: { incompleteData: false, netYieldPct: 5, totalCostEur: 200_000 },
            currentValueEur: 200_000,
            fiscalRegime: 'lmnp_reel' },
        ],
        totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
      },
    })
    const data = computeDashboardData(inputs)
    expect(data.investmentRankings.marche!.best).toHaveLength(1)
    expect(data.investmentRankings.marche!.worst).toHaveLength(1)
    expect(data.investmentRankings.immobilier!.best).toHaveLength(1)
    expect(data.investmentRankings.immobilier!.worst).toEqual([])
  })
})
