/**
 * Tests du helper `intents` — V1.2 cash volontaire.
 *
 * Couvre les fonctions pures :
 *   - `getIntentsActives`     (filtrage temporel)
 *   - `computeMatelasEffectif` (clamp + somme)
 *   - `getIntentAgeInDays`    (âge depuis created_at)
 *   - `formatCreatedAgo`      (libellé humain)
 */
import { describe, it, expect } from 'vitest'
import {
  getIntentsActives,
  computeMatelasEffectif,
  getIntentAgeInDays,
  type CashIntent,
} from '../intents'
import { formatCreatedAgo, CASH_INTENT_MOTIF_LABEL } from '../intents-labels'

const NOW = new Date('2026-06-15T12:00:00Z')

function intent(over: Partial<CashIntent>): CashIntent {
  return {
    id:              'i-' + Math.random().toString(36).slice(2, 8),
    user_id:         'u-1',
    cash_account_id: null,
    montant:         1_000,
    motif:           'autre',
    motif_libre:     null,
    target_date:     null,
    created_at:      '2026-01-01T00:00:00Z',
    updated_at:      '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('getIntentsActives — filtrage temporel', () => {
  it('target_date null → active', () => {
    const a = intent({ target_date: null })
    expect(getIntentsActives([a], NOW)).toEqual([a])
  })

  it('target_date future → active', () => {
    const a = intent({ target_date: '2026-12-31' })
    expect(getIntentsActives([a], NOW)).toEqual([a])
  })

  it('target_date passée → inactive (filtrée)', () => {
    const a = intent({ target_date: '2026-01-01' })
    expect(getIntentsActives([a], NOW)).toEqual([])
  })

  it('target_date = today → active (inclusif)', () => {
    const a = intent({ target_date: '2026-06-15' })
    expect(getIntentsActives([a], NOW)).toEqual([a])
  })

  it('mix actives + expirées → ne retient que les actives, ordre préservé', () => {
    const a = intent({ id: 'a', target_date: null })
    const b = intent({ id: 'b', target_date: '2026-01-01' })   // expirée
    const c = intent({ id: 'c', target_date: '2026-09-01' })   // active future
    const d = intent({ id: 'd', target_date: '2026-06-15' })   // active limite
    const result = getIntentsActives([a, b, c, d], NOW)
    expect(result.map((i) => i.id)).toEqual(['a', 'c', 'd'])
  })

  it('target_date invalide → inactive (défensif)', () => {
    const a = intent({ target_date: 'pas-une-date' })
    expect(getIntentsActives([a], NOW)).toEqual([])
  })
})

describe('computeMatelasEffectif — clamp + somme', () => {
  it('0 intent → cashEffectif = totalCash, total = 0', () => {
    const r = computeMatelasEffectif(18_578, [], NOW)
    expect(r.totalIntentsActives).toBe(0)
    expect(r.cashEffectif).toBe(18_578)
    expect(r.countIntentsActives).toBe(0)
    expect(r.intentsActives).toEqual([])
  })

  it('1 intent active inférieure → cashEffectif = total − intent', () => {
    const a = intent({ montant: 5_000, target_date: null })
    const r = computeMatelasEffectif(18_578, [a], NOW)
    expect(r.totalIntentsActives).toBe(5_000)
    expect(r.cashEffectif).toBe(13_578)
    expect(r.countIntentsActives).toBe(1)
  })

  it('Σ intents > totalCash → cashEffectif clampé à 0 (cas patho)', () => {
    const a = intent({ montant: 10_000, target_date: null })
    const b = intent({ montant: 12_000, target_date: null })
    const r = computeMatelasEffectif(18_578, [a, b], NOW)
    expect(r.totalIntentsActives).toBe(22_000)
    expect(r.cashEffectif).toBe(0)
  })

  it('mix actives + expirées → seules les actives décompoptent', () => {
    const active   = intent({ id: 'a', montant: 5_000, target_date: null })
    const expiree  = intent({ id: 'e', montant: 8_000, target_date: '2025-01-01' })
    const r = computeMatelasEffectif(18_578, [active, expiree], NOW)
    expect(r.totalIntentsActives).toBe(5_000)
    expect(r.cashEffectif).toBe(13_578)
    expect(r.intentsActives.map((i) => i.id)).toEqual(['a'])
  })

  it('arrondi au centime sur totaux', () => {
    const a = intent({ montant: 1_234.567, target_date: null })
    const r = computeMatelasEffectif(5_000, [a], NOW)
    expect(r.totalIntentsActives).toBe(1_234.57)
    expect(r.cashEffectif).toBe(3_765.43)
  })

  it('cas Aymeric P5 : cash 18 578 € + intent apport_immo 5 000 € → effectif 13 578 €', () => {
    const a = intent({
      montant:     5_000,
      motif:       'apport_immo',
      motif_libre: 'Apport Saint-Brieuc Q4',
      target_date: '2026-12-31',
    })
    const r = computeMatelasEffectif(18_578, [a], NOW)
    expect(r.cashEffectif).toBe(13_578)
    expect(r.countIntentsActives).toBe(1)
  })
})

describe('getIntentAgeInDays', () => {
  it('intent créée il y a 90 jours → 90', () => {
    const a = intent({ created_at: '2026-03-17T12:00:00Z' })
    expect(getIntentAgeInDays(a, NOW)).toBe(90)
  })

  it('intent créée à NOW → 0', () => {
    const a = intent({ created_at: NOW.toISOString() })
    expect(getIntentAgeInDays(a, NOW)).toBe(0)
  })

  it('created_at invalide → 0 (défensif)', () => {
    const a = intent({ created_at: 'pas-une-date' })
    expect(getIntentAgeInDays(a, NOW)).toBe(0)
  })
})

describe('intents-labels', () => {
  it('formatCreatedAgo : 0 jour → « aujourd\'hui »', () => {
    expect(formatCreatedAgo(0)).toBe('créée aujourd\'hui')
  })
  it('formatCreatedAgo : 1 jour → « hier »', () => {
    expect(formatCreatedAgo(1)).toBe('créée hier')
  })
  it('formatCreatedAgo : 5 jours → « il y a 5 jours »', () => {
    expect(formatCreatedAgo(5)).toBe('créée il y a 5 jours')
  })
  it('formatCreatedAgo : 90 jours → « il y a 3 mois »', () => {
    expect(formatCreatedAgo(90)).toBe('créée il y a 3 mois')
  })
  it('formatCreatedAgo : 400 jours → « il y a 1 an »', () => {
    expect(formatCreatedAgo(400)).toBe('créée il y a 1 an')
  })

  it('CASH_INTENT_MOTIF_LABEL couvre les 5 motifs', () => {
    expect(CASH_INTENT_MOTIF_LABEL.apport_immo).toBe('Apport immobilier')
    expect(CASH_INTENT_MOTIF_LABEL.achat_planifie).toBe('Achat planifié')
    expect(CASH_INTENT_MOTIF_LABEL.voyage).toBe('Voyage')
    expect(CASH_INTENT_MOTIF_LABEL.precaution_assumee).toBe('Précaution assumée')
    expect(CASH_INTENT_MOTIF_LABEL.autre).toBe('Autre')
  })
})
