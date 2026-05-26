/**
 * V9.1 — Tests du lexique unifié (FRICTION-001).
 *
 * Garantit :
 *  - chaque clé connue retourne un texte non vide
 *  - variante SCI IS appliquée UNIQUEMENT sur `netNetYield`
 *  - autres régimes / autres clés : pas de suffixe parasite
 */

import { describe, it, expect } from 'vitest'
import { getLexiqueDefinition, LEXIQUE, type LexiqueKey } from '../lexique'

const ALL_KEYS: LexiqueKey[] = [
  'grossYield',
  'netYield',
  'netNetYield',
  'monthlyCashFlow',
  'latentGain',
  'remainingCapital',
  'apr',
  'deferral',
  'vacancy',
]

describe('lexique — définitions et getter contextuel', () => {
  it('toutes les clés ont une définition non vide', () => {
    for (const key of ALL_KEYS) {
      expect(LEXIQUE[key]).toBeTruthy()
      expect(LEXIQUE[key].length).toBeGreaterThan(20)
    }
  })

  it('getLexiqueDefinition sans régime = même valeur que LEXIQUE[key]', () => {
    for (const key of ALL_KEYS) {
      expect(getLexiqueDefinition(key)).toBe(LEXIQUE[key])
      expect(getLexiqueDefinition(key, null)).toBe(LEXIQUE[key])
      expect(getLexiqueDefinition(key, undefined)).toBe(LEXIQUE[key])
    }
  })

  it("SCI IS : suffixe ajouté UNIQUEMENT sur netNetYield", () => {
    const netNetSciIs = getLexiqueDefinition('netNetYield', 'sci_is')
    expect(netNetSciIs).toContain(LEXIQUE.netNetYield)
    expect(netNetSciIs).toContain('IS')
    expect(netNetSciIs).toContain('distribution')
    expect(netNetSciIs.length).toBeGreaterThan(LEXIQUE.netNetYield.length)
  })

  it('SCI IS : aucune autre clé ne reçoit le suffixe', () => {
    const otherKeys = ALL_KEYS.filter(k => k !== 'netNetYield')
    for (const key of otherKeys) {
      expect(getLexiqueDefinition(key, 'sci_is')).toBe(LEXIQUE[key])
    }
  })

  it('régimes non SCI IS sur netNetYield : pas de suffixe', () => {
    const regimes = ['lmnp_reel', 'lmnp_micro', 'lmp', 'foncier_nu', 'foncier_micro', 'sci_ir']
    for (const regime of regimes) {
      expect(getLexiqueDefinition('netNetYield', regime)).toBe(LEXIQUE.netNetYield)
    }
  })

  it('définition net-net mentionne explicitement l\'absence de coût crédit (cohérent V7)', () => {
    expect(LEXIQUE.netNetYield).toContain('PAS le coût du crédit')
  })

  it('définition cash-flow mensuel mentionne explicitement après impôts + crédit (cohérent V7)', () => {
    expect(LEXIQUE.monthlyCashFlow).toMatch(/après impôts/i)
    expect(LEXIQUE.monthlyCashFlow).toMatch(/crédit/i)
  })
})
