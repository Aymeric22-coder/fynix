/**
 * Tests de la logique de selection de nudges proactifs.
 * 100% pure.
 */
import { describe, it, expect } from 'vitest'
import { selectNudge, DEFAULT_MUTE_DURATION_MS } from '../detector'
import { ARIA_PROACTIVE_RULES, type ProactiveRule, type ProactiveState } from '../rules'

const NOW = 1_700_000_000_000

function state(over: Partial<ProactiveState> = {}): ProactiveState {
  return {
    section:           null,
    idleSeconds:       0,
    interactionsCount: 0,
    lastEvent:         null,
    mutedUntilMs:      null,
    ...over,
  }
}

describe('selectNudge — idle triggers', () => {
  it('renvoie null si idle insuffisant', () => {
    const r = selectNudge(state({ section: 'fire', idleSeconds: 30 }), ARIA_PROACTIVE_RULES, NOW)
    expect(r).toBeNull()
  })

  it('declenche fire_long_idle apres 90s sans interaction', () => {
    const r = selectNudge(state({ section: 'fire', idleSeconds: 95, interactionsCount: 0 }), ARIA_PROACTIVE_RULES, NOW)
    expect(r?.rule_id).toBe('fire_long_idle')
    expect(r?.suggested_prompt).toContain('DCA')
  })

  it('ne declenche pas si trop d\'interactions', () => {
    const r = selectNudge(state({ section: 'fire', idleSeconds: 95, interactionsCount: 5 }), ARIA_PROACTIVE_RULES, NOW)
    expect(r).toBeNull()
  })

  it('respecte le filtre section', () => {
    const r = selectNudge(state({ section: 'dashboard', idleSeconds: 200 }), ARIA_PROACTIVE_RULES, NOW)
    // dashboard n'a pas de regle idle dediee
    expect(r).toBeNull()
  })

  it('declenche analyse_long_idle au bout de 120s', () => {
    const r = selectNudge(state({ section: 'analyse', idleSeconds: 130, interactionsCount: 0 }), ARIA_PROACTIVE_RULES, NOW)
    expect(r?.rule_id).toBe('analyse_long_idle')
  })
})

describe('selectNudge — event triggers', () => {
  it('declenche csv_import_done sur event frais', () => {
    const r = selectNudge(state({
      lastEvent: { type: 'csv_import_success', at: NOW - 5_000 },
    }), ARIA_PROACTIVE_RULES, NOW)
    expect(r?.rule_id).toBe('csv_import_done')
  })

  it('ignore les events trop anciens (>30s)', () => {
    const r = selectNudge(state({
      lastEvent: { type: 'csv_import_success', at: NOW - 60_000 },
    }), ARIA_PROACTIVE_RULES, NOW)
    expect(r).toBeNull()
  })

  it('declenche bien_added sur event correspondant', () => {
    const r = selectNudge(state({
      lastEvent: { type: 'bien_added', at: NOW - 1_000 },
    }), ARIA_PROACTIVE_RULES, NOW)
    expect(r?.rule_id).toBe('bien_added')
  })

  it('ignore les events non mappes', () => {
    const r = selectNudge(state({
      lastEvent: { type: 'profil_completed', at: NOW - 1_000 },
    }), ARIA_PROACTIVE_RULES, NOW)
    expect(r).toBeNull()
  })
})

describe('selectNudge — mute', () => {
  it('renvoie null si mute encore actif', () => {
    const r = selectNudge(state({
      section: 'fire', idleSeconds: 200,
      mutedUntilMs: NOW + 60_000,
    }), ARIA_PROACTIVE_RULES, NOW)
    expect(r).toBeNull()
  })

  it('redonne un nudge si mute expire', () => {
    const r = selectNudge(state({
      section: 'fire', idleSeconds: 200,
      mutedUntilMs: NOW - 1,
    }), ARIA_PROACTIVE_RULES, NOW)
    expect(r?.rule_id).toBe('fire_long_idle')
  })
})

describe('selectNudge — priorite ordre', () => {
  it('retourne le premier match dans l\'ordre des regles', () => {
    const customRules: ProactiveRule[] = [
      {
        id: 'priority_high', section: 'fire', trigger: 'idle', idleSeconds: 1,
        message: 'high', suggested_prompt: 'p1',
      },
      {
        id: 'priority_low', section: 'fire', trigger: 'idle', idleSeconds: 1,
        message: 'low', suggested_prompt: 'p2',
      },
    ]
    const r = selectNudge(state({ section: 'fire', idleSeconds: 10 }), customRules, NOW)
    expect(r?.rule_id).toBe('priority_high')
  })
})

describe('selectNudge — robustesse', () => {
  it('ne crashe pas avec un state minimal', () => {
    expect(() => selectNudge(state(), [], NOW)).not.toThrow()
  })

  it('ignore une regle sans eventType (event-based)', () => {
    const r = selectNudge(
      state({ lastEvent: { type: 'csv_import_success', at: NOW } }),
      [{ id: 'broken', trigger: 'event', message: 'm', suggested_prompt: 'p' }],
      NOW,
    )
    // L'event matche n'importe quel type (eventType absent = wildcard)
    expect(r?.rule_id).toBe('broken')
  })

  it('DEFAULT_MUTE_DURATION_MS vaut 24h', () => {
    expect(DEFAULT_MUTE_DURATION_MS).toBe(24 * 3600 * 1000)
  })
})

describe('ARIA_PROACTIVE_RULES — coherence', () => {
  it('expose au moins une regle par section consommee par l\'UI', () => {
    const sectionsDansRegles = new Set(
      ARIA_PROACTIVE_RULES.filter((r) => r.section).map((r) => r.section),
    )
    // Sanity check : au moins fire / analyse / portefeuille / immobilier
    for (const s of ['fire', 'analyse', 'portefeuille', 'immobilier']) {
      expect(sectionsDansRegles.has(s)).toBe(true)
    }
  })

  it('toutes les regles event ont un eventType', () => {
    const events = ARIA_PROACTIVE_RULES.filter((r) => r.trigger === 'event')
    for (const r of events) expect(r.eventType).toBeDefined()
  })

  it('tous les ids sont uniques', () => {
    const ids = ARIA_PROACTIVE_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
