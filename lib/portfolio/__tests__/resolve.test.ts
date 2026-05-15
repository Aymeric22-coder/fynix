import { describe, it, expect } from 'vitest'
import { mapFigiToAssetClass } from '../resolve'
import type { FigiMatch } from '../providers/openfigi'

function m(over: Partial<FigiMatch> = {}): FigiMatch {
  return {
    figi:          'BBG000TEST',
    name:          'Test',
    ticker:        'TST',
    exchCode:      'FP',
    compositeFIGI: null,
    securityType:  null,
    securityType2: null,
    marketSector:  null,
    ...over,
  }
}

describe('mapFigiToAssetClass', () => {
  it('detecte ETF via securityType=ETP', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'ETP', marketSector: 'Equity' }))).toBe('etf')
  })

  it('detecte ETF via securityType2 ETP', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'Common Stock', securityType2: 'ETP Index Fund' }))).toBe('etf')
  })

  it('detecte REIT', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'REIT', marketSector: 'Equity' }))).toBe('reit')
  })

  it('detecte SIIC', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'SIIC' }))).toBe('siic')
  })

  it('detecte fund (mutual fund)', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'Mutual Fund' }))).toBe('fund')
  })

  it('detecte fund (open-end / closed-end)', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'Open-End Fund' }))).toBe('fund')
    expect(mapFigiToAssetClass(m({ securityType: 'Closed-End Fund' }))).toBe('fund')
  })

  it('detecte bond via marketSector Corp', () => {
    expect(mapFigiToAssetClass(m({ marketSector: 'Corp' }))).toBe('bond')
  })

  it('detecte bond via marketSector Govt', () => {
    expect(mapFigiToAssetClass(m({ marketSector: 'Govt' }))).toBe('bond')
  })

  it('detecte crypto via ticker BTC-USD avec marketSector Curncy', () => {
    expect(mapFigiToAssetClass(m({ marketSector: 'Curncy', ticker: 'BTC-USD' }))).toBe('crypto')
  })

  it('detecte equity par defaut (Common Stock)', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'Common Stock', marketSector: 'Equity' }))).toBe('equity')
  })

  it('detecte metal via marketSector Comdty', () => {
    expect(mapFigiToAssetClass(m({ marketSector: 'Comdty' }))).toBe('metal')
  })

  it('detecte derivative (option, future, warrant)', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'Equity Option' }))).toBe('derivative')
    expect(mapFigiToAssetClass(m({ securityType: 'Index Future' }))).toBe('derivative')
  })

  it('fallback other si rien ne match', () => {
    expect(mapFigiToAssetClass(m({ securityType: 'Exotic', marketSector: 'Unknown' }))).toBe('other')
  })
})
