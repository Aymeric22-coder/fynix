import { describe, it, expect } from 'vitest'
import {
  PORTFOLIO_CATEGORIES, categoryForClass, isValidCategoryId,
  filterPortfolioByCategory, summarizeCategories, recomputeSummary,
} from '../categories'
import type { PortfolioResult, PositionValuation } from '../types'

// ─── Fixtures ──────────────────────────────────────────────────────────

const p = (over: Partial<PositionValuation> = {}): PositionValuation => ({
  positionId:       'p1',
  instrumentId:     'i1',
  ticker:           'TST',
  name:             'Test',
  assetClass:       'equity',
  envelopeId:       null,
  quantity:         10,
  averagePrice:     100,
  currency:         'EUR',
  currentPrice:     110,
  priceConfidence:  'high',
  priceFreshAt:     new Date().toISOString(),
  priceStale:       false,
  costBasis:        1000,
  marketValue:      1100,
  unrealizedPnL:    100,
  unrealizedPnLPct: 10,
  priceSource:      'test',
  status:           'active',
  ...over,
})

const result = (positions: PositionValuation[]): PortfolioResult => ({
  positions,
  summary: recomputeSummary(positions, 'EUR'),
})

// ─── Tests ──────────────────────────────────────────────────────────────

describe('categoryForClass', () => {
  it('mappe equity et etf vers bourse', () => {
    expect(categoryForClass('equity')).toBe('bourse')
    expect(categoryForClass('etf')).toBe('bourse')
  })

  it('mappe fund vers fonds', () => {
    expect(categoryForClass('fund')).toBe('fonds')
  })

  it('mappe scpi/reit/siic/opci vers immobilier_papier', () => {
    expect(categoryForClass('scpi')).toBe('immobilier_papier')
    expect(categoryForClass('reit')).toBe('immobilier_papier')
    expect(categoryForClass('siic')).toBe('immobilier_papier')
    expect(categoryForClass('opci')).toBe('immobilier_papier')
  })

  it('mappe crypto et defi vers crypto', () => {
    expect(categoryForClass('crypto')).toBe('crypto')
    expect(categoryForClass('defi')).toBe('crypto')
  })

  it('mappe bond et private_debt vers obligataire', () => {
    expect(categoryForClass('bond')).toBe('obligataire')
    expect(categoryForClass('private_debt')).toBe('obligataire')
  })

  it('mappe metal vers metaux', () => {
    expect(categoryForClass('metal')).toBe('metaux')
  })

  it('mappe private_equity / crowdfunding / structured / derivative / other vers alternatif', () => {
    expect(categoryForClass('private_equity')).toBe('alternatif')
    expect(categoryForClass('crowdfunding')).toBe('alternatif')
    expect(categoryForClass('structured')).toBe('alternatif')
    expect(categoryForClass('derivative')).toBe('alternatif')
    expect(categoryForClass('other')).toBe('alternatif')
  })
})

describe('isValidCategoryId', () => {
  it('valide les 8 categories connues', () => {
    expect(isValidCategoryId('global')).toBe(true)
    expect(isValidCategoryId('bourse')).toBe(true)
    expect(isValidCategoryId('immobilier_papier')).toBe(true)
  })

  it('rejette les ids inconnus', () => {
    expect(isValidCategoryId('foo')).toBe(false)
    expect(isValidCategoryId('')).toBe(false)
    expect(isValidCategoryId(null)).toBe(false)
    expect(isValidCategoryId(undefined)).toBe(false)
  })
})

