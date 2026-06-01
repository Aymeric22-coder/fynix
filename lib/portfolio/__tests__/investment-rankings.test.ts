/**
 * Tests du module de classement Champions / Casseroles (V2.4 P0.7 ST4).
 *
 * Vérifie :
 *   - 4 catégories toujours présentes dans le retour (financier, crypto,
 *     immobilier, cash) même si vides
 *   - Pas de mélange inter-classes (un PEA ne peut pas finir dans crypto)
 *   - Split envelopeType : `wallet_crypto` → crypto, sinon → financier
 *   - Top N (défaut 2) sur best (desc) et worst (asc)
 *   - Tie-breaker déterministe sur `id`
 */
import { describe, it, expect } from 'vitest'
import {
  buildInvestmentRankings,
  type EnvelopeWithType,
  type InvestmentRanking,
} from '../investment-rankings'
import type { PropertyYieldResult } from '@/lib/real-estate/yield-per-property'
import type { CashRateResult } from '@/lib/cash/rate-per-account'

const env = (id: string, lbl: string, pct: number, type = 'cto'): EnvelopeWithType => ({
  envelopeId: id, envelopeLabel: lbl, twrAnnualisePct: pct, twrCumulePct: pct,
  holdingDays: 800, segmentCount: 2, extrapole: false, positionCount: 1,
  envelopeType: type,
})
const prop = (id: string, lbl: string, pct: number): PropertyYieldResult => ({
  propertyId: id, propertyLabel: lbl, netNetYieldPct: pct,
  holdingDays: 700, extrapole: false, incompleteData: false,
})
const cash = (id: string, lbl: string, pct: number): CashRateResult => ({
  accountId: id, accountLabel: lbl, interestRatePct: pct,
  holdingDays: 500, extrapole: false, balance: 1000,
})

function findCat(rs: InvestmentRanking[], c: InvestmentRanking['category']) {
  return rs.find((r) => r.category === c)!
}

describe('buildInvestmentRankings — structure', () => {
  it('retourne toujours 4 catégories dans l\'ordre attendu', () => {
    const rs = buildInvestmentRankings({ envelopes: [], properties: [], cashAccounts: [] })
    expect(rs.map((r) => r.category)).toEqual(['financier', 'crypto', 'immobilier', 'cash'])
    for (const r of rs) {
      expect(r.best).toHaveLength(0)
      expect(r.worst).toHaveLength(0)
      expect(r.totalCandidates).toBe(0)
    }
  })
})

describe('buildInvestmentRankings — séparation financier / crypto', () => {
  it('range les wallet_crypto en crypto et les autres en financier', () => {
    const envelopes: EnvelopeWithType[] = [
      env('e1', 'PEA',           +12, 'pea'),
      env('e2', 'CTO',           +8,  'cto'),
      env('e3', 'AV',            +5,  'assurance_vie'),
      env('e4', 'Ledger Nano X', +120, 'wallet_crypto'),
      env('e5', 'Binance',       -30,  'wallet_crypto'),
    ]
    const rs = buildInvestmentRankings({ envelopes, properties: [], cashAccounts: [] })
    const fin = findCat(rs, 'financier')
    const cry = findCat(rs, 'crypto')
    expect(fin.totalCandidates).toBe(3)
    expect(cry.totalCandidates).toBe(2)
    expect(fin.best.map((b) => b.label)).toEqual(['PEA', 'CTO'])
    expect(cry.best[0]!.label).toBe('Ledger Nano X')
    expect(cry.worst[0]!.label).toBe('Binance')
  })

  it('un PEA ne peut pas atterrir dans la catégorie crypto', () => {
    const envelopes: EnvelopeWithType[] = [
      env('e1', 'PEA très gagnant', +50, 'pea'),
    ]
    const rs = buildInvestmentRankings({ envelopes, properties: [], cashAccounts: [] })
    const cry = findCat(rs, 'crypto')
    expect(cry.best).toHaveLength(0)
    expect(cry.totalCandidates).toBe(0)
  })
})

describe('buildInvestmentRankings — top N + tri', () => {
  it('par défaut, top 2 best (desc) + top 2 worst (asc)', () => {
    const envelopes: EnvelopeWithType[] = [
      env('e1', 'A', +20),
      env('e2', 'B', +10),
      env('e3', 'C', +5),
      env('e4', 'D', -2),
      env('e5', 'E', -15),
    ]
    const rs = buildInvestmentRankings({ envelopes, properties: [], cashAccounts: [] })
    const fin = findCat(rs, 'financier')
    expect(fin.best.map((b) => b.label)).toEqual(['A', 'B'])
    expect(fin.worst.map((b) => b.label)).toEqual(['E', 'D'])
  })

  it('topN paramétrable', () => {
    const envelopes: EnvelopeWithType[] = Array.from({ length: 6 }, (_, i) =>
      env(`e${i}`, `Env${i}`, i),
    )
    const rs = buildInvestmentRankings({ envelopes, properties: [], cashAccounts: [], topN: 3 })
    const fin = findCat(rs, 'financier')
    expect(fin.best).toHaveLength(3)
    expect(fin.worst).toHaveLength(3)
  })

  it('tie-breaker stable sur id en cas d\'égalité de TWR', () => {
    const envelopes: EnvelopeWithType[] = [
      env('z', 'Z', 5),
      env('a', 'A', 5),
      env('m', 'M', 5),
    ]
    const rs = buildInvestmentRankings({ envelopes, properties: [], cashAccounts: [] })
    const fin = findCat(rs, 'financier')
    expect(fin.best.map((b) => b.id)).toEqual(['a', 'm'])  // tri alphabétique sur id en cas d'égalité
  })
})

describe('buildInvestmentRankings — immobilier & cash', () => {
  it('propage les biens immo et les comptes cash dans les bonnes catégories', () => {
    const properties = [
      prop('p1', 'T2 Lyon', 5.5),
      prop('p2', 'T3 Paris', 2.1),
      prop('p3', 'Studio Marseille', -1.2),
    ]
    const cashAccounts = [
      cash('c1', 'Livret A',   3.0),
      cash('c2', 'PEL',        2.5),
      cash('c3', 'CC',         0.0),
    ]
    const rs = buildInvestmentRankings({ envelopes: [], properties, cashAccounts })
    const immo = findCat(rs, 'immobilier')
    const cashRk = findCat(rs, 'cash')
    expect(immo.best.map((b) => b.label)).toEqual(['T2 Lyon', 'T3 Paris'])
    expect(immo.worst[0]!.label).toBe('Studio Marseille')
    expect(cashRk.best.map((b) => b.label)).toEqual(['Livret A', 'PEL'])
    expect(cashRk.worst[0]!.label).toBe('CC')
  })

  it('propage le flag incompleteData pour immo', () => {
    const properties: PropertyYieldResult[] = [
      { ...prop('p1', 'X', 4.0), incompleteData: true },
    ]
    const rs = buildInvestmentRankings({ envelopes: [], properties, cashAccounts: [] })
    expect(findCat(rs, 'immobilier').best[0]!.incompleteData).toBe(true)
  })
})
