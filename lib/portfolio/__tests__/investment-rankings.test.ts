/**
 * Tests V2.4-BIS du moteur de classement Champions / Casseroles.
 *
 * Vérifie :
 *   - Séparation stricte des 4 buckets (pas de mélange inter-classes)
 *   - Formule plus-value latente (financier + crypto)
 *   - Formule rendement locatif net (immo) + exclusion RP (fiscalRegime null)
 *   - Taux contractuel cash (interest_rate)
 *   - Bucket à 1 position → uniquement dans `best`, `worst` vide
 *   - Bucket à 0 position → clé absente du retour
 *   - Tie-breaker déterministe sur id
 */
import { describe, it, expect } from 'vitest'
import {
  buildInvestmentRankings,
  type PositionForRanking,
  type PropertyForRanking,
  type CashAccountForRanking,
} from '../investment-rankings'

const emptyInput = (): {
  positions: PositionForRanking[],
  properties: PropertyForRanking[],
  cashAccounts: CashAccountForRanking[],
} => ({ positions: [], properties: [], cashAccounts: [] })

describe('buildInvestmentRankings — buckets absents', () => {
  it('aucun input → objet vide (toutes les clés omises)', () => {
    const out = buildInvestmentRankings(emptyInput())
    expect(out.financier).toBeUndefined()
    expect(out.crypto).toBeUndefined()
    expect(out.immobilier).toBeUndefined()
    expect(out.cash).toBeUndefined()
  })
})

describe('buildInvestmentRankings — financier (plus-value latente)', () => {
  it('calcule (MV − CB) / CB × 100 et range par yieldPct décroissant', () => {
    const positions: PositionForRanking[] = [
      { id: 'P1', label: 'MSCI World Swap', envelopeLabel: 'PEA', assetClass: 'etf',
        marketValueEur: 12_430, costBasisEur: 10_000 },
      { id: 'P2', label: 'Crédit Agricole',  envelopeLabel: 'CTO', assetClass: 'actions',
        marketValueEur:  9_790, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.financier).toBeDefined()
    expect(out.financier!.best[0]!.label).toBe('MSCI World Swap')
    expect(out.financier!.best[0]!.yieldPct).toBeCloseTo(24.3, 1)
    expect(out.financier!.best[0]!.metricType).toBe('plus_value_latente')
    expect(out.financier!.best[0]!.envelopeLabel).toBe('PEA')
    expect(out.financier!.worst[0]!.label).toBe('Crédit Agricole')
    expect(out.financier!.worst[0]!.yieldPct).toBeCloseTo(-2.1, 1)
  })

  it('cost_basis null ou 0 → position exclue silencieusement', () => {
    const positions: PositionForRanking[] = [
      { id: 'P_ok',  label: 'OK',    assetClass: 'etf',
        marketValueEur: 12_000, costBasisEur: 10_000 },
      { id: 'P_no', label: 'NoCB',  assetClass: 'etf',
        marketValueEur: 5_000,  costBasisEur: 0 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.financier!.best[0]!.label).toBe('OK')
    expect(out.financier!.worst).toEqual([])  // 1 seul candidat éligible
  })

  it('MV null → position exclue silencieusement', () => {
    const positions: PositionForRanking[] = [
      { id: 'P', label: 'X', assetClass: 'etf', marketValueEur: null, costBasisEur: 1000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.financier).toBeUndefined()
  })
})

describe('buildInvestmentRankings — crypto (séparation stricte vs financier)', () => {
  it('asset_class crypto → bucket crypto, jamais financier', () => {
    const positions: PositionForRanking[] = [
      { id: 'P_btc', label: 'Bitcoin', envelopeLabel: 'Wallet', assetClass: 'crypto',
        marketValueEur: 11_850, costBasisEur: 10_000 },
      { id: 'P_xrp', label: 'XRP',     envelopeLabel: 'Wallet', assetClass: 'crypto',
        marketValueEur:  9_180, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.crypto).toBeDefined()
    expect(out.financier).toBeUndefined()  // pas de mélange
    expect(out.crypto!.best[0]!.label).toBe('Bitcoin')
    expect(out.crypto!.best[0]!.yieldPct).toBeCloseTo(18.5, 1)
    expect(out.crypto!.worst[0]!.label).toBe('XRP')
    expect(out.crypto!.worst[0]!.yieldPct).toBeCloseTo(-8.2, 1)
  })
})

describe('buildInvestmentRankings — immobilier locatif (RP exclue)', () => {
  it('calcule loyers_nets / valeur × 100 et exclut la RP (fiscalRegime null)', () => {
    const properties: PropertyForRanking[] = [
      { id: 'p_tand', label: 'Immeuble Tandoori',
        netAnnualRentEur: 21_320, currentValueEur: 410_000,
        fiscalRegime: 'lmnp_reel' },
      { id: 'p_rp', label: 'Maison RP',
        netAnnualRentEur: null, currentValueEur: 350_000,
        fiscalRegime: null },   // ← RP, doit être exclue
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), properties })
    expect(out.immobilier).toBeDefined()
    expect(out.immobilier!.best[0]!.label).toBe('Immeuble Tandoori')
    expect(out.immobilier!.best[0]!.yieldPct).toBeCloseTo(5.2, 1)
    expect(out.immobilier!.best[0]!.metricType).toBe('rendement_locatif')
    expect(out.immobilier!.worst).toEqual([])   // 1 seul bien éligible
  })

  it('loyers null ou valeur null → bien exclu', () => {
    const properties: PropertyForRanking[] = [
      { id: 'p1', label: 'X', netAnnualRentEur: null, currentValueEur: 100_000, fiscalRegime: 'lmnp_reel' },
      { id: 'p2', label: 'Y', netAnnualRentEur: 5_000, currentValueEur: null,   fiscalRegime: 'lmnp_reel' },
      { id: 'p3', label: 'Z', netAnnualRentEur: 5_000, currentValueEur: 0,      fiscalRegime: 'lmnp_reel' },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), properties })
    expect(out.immobilier).toBeUndefined()
  })
})

