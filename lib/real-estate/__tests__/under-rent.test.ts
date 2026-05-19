import { describe, it, expect } from 'vitest'
import { detectUnderRentAlerts } from '../under-rent'

describe('detectUnderRentAlerts', () => {
  it('ignore les lots sans market_rent', () => {
    const alerts = detectUnderRentAlerts([
      { id: 'a', name: 'A', rent_amount: 600, market_rent: null },
    ])
    expect(alerts).toEqual([])
  })

  it('ignore les lots sans rent_amount', () => {
    const alerts = detectUnderRentAlerts([
      { id: 'a', name: 'A', rent_amount: null, market_rent: 800 },
    ])
    expect(alerts).toEqual([])
  })

  it('ignore les lots correctement loues (rent >= market)', () => {
    const alerts = detectUnderRentAlerts([
      { id: 'a', name: 'A', rent_amount: 800, market_rent: 750 },
      { id: 'b', name: 'B', rent_amount: 700, market_rent: 700 },
    ])
    expect(alerts).toEqual([])
  })

  it('lot sous-loué severity = high quand delta > 15 %', () => {
    const alerts = detectUnderRentAlerts([
      { id: '1', name: 'T2 rez', rent_amount: 620, market_rent: 750 },
    ])
    expect(alerts).toHaveLength(1)
    const a = alerts[0]!
    expect(a.deltaEur).toBeCloseTo(130, 2)
    expect(a.deltaPct).toBeCloseTo(17.33, 1)
    expect(a.annualLoss).toBeCloseTo(1_560, 2)
    expect(a.severity).toBe('high')
  })

  it('severity medium si delta entre 5 et 15 %', () => {
    const alerts = detectUnderRentAlerts([
      { id: '1', name: 'T3', rent_amount: 900, market_rent: 1000 },
    ])
    expect(alerts[0]!.severity).toBe('medium')
  })

  it('severity low si delta < 5 %', () => {
    const alerts = detectUnderRentAlerts([
      { id: '1', name: 'T3', rent_amount: 970, market_rent: 1000 },
    ])
    expect(alerts[0]!.severity).toBe('low')
  })

  it('trie par manque a gagner annuel decroissant', () => {
    const alerts = detectUnderRentAlerts([
      { id: 'small', name: 'Petit', rent_amount: 480, market_rent: 500 },
      { id: 'big',   name: 'Gros',  rent_amount: 600, market_rent: 750 },
    ])
    expect(alerts[0]!.lotId).toBe('big')
    expect(alerts[1]!.lotId).toBe('small')
  })
})
