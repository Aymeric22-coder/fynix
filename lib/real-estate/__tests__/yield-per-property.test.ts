/**
 * Tests du rendement annualisé par bien immobilier (V2.4 P0.7 ST2).
 *
 * Vérifie :
 *   - Mapping 1 bien = 1 ligne
 *   - Filtre minHoldingDays (défaut 90 j)
 *   - Exclusion silencieuse si acquisitionDate manquante / NaN
 *   - Conservation du flag incompleteData
 *   - extrapole = false par construction
 */
import { describe, it, expect } from 'vitest'
import {
  computeYieldPerProperty,
  type PropertyForYield,
  type PropertyYieldResult,
} from '../yield-per-property'

const ASOF = new Date('2026-06-02')

function find(rs: PropertyYieldResult[], id: string): PropertyYieldResult | undefined {
  return rs.find((r) => r.propertyId === id)
}

describe('computeYieldPerProperty — mapping', () => {
  it('1 bien valide = 1 ligne avec netNetYield + holdingDays', () => {
    const properties: PropertyForYield[] = [
      {
        propertyId:     'p1',
        propertyLabel:  'T2 Lyon',
        netNetYieldPct: 4.2,
        acquisitionDate: '2024-06-01',  // ~2 ans
        incompleteData: false,
      },
    ]
    const rs = computeYieldPerProperty({ properties, asOfDate: ASOF })
    expect(rs).toHaveLength(1)
    expect(rs[0]!.netNetYieldPct).toBe(4.2)
    expect(rs[0]!.propertyLabel).toBe('T2 Lyon')
    expect(rs[0]!.holdingDays).toBeGreaterThan(700)
    expect(rs[0]!.extrapole).toBe(false)
    expect(rs[0]!.incompleteData).toBe(false)
  })

  it('propage le flag incompleteData', () => {
    const properties: PropertyForYield[] = [
      {
        propertyId: 'p1', propertyLabel: 'X',
        netNetYieldPct: 3.0, acquisitionDate: '2024-06-01',
        incompleteData: true,
      },
    ]
    const rs = computeYieldPerProperty({ properties, asOfDate: ASOF })
    expect(rs[0]!.incompleteData).toBe(true)
  })
})

describe('computeYieldPerProperty — filtre minHoldingDays', () => {
  it('exclut un bien acquis il y a < 90 j', () => {
    const properties: PropertyForYield[] = [
      {
        propertyId: 'fresh', propertyLabel: 'Fresh',
        netNetYieldPct: 5.0,
        acquisitionDate: '2026-05-03',  // ~30 j
        incompleteData: false,
      },
      {
        propertyId: 'old', propertyLabel: 'Old',
        netNetYieldPct: 4.0,
        acquisitionDate: '2024-06-01',  // ~2 ans
        incompleteData: false,
      },
    ]
    const rs = computeYieldPerProperty({ properties, asOfDate: ASOF })
    expect(find(rs, 'fresh')).toBeUndefined()
    expect(find(rs, 'old')).toBeDefined()
  })

  it('seuil paramétrable via minHoldingDays', () => {
    const properties: PropertyForYield[] = [
      {
        propertyId: 'p', propertyLabel: 'P',
        netNetYieldPct: 4.0,
        acquisitionDate: '2025-12-01',  // ~6 mois
        incompleteData: false,
      },
    ]
    expect(computeYieldPerProperty({ properties, asOfDate: ASOF, minHoldingDays: 200 })).toHaveLength(0)
    expect(computeYieldPerProperty({ properties, asOfDate: ASOF, minHoldingDays: 90  })).toHaveLength(1)
  })
})

describe('computeYieldPerProperty — robustesse', () => {
  it('exclut un bien sans acquisitionDate', () => {
    const properties: PropertyForYield[] = [
      {
        propertyId: 'p', propertyLabel: 'P',
        netNetYieldPct: 4.0, acquisitionDate: null,
        incompleteData: false,
      },
    ]
    expect(computeYieldPerProperty({ properties, asOfDate: ASOF })).toHaveLength(0)
  })

  it('exclut un bien dont netNetYield n\'est pas un nombre fini', () => {
    const properties: PropertyForYield[] = [
      {
        propertyId: 'p', propertyLabel: 'P',
        netNetYieldPct: Number.NaN, acquisitionDate: '2024-06-01',
        incompleteData: false,
      },
    ]
    expect(computeYieldPerProperty({ properties, asOfDate: ASOF })).toHaveLength(0)
  })
})
