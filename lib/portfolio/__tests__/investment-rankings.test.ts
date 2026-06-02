/**
 * Tests V2.4-BIS / V2.4-TER du moteur de classement Champions / Casseroles.
 *
 * V2.4-TER (ce sprint) :
 *   - 2 buckets seulement : `marche` (financier + crypto fusionnés) et
 *     `immobilier`. Bucket `cash` complètement supprimé.
 *   - `InvestmentRanking` ne porte plus `metricType: 'taux_contractuel'`.
 *   - Nouveau champ informatif `subType: 'financier' | 'crypto'`.
 *
 * Couverture :
 *   - Fusion financier + crypto dans `marche` (pas de séparation)
 *   - Tri par yieldPct sans tenir compte du subType
 *   - Bucket cash absent du retour (pas de clé `cash`)
 *   - Formule plus-value latente (positions) + rendement locatif (immo)
 *   - Exclusion RP par fiscalRegime null
 *   - Bucket à 1 position → best only, worst vide
 *   - Tie-breaker déterministe sur id
 */
import { describe, it, expect } from 'vitest'
import {
  buildInvestmentRankings,
  type PositionForRanking,
  type PropertyForRanking,
  type InvestmentRankings,
} from '../investment-rankings'

const emptyInput = (): {
  positions:  PositionForRanking[],
  properties: PropertyForRanking[],
} => ({ positions: [], properties: [] })

describe('buildInvestmentRankings — buckets absents (V2.4-TER)', () => {
  it('aucun input → objet vide (toutes les clés omises)', () => {
    const out = buildInvestmentRankings(emptyInput())
    expect(out.marche).toBeUndefined()
    expect(out.immobilier).toBeUndefined()
  })

  it('le bucket `cash` n\'existe plus sur le type V2.4-TER', () => {
    const out: InvestmentRankings = buildInvestmentRankings(emptyInput())
    // @ts-expect-error — `cash` n'est plus exposé sur InvestmentRankings depuis V2.4-TER.
    void out.cash
    // Idem pour `financier` et `crypto`, fusionnés dans `marche`.
    // @ts-expect-error — `financier` fusionné dans `marche` depuis V2.4-TER.
    void out.financier
    // @ts-expect-error — `crypto` fusionné dans `marche` depuis V2.4-TER.
    void out.crypto
  })
})

describe('buildInvestmentRankings — marché (plus-value latente fusionnée)', () => {
  it('calcule (MV − CB) / CB × 100 et range par yieldPct décroissant', () => {
    const positions: PositionForRanking[] = [
      { id: 'P1', label: 'MSCI World Swap', envelopeLabel: 'PEA', assetClass: 'etf',
        marketValueEur: 12_430, costBasisEur: 10_000 },
      { id: 'P2', label: 'Crédit Agricole',  envelopeLabel: 'CTO', assetClass: 'actions',
        marketValueEur:  9_790, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche).toBeDefined()
    expect(out.marche!.best[0]!.label).toBe('MSCI World Swap')
    expect(out.marche!.best[0]!.yieldPct).toBeCloseTo(24.3, 1)
    expect(out.marche!.best[0]!.metricType).toBe('plus_value_latente')
    expect(out.marche!.best[0]!.envelopeLabel).toBe('PEA')
    expect(out.marche!.best[0]!.subType).toBe('financier')
    expect(out.marche!.worst[0]!.label).toBe('Crédit Agricole')
    expect(out.marche!.worst[0]!.yieldPct).toBeCloseTo(-2.1, 1)
  })

  it('fusion financier + crypto dans le bucket `marche` (cas mixte)', () => {
    const positions: PositionForRanking[] = [
      // Financière gagnante : +30 %
      { id: 'P_fin', label: 'Nasdaq ETF', envelopeLabel: 'PEA', assetClass: 'etf',
        marketValueEur: 13_000, costBasisEur: 10_000 },
      // Crypto perdante : −10 %
      { id: 'P_eth', label: 'Ethereum', envelopeLabel: 'Wallet', assetClass: 'crypto',
        marketValueEur:  9_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche).toBeDefined()
    // best = financière, worst = crypto, même bucket.
    expect(out.marche!.best[0]!.label).toBe('Nasdaq ETF')
    expect(out.marche!.best[0]!.subType).toBe('financier')
    expect(out.marche!.worst[0]!.label).toBe('Ethereum')
    expect(out.marche!.worst[0]!.subType).toBe('crypto')
    // Pas de bucket séparé crypto / financier.
    // @ts-expect-error — `crypto` fusionné dans `marche` depuis V2.4-TER.
    expect(out.crypto).toBeUndefined()
    // @ts-expect-error — `financier` fusionné dans `marche` depuis V2.4-TER.
    expect(out.financier).toBeUndefined()
  })

  it('cost_basis null ou 0 → position exclue silencieusement', () => {
    const positions: PositionForRanking[] = [
      { id: 'P_ok', label: 'OK',   assetClass: 'etf',
        marketValueEur: 12_000, costBasisEur: 10_000 },
      { id: 'P_no', label: 'NoCB', assetClass: 'etf',
        marketValueEur: 5_000,  costBasisEur: 0 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche!.best[0]!.label).toBe('OK')
    expect(out.marche!.worst).toEqual([])
  })

  it('MV null → position exclue silencieusement', () => {
    const positions: PositionForRanking[] = [
      { id: 'P', label: 'X', assetClass: 'etf', marketValueEur: null, costBasisEur: 1000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche).toBeUndefined()
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
    expect(out.immobilier!.worst).toEqual([])
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

describe('buildInvestmentRankings — règle « 1 position → best only »', () => {
  it('bucket à 1 candidat → best rempli, worst vide', () => {
    const positions: PositionForRanking[] = [
      { id: 'P', label: 'Solo', assetClass: 'etf',
        marketValueEur: 12_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche!.best).toHaveLength(1)
    expect(out.marche!.worst).toHaveLength(0)
  })

  it('bucket à 2 candidats → best ≠ worst', () => {
    const positions: PositionForRanking[] = [
      { id: 'A', label: 'A', assetClass: 'etf', marketValueEur: 11_000, costBasisEur: 10_000 },
      { id: 'B', label: 'B', assetClass: 'etf', marketValueEur:  9_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche!.best[0]!.id).toBe('A')
    expect(out.marche!.worst[0]!.id).toBe('B')
  })
})

describe('buildInvestmentRankings — pas de mélange marché / immobilier', () => {
  it('un PEA très gagnant ne contamine pas immobilier', () => {
    const positions: PositionForRanking[] = [
      { id: 'P', label: 'PEA gagnant', envelopeLabel: 'PEA', assetClass: 'etf',
        marketValueEur: 50_000, costBasisEur: 10_000 },
    ]
    const out = buildInvestmentRankings({ ...emptyInput(), positions })
    expect(out.marche).toBeDefined()
    expect(out.immobilier).toBeUndefined()
  })
})
