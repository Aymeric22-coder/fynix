import { describe, it, expect } from 'vitest'
import { expandPositions, bucketsBySector, bucketsByZone } from '../expandETF'
import type { EnrichedPosition, BienImmo, AnalyseAssetType } from '@/types/analyse'

function pos(over: Partial<EnrichedPosition> = {}): EnrichedPosition {
  return {
    isin: 'X', name: 'X', quantity: 1, pru: 100,
    current_price: 100, current_value: 100, current_value_local: 100,
    gain_loss: 0, gain_loss_pct: 0,
    asset_type: 'stock' as AnalyseAssetType, sector: null, country: null,
    currency: 'EUR', price_estimated: false, weight_in_portfolio: 0,
    ...over,
  }
}

describe('expandPositions — ETF référencé', () => {
  it('iShares MSCI World 10 000 € → ~6900 € USA, ~2300 € Tech', () => {
    const r = expandPositions([
      pos({ isin: 'IE00B4L5Y983', asset_type: 'etf', name: 'MSCI World', current_value: 10000 }),
    ])
    expect(r.identifiedValue).toBe(10000)
    expect(r.unmappedEtfs).toHaveLength(0)

    const tech = r.sectorExposures.find((e) => e.secteur === 'Technologie')
    expect(tech?.value).toBeCloseTo(2300, 0)

    const usa = r.geoExposures.find((e) => e.zone === 'Amérique du Nord')
    expect(usa?.value).toBeCloseTo(6900, 0)
  })

  it('multi-positions ETF + stock cumulent les expositions', () => {
    const r = expandPositions([
      pos({ isin: 'IE00B5BMR087', asset_type: 'etf', name: 'S&P 500', current_value: 5000 }),
      pos({ isin: 'US0378331005', asset_type: 'stock', name: 'Apple', current_value: 2000,
            sector: 'Technology', country: 'United States' }),
    ])
    const buckets = bucketsBySector(r.sectorExposures, r.totalValue)
    const tech = buckets.find((b) => b.secteur === 'Technologie')
    // S&P500 : 5000 × 29 % = 1450  +  Apple : 2000 → 3450
    expect(tech?.value).toBeCloseTo(3450, 0)
  })
})

describe('expandPositions — ETF non référencé', () => {
  it('alimente unmappedEtfs et bucket "Non mappé"', () => {
    const r = expandPositions([
      pos({ isin: 'XX0000XXXXXX', asset_type: 'etf', name: 'Mystery ETF', current_value: 1000 }),
    ])
    expect(r.identifiedValue).toBe(0)
    expect(r.unmappedEtfs).toEqual([{ isin: 'XX0000XXXXXX', name: 'Mystery ETF', value: 1000 }])
    expect(r.sectorExposures[0]?.secteur).toBe('Non mappé')
    expect(r.geoExposures[0]?.zone).toBe('Non mappé')
  })
})

describe('expandPositions — actions individuelles', () => {
  it('action avec sector + country → expo identifiée', () => {
    const r = expandPositions([
      pos({ isin: 'FR0000131104', asset_type: 'stock', name: 'BNP', current_value: 1000,
            sector: 'Financial Services', country: 'France' }),
    ])
    expect(r.identifiedValue).toBe(1000)
    expect(r.sectorExposures[0]).toMatchObject({ secteur: 'Finance', value: 1000 })
    expect(r.geoExposures[0]).toMatchObject({ zone: 'Europe', value: 1000, pays: 'France' })
  })

  it('action sans sector exploitable → bucket Non mappé', () => {
    const r = expandPositions([
      pos({ asset_type: 'stock', sector: 'Non identifié', country: null, current_value: 500 }),
    ])
    expect(r.identifiedValue).toBe(0)
    expect(r.sectorExposures[0]?.secteur).toBe('Non mappé')
  })
})

describe('expandPositions — SCPI / immo papier', () => {
  it('classe en Immobilier + zone du pays', () => {
    const r = expandPositions([
      pos({ asset_type: 'scpi', name: 'SCPI Corum', country: 'France', current_value: 5000 }),
    ])
    expect(r.identifiedValue).toBe(5000)
    expect(r.sectorExposures[0]).toMatchObject({ secteur: 'Immobilier', value: 5000 })
    expect(r.geoExposures[0]).toMatchObject({ zone: 'Europe' })
  })
})

