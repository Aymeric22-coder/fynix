/**
 * Tests des helpers fiscaux + FIRE centralisés dans lib/analyse/constants.ts.
 *
 * En particulier : `calculerCiblePatrimoine` est la source unique appelée par
 * aggregateur, projectionFIRE et scores (I9 audit fix).
 */
import { describe, it, expect } from 'vitest'
import {
  calculerCiblePatrimoine,
  swrPctFromFireType,
  SWR_LEAN_PCT, SWR_STANDARD_PCT, SWR_FAT_PCT,
  RENDEMENT_PAR_CLASSE, rendementParClasse,
} from '../constants'

describe('calculerCiblePatrimoine (I9 — formule unifiée)', () => {
  it('Inflation 0 % + SWR 4 % → équivalent règle des 25× (× 12 × 25)', () => {
    // 3 000 €/mois × 12 = 36 000 €/an / 0,04 = 900 000 €
    expect(calculerCiblePatrimoine(3_000, 0, 0, 4)).toBe(900_000)
  })

  it('SWR 3,5 % → cible plus élevée que SWR 4 %', () => {
    const cibleStandard = calculerCiblePatrimoine(3_000, 0, 0, SWR_STANDARD_PCT)
    const cibleLean     = calculerCiblePatrimoine(3_000, 0, 0, SWR_LEAN_PCT)
    expect(cibleLean).toBeGreaterThan(cibleStandard)
  })

  it('SWR 3 % (fat) > SWR 4 % (standard)', () => {
    const cibleStandard = calculerCiblePatrimoine(3_000, 0, 0, SWR_STANDARD_PCT)
    const cibleFat      = calculerCiblePatrimoine(3_000, 0, 0, SWR_FAT_PCT)
    expect(cibleFat).toBeGreaterThan(cibleStandard)
  })

  it('Inflation 2 % sur 20 ans → cible multipliée par ~1,486', () => {
    const base    = calculerCiblePatrimoine(3_000, 0,  0, 4)
    const inflate = calculerCiblePatrimoine(3_000, 20, 2, 4)
    const ratio   = inflate / base
    expect(ratio).toBeCloseTo(Math.pow(1.02, 20), 3)
  })

  it('SWR ≤ 0 → cible 0 (évite division par zéro)', () => {
    expect(calculerCiblePatrimoine(3_000, 10, 2, 0)).toBe(0)
    expect(calculerCiblePatrimoine(3_000, 10, 2, -1)).toBe(0)
  })

  it('anneesJusquaFIRE négatif → traité comme 0', () => {
    const base    = calculerCiblePatrimoine(3_000, 0, 2, 4)
    const negatif = calculerCiblePatrimoine(3_000, -5, 2, 4)
    expect(negatif).toBe(base)
  })
})

describe('RENDEMENT_PAR_CLASSE (I10 — source unique)', () => {
  it('cash = 3 %, actions = 7 %, immo = 6 % (constantes documentées)', () => {
    expect(RENDEMENT_PAR_CLASSE.cash).toBe(0.03)
    expect(RENDEMENT_PAR_CLASSE.actions).toBe(0.07)
    expect(RENDEMENT_PAR_CLASSE.immo).toBe(0.06)
  })

  it('rendementParClasse renvoie le bon taux', () => {
    expect(rendementParClasse('cash')).toBe(0.03)
    expect(rendementParClasse('actions')).toBe(0.07)
    expect(rendementParClasse('etf')).toBe(0.07)
    expect(rendementParClasse('immo')).toBe(0.06)
    expect(rendementParClasse('crypto')).toBe(0.05)
    expect(rendementParClasse('scpi')).toBe(0.045)
  })

  it('rendementParClasse fallback = actions (7 %) sur classe inconnue', () => {
    expect(rendementParClasse('zzz_inconnu' as never)).toBe(0.07)
  })
})

describe('swrPctFromFireType', () => {
  it('lean → 3,5 %, fat → 3 %, autre → 4 %', () => {
    expect(swrPctFromFireType('lean')).toBe(SWR_LEAN_PCT)
    expect(swrPctFromFireType('fat')).toBe(SWR_FAT_PCT)
    expect(swrPctFromFireType('standard')).toBe(SWR_STANDARD_PCT)
    expect(swrPctFromFireType('coast')).toBe(SWR_STANDARD_PCT)
    expect(swrPctFromFireType(null)).toBe(SWR_STANDARD_PCT)
    expect(swrPctFromFireType(undefined)).toBe(SWR_STANDARD_PCT)
  })
})
