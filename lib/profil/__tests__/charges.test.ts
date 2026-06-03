/**
 * Tests `computeChargesMensuelles` (Cash V1.1-PATCH).
 *
 * Vérifie la somme des 4 sous-postes de charges du wizard Profil et la
 * robustesse face aux entrées partielles (null / undefined / strings
 * Supabase NUMERIC / NaN / négatifs).
 */
import { describe, it, expect } from 'vitest'
import { computeChargesMensuelles } from '../charges'

describe('computeChargesMensuelles — cas nominaux', () => {
  it('4 sous-postes renseignés → somme exacte', () => {
    // Cas Aymeric : loyer 375 + crédits 0 + charges 500 + dépenses 800 = 1 675
    const r = computeChargesMensuelles({
      loyer:              375,
      autres_credits:     0,
      charges_fixes:      500,
      depenses_courantes: 800,
    })
    expect(r).toBe(1_675)
  })

  it('un seul sous-poste (loyer uniquement) → renvoie ce sous-poste', () => {
    const r = computeChargesMensuelles({
      loyer:              1_200,
      autres_credits:     null,
      charges_fixes:      null,
      depenses_courantes: null,
    })
    expect(r).toBe(1_200)
  })

  it('quelques null + quelques valeurs → somme des non-null', () => {
    const r = computeChargesMensuelles({
      loyer:              null,
      autres_credits:     300,
      charges_fixes:      null,
      depenses_courantes: 700,
    })
    expect(r).toBe(1_000)
  })
})

describe('computeChargesMensuelles — robustesse', () => {
  it('tous null → 0', () => {
    const r = computeChargesMensuelles({
      loyer:              null,
      autres_credits:     null,
      charges_fixes:      null,
      depenses_courantes: null,
    })
    expect(r).toBe(0)
  })

  it('tous undefined → 0', () => {
    const r = computeChargesMensuelles({
      loyer:              undefined,
      autres_credits:     undefined,
      charges_fixes:      undefined,
      depenses_courantes: undefined,
    })
    expect(r).toBe(0)
  })

  it('tous à 0 (utilisateur ayant explicitement saisi 0) → 0', () => {
    const r = computeChargesMensuelles({
      loyer:              0,
      autres_credits:     0,
      charges_fixes:      0,
      depenses_courantes: 0,
    })
    expect(r).toBe(0)
  })

  it('valeurs string (Supabase NUMERIC sérialisé) → parsées', () => {
    const r = computeChargesMensuelles({
      loyer:              '375',
      autres_credits:     '0',
      charges_fixes:      '500.50',
      depenses_courantes: '800',
    })
    expect(r).toBe(1_675.5)
  })

  it('valeurs NaN / négatives → ignorées (= 0)', () => {
    const r = computeChargesMensuelles({
      loyer:              500,
      autres_credits:     Number.NaN,
      charges_fixes:      -100,
      depenses_courantes: 'bidon',
    })
    expect(r).toBe(500)
  })

  it('mix string + number → somme correcte', () => {
    const r = computeChargesMensuelles({
      loyer:              '500',
      autres_credits:     200,
      charges_fixes:      null,
      depenses_courantes: 300,
    })
    expect(r).toBe(1_000)
  })
})