describe('expandPositions — biens immobiliers physiques', () => {
  it('Phase 5 : exclus de l\'expansion (classe d\'actif distincte)', () => {
    const biens: BienImmo[] = [{
      id: 'b1', nom: 'Appart Lyon', ville: 'Lyon', pays: 'France',
      type: 'Locatif', valeur: 200000, loyer_mensuel: 800,
      credit_restant: 100000, equity: 100000, rendement_brut: 4.8,
    }]
    const r = expandPositions([], biens)
    // L'immo physique ne doit PAS apparaître dans l'analyse sectorielle/géo
    expect(r.totalValue).toBe(0)
    expect(r.identifiedValue).toBe(0)
    expect(r.sectorExposures).toHaveLength(0)
    expect(r.geoExposures).toHaveLength(0)
  })
})

describe('bucketsBySector', () => {
  it('agrège, calcule pct, conserve les sources', () => {
    const r = expandPositions([
      pos({ isin: 'IE00B4L5Y983', asset_type: 'etf', name: 'MSCI World', current_value: 10000 }),
      pos({ isin: 'US0378331005', asset_type: 'stock', name: 'Apple', current_value: 5000,
            sector: 'Technology', country: 'United States' }),
    ])
    const buckets = bucketsBySector(r.sectorExposures, r.totalValue)
    const tech = buckets.find((b) => b.secteur === 'Technologie')
    expect(tech).toBeDefined()
    expect(tech!.sources).toContain('MSCI World')
    expect(tech!.sources).toContain('Apple')
    // Total ≈ 100 %
    const sum = buckets.reduce((s, b) => s + b.pct, 0)
    expect(sum).toBeCloseTo(100, 0)
  })

  it('option excludeUnmapped retire les "Non mappé"', () => {
    const r = expandPositions([
      pos({ isin: 'XX0000XXXXXX', asset_type: 'etf', name: 'Mystery', current_value: 1000 }),
      pos({ isin: 'IE00B4L5Y983', asset_type: 'etf', name: 'MSCI World', current_value: 1000 }),
    ])
    const all  = bucketsBySector(r.sectorExposures, r.totalValue)
    const onlyMapped = bucketsBySector(r.sectorExposures, r.totalValue, { excludeUnmapped: true })
    expect(all.some((b) => b.secteur === 'Non mappé')).toBe(true)
    expect(onlyMapped.some((b) => b.secteur === 'Non mappé')).toBe(false)
  })
})

describe('bucketsByZone', () => {
  it('agrège les pays par zone', () => {
    const r = expandPositions([
      pos({ asset_type: 'stock', name: 'BNP', current_value: 1000, sector: 'Financial Services', country: 'France' }),
      pos({ asset_type: 'stock', name: 'Total', current_value: 500, sector: 'Energy', country: 'France' }),
      pos({ asset_type: 'stock', name: 'AAPL', current_value: 800, sector: 'Technology', country: 'United States' }),
    ])
    const buckets = bucketsByZone(r.geoExposures, r.totalValue)
    const eur = buckets.find((b) => b.zone === 'Europe')
    expect(eur?.value).toBe(1500)
    expect(eur?.pays).toContain('France')
  })
})

describe('Cas global', () => {
  it('portefeuille 100 % bien identifié → identifiedValue == totalValue', () => {
    const r = expandPositions([
      pos({ isin: 'IE00B4L5Y983', asset_type: 'etf', name: 'MSCI World', current_value: 5000 }),
      pos({ isin: 'IE00B5BMR087', asset_type: 'etf', name: 'S&P 500', current_value: 3000 }),
    ])
    expect(r.identifiedValue).toBe(r.totalValue)
    expect(r.unmappedEtfs).toHaveLength(0)
  })

  it('mix 50 % mappé / 50 % non mappé', () => {
    const r = expandPositions([
      pos({ isin: 'IE00B4L5Y983', asset_type: 'etf', name: 'MSCI World', current_value: 1000 }),
      pos({ isin: 'XX0000XXXXXX', asset_type: 'etf', name: 'Mystery',    current_value: 1000 }),
    ])
    expect(r.identifiedValue).toBe(1000)
    expect(r.totalValue).toBe(2000)
    expect(r.unmappedEtfs).toHaveLength(1)
  })
})