describe('filterPortfolioByCategory', () => {
  const positions = [
    p({ positionId: 'p1', assetClass: 'equity',  marketValue: 1000 }),
    p({ positionId: 'p2', assetClass: 'etf',     marketValue: 2000 }),
    p({ positionId: 'p3', assetClass: 'crypto',  marketValue: 500 }),
    p({ positionId: 'p4', assetClass: 'scpi',    marketValue: 3000 }),
  ]
  const full = result(positions)

  it('global ou invalide renvoie le resultat complet', () => {
    expect(filterPortfolioByCategory(full, 'global').positions).toHaveLength(4)
    expect(filterPortfolioByCategory(full, 'invalid').positions).toHaveLength(4)
  })

  it('bourse ne garde que equity et etf', () => {
    const r = filterPortfolioByCategory(full, 'bourse')
    expect(r.positions).toHaveLength(2)
    expect(r.positions.map((p) => p.positionId).sort()).toEqual(['p1', 'p2'])
    expect(r.summary.totalMarketValue).toBe(3000)
  })

  it('crypto ne garde que les positions crypto', () => {
    const r = filterPortfolioByCategory(full, 'crypto')
    expect(r.positions).toHaveLength(1)
    expect(r.summary.totalMarketValue).toBe(500)
  })

  it('immobilier_papier ne garde que les scpi/reit/siic/opci', () => {
    const r = filterPortfolioByCategory(full, 'immobilier_papier')
    expect(r.positions).toHaveLength(1)
    expect(r.positions[0]!.positionId).toBe('p4')
  })

  it('cat vide renvoie summary zero (pas null partout)', () => {
    const r = filterPortfolioByCategory(full, 'metaux')
    expect(r.positions).toHaveLength(0)
    expect(r.summary.positionsCount).toBe(0)
    expect(r.summary.totalMarketValue).toBe(0)
    expect(r.summary.totalUnrealizedPnL).toBeNull()
  })
})

describe('recomputeSummary', () => {
  it('agrege correctement sur 2 positions valorisees', () => {
    const valuations = [
      p({ assetClass: 'equity', marketValue: 1000, costBasis: 800 }),
      p({ assetClass: 'etf',    marketValue: 500,  costBasis: 600 }),
    ]
    const s = recomputeSummary(valuations, 'EUR')
    expect(s.positionsCount).toBe(2)
    expect(s.valuedPositionsCount).toBe(2)
    expect(s.totalMarketValue).toBe(1500)
    expect(s.totalCostBasis).toBe(1400)
    expect(s.totalUnrealizedPnL).toBe(100)
  })

  it('ne compte pas les positions non valorisees dans la PnL', () => {
    const valuations = [
      p({ marketValue: 1000, costBasis: 800 }),
      p({ marketValue: null, costBasis: 500 }),  // pas de prix
    ]
    const s = recomputeSummary(valuations, 'EUR')
    expect(s.valuedPositionsCount).toBe(1)
    expect(s.totalCostBasis).toBe(1300)         // les 2 dans le cost total
    expect(s.totalCostBasisValued).toBe(800)    // seulement la valorisee
    expect(s.totalUnrealizedPnL).toBe(200)
  })

  it('produit allocationByClass triee desc', () => {
    const valuations = [
      p({ assetClass: 'equity', marketValue: 100 }),
      p({ assetClass: 'crypto', marketValue: 300 }),
      p({ assetClass: 'etf',    marketValue: 200 }),
    ]
    const s = recomputeSummary(valuations, 'EUR')
    expect(s.allocationByClass.map((a) => a.assetClass)).toEqual(['crypto', 'etf', 'equity'])
  })
})

describe('summarizeCategories', () => {
  const positions = [
    p({ assetClass: 'equity',  marketValue: 1000 }),
    p({ assetClass: 'crypto',  marketValue: 500 }),
    p({ assetClass: 'scpi',    marketValue: 3000 }),
    p({ assetClass: 'closed' as never, status: 'closed', marketValue: 9999 }),  // ignored
  ]

  it('produit un compte par categorie', () => {
    const summaries = summarizeCategories(positions)
    expect(summaries).toHaveLength(PORTFOLIO_CATEGORIES.length)
    const bourse = summaries.find((s) => s.id === 'bourse')!
    expect(bourse.positionsCount).toBe(1)
    expect(bourse.totalValue).toBe(1000)
    const crypto = summaries.find((s) => s.id === 'crypto')!
    expect(crypto.positionsCount).toBe(1)
    expect(crypto.totalValue).toBe(500)
    const immo = summaries.find((s) => s.id === 'immobilier_papier')!
    expect(immo.positionsCount).toBe(1)
    expect(immo.totalValue).toBe(3000)
  })

  it('ignore les positions closed', () => {
    const summaries = summarizeCategories(positions)
    const global = summaries.find((s) => s.id === 'global')!
    // 3 positions actives (la 4e est closed)
    expect(global.positionsCount).toBe(3)
  })
})
