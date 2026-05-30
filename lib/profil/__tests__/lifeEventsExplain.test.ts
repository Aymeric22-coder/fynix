/**
 * CS5 — Tests des helpers explainers.
 *
 * Vérifie :
 *   - hasActiveLifeEvents
 *   - summarizeEventShort / Medium
 *   - buildLifeEventAriaLabel (Hero /analyse)
 *   - buildLifeEventEmailLabel (rapport mensuel)
 *   - buildLifeEventBreakdown (modal détail)
 *   - Single source of truth des labels : import LIFE_EVENT_LABELS,
 *     pas de string magique.
 */
import { describe, it, expect } from 'vitest'
import {
  hasActiveLifeEvents,
  summarizeEventShort,
  summarizeEventMedium,
  buildLifeEventAriaLabel,
  buildLifeEventEmailLabel,
  buildLifeEventBreakdown,
} from '../lifeEventsExplain'
import { LIFE_EVENT_LABELS, LIFE_EVENT_EMOJI } from '../lifeEventsConstants'
import type { LifeEventRow } from '@/types/database.types'

function evt(p: Partial<LifeEventRow> & Pick<LifeEventRow, 'type' | 'occurrence_date'>): LifeEventRow {
  return {
    id: 'x', user_id: 'u', is_active: true, montant: null, label: null,
    meta: {}, created_at: '', updated_at: '', ...p,
  } as LifeEventRow
}

describe('CS5 explainers — guard conditions', () => {
  it('aucun event actif → hasActiveLifeEvents=false', () => {
    expect(hasActiveLifeEvents([])).toBe(false)
    expect(hasActiveLifeEvents([
      evt({ type: 'retraite', occurrence_date: '2031-01-01', is_active: false }),
    ])).toBe(false)
  })
  it('au moins 1 actif → true', () => {
    expect(hasActiveLifeEvents([
      evt({ type: 'retraite', occurrence_date: '2031-01-01' }),
    ])).toBe(true)
  })
})

describe('CS5 explainers — summarizeEvent', () => {
  it('héritage avec montant → "💰 Héritage en 2031 (+80 k€)"', () => {
    const e = evt({
      type: 'capital_exceptionnel', occurrence_date: '2031-06-01',
      montant: 80_000, label: 'Héritage',
    })
    expect(summarizeEventMedium(e)).toBe('💰 Héritage en 2031 (+80 k€)')
  })
  it('retraite avec pension → "🏖 Retraite en 2031 (pension 2000 €/m)"', () => {
    const e = evt({
      type: 'retraite', occurrence_date: '2031-01-01', montant: 2000,
    })
    expect(summarizeEventMedium(e)).toBe('🏖 Retraite en 2031 (pension 2000 €/m)')
  })
  it('achat RP → "🏠 RP future en 2029"', () => {
    const e = evt({ type: 'achat_rp', occurrence_date: '2029-04-01' })
    expect(summarizeEventShort(e)).toBe('🏠 RP future')
    expect(summarizeEventMedium(e)).toBe('🏠 RP future en 2029')
  })
})

describe('CS5 explainers — Hero aria + email', () => {
  it('aria label combine plusieurs events', () => {
    const aria = buildLifeEventAriaLabel([
      evt({ type: 'retraite', occurrence_date: '2031-01-01', montant: 2000 }),
      evt({ type: 'capital_exceptionnel', occurrence_date: '2034-01-01', montant: 80_000, label: 'Héritage' }),
    ])
    expect(aria).toContain('tient compte de')
    expect(aria).toContain('Retraite en 2031')
    expect(aria).toContain('Héritage en 2034')
  })
  it('email label sans emoji', () => {
    const email = buildLifeEventEmailLabel([
      evt({ type: 'retraite', occurrence_date: '2031-01-01' }),
      evt({ type: 'capital_exceptionnel', occurrence_date: '2034-01-01', montant: 80_000, label: 'Héritage' }),
    ])
    expect(email).toBe('Projection ajustée pour : retraite 2031, héritage 2034 (+80 k€).')
    // Aucun emoji dans la version email
    expect(email).not.toContain('💰')
    expect(email).not.toContain('🏖')
  })
})

describe('CS5 explainers — breakdown détail', () => {
  it('rend une ligne par event actif (ignore inactifs)', () => {
    const list = buildLifeEventBreakdown([
      evt({ type: 'retraite', occurrence_date: '2031-01-01' }),
      evt({ type: 'naissance', occurrence_date: '2028-03-01', is_active: false }),
      evt({ type: 'capital_exceptionnel', occurrence_date: '2034-01-01', montant: 50_000, label: 'Vente entreprise' }),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]!.year).toBe(2031)
    expect(list[1]!.label).toBe('Vente entreprise')
  })
})

describe('CS5 explainers — single source of truth', () => {
  it('labels et emoji proviennent de LIFE_EVENT_LABELS/EMOJI (pas de string magique)', () => {
    // Si quelqu'un casse la constante, ce test casse — c'est le but.
    expect(LIFE_EVENT_LABELS.retraite).toBe('Retraite')
    expect(LIFE_EVENT_EMOJI.retraite).toBe('🏖')
    const out = summarizeEventShort(evt({ type: 'retraite', occurrence_date: '2031-01-01' }))
    expect(out).toBe(`${LIFE_EVENT_EMOJI.retraite} ${LIFE_EVENT_LABELS.retraite}`)
  })
})
