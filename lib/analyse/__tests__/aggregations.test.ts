import { describe, it, expect } from 'vitest'
import {
  aggregateBySector, aggregateByGeo, aggregateByAssetType,
  aggregateByCurrency, topPositions,
} from '../aggregations'
import type { EnrichedPosition } from '@/types/analyse'

function p(over: Partial<EnrichedPosition> = {}): EnrichedPosition {
  return {
    isin: 'X', name: 'X', quantity: 1, pru: 100,
    current_price: 100, current_value: 100, current_value_local: 100,
    gain_loss: 0, gain_loss_pct: 0,
    asset_type: 'stock', sector: null, country: null,
    currency: 'EUR', price_estimated: false, weight_in_portfolio: 0,
    ...over,
  }
}

describe('aggregateBySector', () => {
  it('regroupe les positions par secteur traduit en FR', () => {
    const buckets = aggregateBySector([
      p({ sector: 'Technology', current_value: 1000 }),
      p({ sector: 'Technology', current_value: 500 }),
      p({ sector: 'Healthcare', current_value: 300 }),
    ])
    expect(buckets).toHaveLength(2)
    expect(buckets[0]?.label).toBe('Technologie')
    expect(buckets[0]?.value).toBe(1500)
    expect(buckets[0]?.count).toBe(2)
    expect(buckets[0]?.pct).toBeCloseTo(83.33, 1)
    expect(buckets[1]?.label).toBe('Santé')
  })

  it('regroupe les positions sans secteur dans "Sans secteur"', () => {
    const buckets = aggregateBySector([
      p({ sector: null, current_value: 200 }),
      p({ sector: null, current_value: 100 }),
    ])
    expect(buckets[0]?.label).toBe('Sans secteur')
    expect(buckets[0]?.value).toBe(300)
  })

  it('tri par valeur descendante', () => {
    const buckets = aggregateBySector([
      p({ sector: 'Healthcare', current_value: 500 }),
      p({ sector: 'Technology', current_value: 1000 }),
      p({ sector: 'Energy',     current_value: 200 }),
    ])
    expect(buckets.map((b) => b.label)).toEqual(['Technologie', 'Santé', 'Énergie'])
  })
})

describe('aggregateByGeo', () => {
  it('mappe les pays Yahoo vers les zones FR', () => {
    const buckets = aggregateByGeo([
      p({ country: 'United States', current_value: 1000 }),
      p({ country: 'France',        current_value: 600 }),
      p({ country: 'Germany',       current_value: 400 }),
      p({ country: 'Japan',         current_value: 200 }),
    ])
    expect(buckets.find((b) => b.label === 'Amérique du Nord')?.value).toBe(1000)
    expect(buckets.find((b) => b.label === 'Europe')?.value).toBe(1000)
    expect(buckets.find((b) => b.label === 'Asie développée')?.value).toBe(200)
  })

  it('positions sans pays → "Non classé"', () => {
    const buckets = aggregateByGeo([
      p({ country: null, current_value: 100 }),
    ])
    expect(buckets[0]?.label).toBe('Non classé')
  })
})

describe('aggregateByAssetType', () => {
  it('libellés FR par type', () => {
    const buckets = aggregateByAssetType([
      p({ asset_type: 'stock',   current_value: 1000 }),
      p({ asset_type: 'etf',     current_value: 800 }),
      p({ asset_type: 'crypto',  current_value: 200 }),
      p({ asset_type: 'scpi',    current_value: 500 }),
      p({ asset_type: 'unknown', current_value: 100 }),
    ])
    expect(buckets.map((b) => b.label)).toEqual([
      'Actions', 'ETF / Fonds', 'Immobilier papier', 'Crypto', 'Non classé',
    ])
  })
})

describe('aggregateByCurrency', () => {
  it('groupe et uppercase', () => {
    const buckets = aggregateByCurrency([
      p({ currency: 'eur', current_value: 500 }),
      p({ currency: 'EUR', current_value: 300 }),
      p({ currency: 'USD', current_value: 200 }),
    ])
    expect(buckets[0]?.label).toBe('EUR')
    expect(buckets[0]?.value).toBe(800)
  })
})

describe('topPositions', () => {
  it('renvoie les N positions de plus forte valeur', () => {
    const positions = [
      p({ name: 'A', current_value: 100 }),
      p({ name: 'B', current_value: 500 }),
      p({ name: 'C', current_value: 200 }),
      p({ name: 'D', current_value: 50  }),
    ]
    const top = topPositions(positions, 2)
    expect(top.map((x) => x.name)).toEqual(['B', 'C'])
  })

  it('défaut N=10', () => {
    const positions = Array.from({ length: 15 }, (_, i) => p({ current_value: i, name: `${i}` }))
    expect(topPositions(positions)).toHaveLength(10)
  })
})

describe('cas global — portefeuille mixte', () => {
  it('totaux + pourcentages cohérents', () => {
    const positions = [
      p({ sector: 'Technology', country: 'United States', asset_type: 'stock', current_value: 4000 }),
      p({ sector: 'Healthcare', country: 'France',        asset_type: 'etf',   current_value: 3000 }),
      p({ sector: null,         country: 'Japan',         asset_type: 'crypto', current_value: 1000 }),
      p({ sector: null,         country: null,            asset_type: 'unknown', current_value: 2000 }),
    ]
    const total = positions.reduce((s, p) => s + p.current_value, 0)
    expect(total).toBe(10000)

    const bySector = aggregateBySector(positions)
    const sumPctSector = bySector.reduce((s, b) => s + b.pct, 0)
    expect(sumPctSector).toBeCloseTo(100, 1)

    const byGeo = aggregateByGeo(positions)
    const sumPctGeo = byGeo.reduce((s, b) => s + b.pct, 0)
    expect(sumPctGeo).toBeCloseTo(100, 1)
  })
})
