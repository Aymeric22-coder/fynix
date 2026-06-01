/**
 * Tests de la taxonomie unifiée des classes d'actifs (V1.2 P0.6).
 */
import { describe, it, expect } from 'vitest'
import {
  ASSET_TAXONOMY,
  TAXONOMY_LABELS,
  TAXONOMY_COLORS,
  mapToTaxonomy,
} from '../asset-taxonomy'

describe('ASSET_TAXONOMY', () => {
  it('contient exactement 9 classes canoniques', () => {
    expect(ASSET_TAXONOMY).toHaveLength(9)
  })

  it('chaque clé a un label en français', () => {
    for (const key of ASSET_TAXONOMY) {
      expect(TAXONOMY_LABELS[key]).toBeTruthy()
      expect(TAXONOMY_LABELS[key]).toMatch(/^[A-ZÀ-Ÿ]/)
    }
  })

  it('chaque clé a une couleur hex valide', () => {
    for (const key of ASSET_TAXONOMY) {
      expect(TAXONOMY_COLORS[key]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('Immobilier conserve l\'or (#E8B84B) — accent réservé immo (cf. CLAUDE.md)', () => {
    expect(TAXONOMY_COLORS.immobilier_physique).toBe('#E8B84B')
  })
})

describe('mapToTaxonomy — asset_type', () => {
  it('real_estate → immobilier_physique', () => {
    expect(mapToTaxonomy({ source: 'asset_type', key: 'real_estate' })).toBe('immobilier_physique')
  })

  it('cash → cash', () => {
    expect(mapToTaxonomy({ source: 'asset_type', key: 'cash' })).toBe('cash')
  })

  it('other → autres (proxy SCI / holding en attendant P2.2)', () => {
    expect(mapToTaxonomy({ source: 'asset_type', key: 'other' })).toBe('autres')
  })

  it('valeur inconnue → autres (fallback)', () => {
    expect(mapToTaxonomy({ source: 'asset_type', key: 'inexistant' })).toBe('autres')
  })

  it('insensible à la casse', () => {
    expect(mapToTaxonomy({ source: 'asset_type', key: 'REAL_ESTATE' })).toBe('immobilier_physique')
  })
})

describe('mapToTaxonomy — asset_class', () => {
  it('etf → etf', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'etf' })).toBe('etf')
  })

  it('actions → actions (et action singulier)', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'actions' })).toBe('actions')
    expect(mapToTaxonomy({ source: 'asset_class', key: 'action' })).toBe('actions')
  })

  it('fonds_euros → obligations (cf. ambiguïté documentée)', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'fonds_euros' })).toBe('obligations')
  })

  it('scpi → scpi', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'scpi' })).toBe('scpi')
  })

  it('crypto → crypto', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'crypto' })).toBe('crypto')
  })

  it('or / metaux / gold → or_metaux', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'or' })).toBe('or_metaux')
    expect(mapToTaxonomy({ source: 'asset_class', key: 'metaux' })).toBe('or_metaux')
    expect(mapToTaxonomy({ source: 'asset_class', key: 'gold' })).toBe('or_metaux')
  })

  it('classe inconnue → autres (fallback)', () => {
    expect(mapToTaxonomy({ source: 'asset_class', key: 'truc_bizarre' })).toBe('autres')
  })
})