describe('buildInvestmentRankings — cash (taux contractuel)', () => {
  it('utilise interest_rate, exclut les comptes sans taux (compte courant)', () => {
    const cashAccounts: CashAccountForRanking[] = [
      { id: 'c_lep',  label: 'LEP',     interestRatePct: 5.0, balanceEur: 10_300 },
      { id: 'c_la',   label: 'Livret A', interestRatePct: 3.0, balanceEur:  8_000 },
      { id: 'c_cc',   label: 'CC',       interestRatePct: null, balanceEur:  2_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), cashAccounts })
    expect(out.cash).toBeDefined()
    expect(out.cash!.best[0]!.label).toBe('LEP')
    expect(out.cash!.best[0]!.yieldPct).toBe(5.0)
    expect(out.cash!.best[0]!.metricType).toBe('taux_contractuel')
    expect(out.cash!.worst[0]!.label).toBe('Livret A')
  })
})

describe('buildInvestmentRankings — règle « 1 position → best only »', () => {
  it('bucket à 1 candidat → best rempli, worst vide', () => {
    const positions: PositionForRanking[] = [
      { id: 'P', label: 'Solo', assetClass: 'etf',
        marketValueEur: 12_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.financier!.best).toHaveLength(1)
    expect(out.financier!.worst).toHaveLength(0)
  })

  it('bucket à 2 candidats → best ≠ worst', () => {
    const positions: PositionForRanking[] = [
      { id: 'A', label: 'A', assetClass: 'etf', marketValueEur: 11_000, costBasisEur: 10_000 },
      { id: 'B', label: 'B', assetClass: 'etf', marketValueEur:  9_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.financier!.best[0]!.id).toBe('A')
    expect(out.financier!.worst[0]!.id).toBe('B')
  })
})

describe('buildInvestmentRankings — pas de mélange inter-classes', () => {
  it('un PEA très gagnant ne contamine pas immobilier ni cash', () => {
    const positions: PositionForRanking[] = [
      { id: 'P', label: 'PEA gagnant', envelopeLabel: 'PEA', assetClass: 'etf',
        marketValueEur: 50_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.financier).toBeDefined()
    expect(out.immobilier).toBeUndefined()
    expect(out.cash).toBeUndefined()
    expect(out.crypto).toBeUndefined()
  })
})
