/**
 * Tests du system prompt ARIA.
 * Verifie la presence des chiffres formates et la structure des sections.
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../buildSystemPrompt'
import { buildContextFromRaw } from '../computeMetrics'
import { makePatrimoineFixture } from './fixtures'
import type { AriaRawData } from '../types'

const REF_DATE = new Date('2026-05-17T10:00:00.000Z')

function makeRaw(p = makePatrimoineFixture()): AriaRawData {
  return { patrimoine: p, snapshots: [], activites: [] }
}

describe('buildSystemPrompt — structure generale', () => {
  it('inclut les sections principales', () => {
    const ctx = buildContextFromRaw(makeRaw(), { section: 'dashboard' }, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('ROLE')
    expect(prompt).toContain('COMPORTEMENT')
    expect(prompt).toContain('CONCEPTS FIRE')
    expect(prompt).toContain('DONNEES TEMPS REEL')
    expect(prompt).toContain('[Profil]')
    expect(prompt).toContain('[Patrimoine global]')
    expect(prompt).toContain('[Portefeuille financier]')
    expect(prompt).toContain('[Immobilier]')
    expect(prompt).toContain('[Cash]')
    expect(prompt).toContain('[Trajectoire FIRE]')
    expect(prompt).toContain('[Scores')
    expect(prompt).toContain('ALERTES ACTIVES')
    expect(prompt).toContain('ACTIONS RECENTES')
    expect(prompt).toContain('SECTION UI ACTIVE')
  })

  it('mentionne le prenom de l\'utilisateur', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Aymeric')
  })

  it('expose les concepts FIRE de reference', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('25x')
    expect(prompt).toContain('SWR')
    expect(prompt).toContain('LTV')
  })
})

describe('buildSystemPrompt — donnees patrimoniales', () => {
  it('mentionne le patrimoine brut formate en euros', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    // Brut = 1900 + 150000 + 5000 = 156900 -> compact "156,9 k €"
    expect(prompt).toMatch(/Brut.*k.*€/)
  })

  it('mentionne au moins une position top 3', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Apple Inc')
  })

  it('mentionne au moins un bien immo', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('T2 Saint-Brieuc')
  })

  it('mentionne au moins un compte cash', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Livret A')
  })

  it('expose la cible FIRE en euros', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toMatch(/Cible patrimoine.*€/)
  })
})

describe('buildSystemPrompt — alertes et actions', () => {
  it('affiche les recommandations comme alertes', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Surponderation Technologie')
  })

  it('indique "aucune alerte" si pas de reco', () => {
    const patrimoine = makePatrimoineFixture({ recommandations: [] })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [] }, null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Aucune alerte active')
  })

  it('affiche les actions recentes', () => {
    const activites = [
      { id: '1', type: 'ajout_position', description: 'Ajout 5 LVMH', metadata: {}, created_at: '2026-05-15T10:00:00.000Z' },
    ]
    const ctx = buildContextFromRaw({
      patrimoine: makePatrimoineFixture(),
      snapshots:  [],
      activites,
    }, null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Ajout 5 LVMH')
  })
})

describe('buildSystemPrompt — UI', () => {
  it('reporte la section active', () => {
    const ctx = buildContextFromRaw(makeRaw(), { section: 'fire', page_url: '/analyse/fire' }, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Section : fire')
    expect(prompt).toContain('/analyse/fire')
  })

  it('gere absence d\'UI', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('Section : —')
  })
})

describe('buildSystemPrompt — robustesse', () => {
  it('ne crashe pas avec un patrimoine vide', () => {
    const patrimoine = makePatrimoineFixture({
      positions: [], biens: [], comptes: [], recommandations: [],
    })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [] }, null, REF_DATE)
    expect(() => buildSystemPrompt(ctx)).not.toThrow()
    const prompt = buildSystemPrompt(ctx)
    expect(prompt).toContain('(aucune position)')
  })

  it('ne crashe pas avec une projection FIRE nulle', () => {
    const patrimoine = makePatrimoineFixture({ projectionFIRESnapshot: null })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [] }, null, REF_DATE)
    expect(() => buildSystemPrompt(ctx)).not.toThrow()
  })
})
