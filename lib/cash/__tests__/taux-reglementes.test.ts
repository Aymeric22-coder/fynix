/**
 * Tests `lib/cash/taux-reglementes.ts` (V1.4 Vol E).
 *
 * Vérifie :
 *   - `getTauxReglemente` retourne le bon objet pour chaque type connu
 *   - Type inconnu / null / vide → undefined
 *   - Cohérence des dates (toutes en YYYY-MM-DD)
 *   - DEFAULT_RATES (compat) reflète bien TAUX_REGLEMENTES
 */
import { describe, it, expect } from 'vitest'
import {
  TAUX_REGLEMENTES,
  DEFAULT_RATES,
  getTauxReglemente,
} from '../taux-reglementes'

describe('getTauxReglemente', () => {
  it('livret_a → objet conforme (Banque de France)', () => {
    const t = getTauxReglemente('livret_a')
    expect(t).toBeDefined()
    expect(t?.tauxPercent).toBe(1.5)
    expect(t?.source).toBe('Banque de France')
    expect(t?.dateEffet).toBe('2026-02-01')
  })

  it('ldds → identique au Livret A', () => {
    expect(getTauxReglemente('ldds')?.tauxPercent).toBe(1.5)
  })

  it('lep → 2,5 %', () => {
    expect(getTauxReglemente('lep')?.tauxPercent).toBe(2.5)
  })

  it('cel → 1,0 % (2/3 du LA)', () => {
    const t = getTauxReglemente('cel')
    expect(t?.tauxPercent).toBe(1.0)
    expect(t?.note).toMatch(/2\/3/)
  })

  it('livret_jeune → 1,5 % (minimum réglementaire)', () => {
    const t = getTauxReglemente('livret_jeune')
    expect(t?.tauxPercent).toBe(1.5)
    expect(t?.note).toMatch(/Minimum/i)
  })

  it('pel → 2,0 % (plans ouverts depuis 2026-01-01)', () => {
    const t = getTauxReglemente('pel')
    expect(t?.tauxPercent).toBe(2.0)
    expect(t?.dateEffet).toBe('2026-01-01')
  })

  it('compte_courant → undefined (pas de taux légal)', () => {
    expect(getTauxReglemente('compte_courant')).toBeUndefined()
  })

  it('autre → undefined', () => {
    expect(getTauxReglemente('other')).toBeUndefined()
    expect(getTauxReglemente('inconnu')).toBeUndefined()
    expect(getTauxReglemente(null)).toBeUndefined()
    expect(getTauxReglemente(undefined)).toBeUndefined()
    expect(getTauxReglemente('')).toBeUndefined()
  })
})

describe('cohérence des dates', () => {
  it('toutes les dates au format YYYY-MM-DD', () => {
    for (const t of TAUX_REGLEMENTES) {
      expect(t.dateEffet).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('aucun taux négatif', () => {
    for (const t of TAUX_REGLEMENTES) {
      expect(t.tauxPercent).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_RATES — rétro-compat add-cash-form', () => {
  it('expose les 6 types comme map type → taux', () => {
    expect(DEFAULT_RATES.livret_a).toBe(1.5)
    expect(DEFAULT_RATES.ldds).toBe(1.5)
    expect(DEFAULT_RATES.lep).toBe(2.5)
    expect(DEFAULT_RATES.cel).toBe(1.0)
    expect(DEFAULT_RATES.livret_jeune).toBe(1.5)
    expect(DEFAULT_RATES.pel).toBe(2.0)
  })

  it('pas de clé pour compte_courant', () => {
    expect((DEFAULT_RATES as Record<string, number>).compte_courant).toBeUndefined()
  })
})
