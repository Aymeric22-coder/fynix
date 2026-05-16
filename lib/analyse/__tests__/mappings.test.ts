import { describe, it, expect } from 'vitest'
import { translateSector, ALL_SECTORS_FR, SECTOR_MAP } from '../sectorMapping'
import { geoZone, toIsoCode, ALL_ZONES } from '../geoMapping'

describe('translateSector', () => {
  it('traduit les secteurs Yahoo connus en FR', () => {
    expect(translateSector('Technology')).toBe('Technologie')
    expect(translateSector('Healthcare')).toBe('Santé')
    expect(translateSector('Financial Services')).toBe('Finance')
    expect(translateSector('Real Estate')).toBe('Immobilier')
  })

  it('renvoie le brut si secteur non mappé', () => {
    expect(translateSector('UnknownSector')).toBe('UnknownSector')
  })

  it('renvoie null pour null/undefined/empty', () => {
    expect(translateSector(null)).toBeNull()
    expect(translateSector(undefined)).toBeNull()
    expect(translateSector('')).toBeNull()
  })

  it('expose la liste FR complète', () => {
    expect(ALL_SECTORS_FR).toContain('Technologie')
    expect(ALL_SECTORS_FR).toContain('Énergie')
    expect(ALL_SECTORS_FR.length).toBe(Object.keys(SECTOR_MAP).length)
  })
})

describe('toIsoCode', () => {
  it('mappe les libellés Yahoo courants', () => {
    expect(toIsoCode('United States')).toBe('US')
    expect(toIsoCode('France')).toBe('FR')
    expect(toIsoCode('United Kingdom')).toBe('GB')
    expect(toIsoCode('Japan')).toBe('JP')
  })

  it('passe-plat pour codes ISO déjà fournis', () => {
    expect(toIsoCode('US')).toBe('US')
    expect(toIsoCode('FR')).toBe('FR')
  })

  it('null pour entrée inconnue ou vide', () => {
    expect(toIsoCode('Atlantis')).toBeNull()
    expect(toIsoCode(null)).toBeNull()
    expect(toIsoCode('')).toBeNull()
  })
})

describe('geoZone', () => {
  it('Amérique du Nord', () => {
    expect(geoZone('United States')).toBe('Amérique du Nord')
    expect(geoZone('Canada')).toBe('Amérique du Nord')
    expect(geoZone('CA')).toBe('Amérique du Nord')
  })

  it('Europe', () => {
    expect(geoZone('France')).toBe('Europe')
    expect(geoZone('Germany')).toBe('Europe')
    expect(geoZone('Switzerland')).toBe('Europe')
    expect(geoZone('Norway')).toBe('Europe')
  })

  it('Asie développée', () => {
    expect(geoZone('Japan')).toBe('Asie développée')
    expect(geoZone('Australia')).toBe('Asie développée')
    expect(geoZone('Hong Kong')).toBe('Asie développée')
  })

  it('Asie émergente', () => {
    expect(geoZone('China')).toBe('Asie émergente')
    expect(geoZone('India')).toBe('Asie émergente')
    expect(geoZone('Vietnam')).toBe('Asie émergente')
  })

  it('Amérique latine', () => {
    expect(geoZone('Brazil')).toBe('Amérique latine')
    expect(geoZone('Mexico')).toBe('Amérique latine')
  })

  it('Autres pour pays inconnu / null', () => {
    expect(geoZone('Atlantis')).toBe('Autres')
    expect(geoZone(null)).toBe('Autres')
    expect(geoZone(undefined)).toBe('Autres')
    // ZA est désormais mappé en 'Afrique' depuis Phase 4 — on teste une zone vraiment inconnue.
    expect(geoZone('ZZ')).toBe('Autres')
  })

  it('expose toutes les zones', () => {
    // 9 zones : Am. du Nord, Europe, Europe ém, Asie dev, Asie ém,
    // Am. latine, Moyen-Orient, Afrique, Autres. (Global retiré phase 6 :
    // crypto/métaux ne contribuent plus à la géo.)
    expect(ALL_ZONES).toHaveLength(9)
    expect(ALL_ZONES).toContain('Europe')
    expect(ALL_ZONES).toContain('Moyen-Orient')
    expect(ALL_ZONES).toContain('Afrique')
    expect(ALL_ZONES).toContain('Autres')
  })
})
