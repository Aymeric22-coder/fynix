/**
 * Tests d'extractAndPersistInsights + parseInsightsResponse (pure).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock SDK
const mockCreate = vi.fn(async () => ({
  content: [{ type: 'text', text: JSON.stringify({
    insights: [
      { type: 'preoccupation', insight: 'Stresse securite', confidence: 0.8 },
      { type: 'objectif',      insight: 'FIRE 50 ans',      confidence: 0.7 },
    ],
  }) }],
}))

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mockCreate }
    constructor(_opts: unknown) { /* noop */ }
  }
  return { default: Anthropic }
})

import { extractAndPersistInsights, parseInsightsResponse } from '../insights'

// ─────────────────────────────────────────────────────────────────
// parseInsightsResponse (pure)
// ─────────────────────────────────────────────────────────────────

describe('parseInsightsResponse', () => {
  it('parse un JSON propre', () => {
    const r = parseInsightsResponse('{ "insights": [{ "type": "objectif", "insight": "ABC", "confidence": 0.5 }] }')
    expect(r).toHaveLength(1)
    expect(r[0]!.type).toBe('objectif')
  })

  it('tolere du texte avant/apres le JSON', () => {
    const r = parseInsightsResponse('Voici : { "insights": [{ "type": "preference", "insight": "ESG only", "confidence": 0.9 }] } merci')
    expect(r).toHaveLength(1)
    expect(r[0]!.insight).toBe('ESG only')
  })

  it('renvoie [] si JSON inexploitable', () => {
    expect(parseInsightsResponse('pas du json')).toEqual([])
    expect(parseInsightsResponse('')).toEqual([])
  })

  it('filtre les insights invalides (type inconnu)', () => {
    const r = parseInsightsResponse('{ "insights": [{ "type": "hack", "insight": "X", "confidence": 0.5 }] }')
    expect(r).toEqual([])
  })

  it('plafonne a 3 insights', () => {
    const five = Array.from({ length: 5 }).map((_, i) => ({
      type: 'preference', insight: `pref${i}`, confidence: 0.5,
    }))
    const r = parseInsightsResponse(JSON.stringify({ insights: five }))
    expect(r).toHaveLength(3)
  })

  it('plafonne confidence dans [0,1]', () => {
    const r = parseInsightsResponse('{ "insights": [{ "type": "objectif", "insight": "Objectif valide", "confidence": 5 }] }')
    expect(r[0]!.confidence).toBe(1)
  })

  it('clamp confidence negative a 0', () => {
    const r = parseInsightsResponse('{ "insights": [{ "type": "objectif", "insight": "Objectif valide", "confidence": -2 }] }')
    expect(r[0]!.confidence).toBe(0)
  })

  it('filtre insights trop courts (<3 chars)', () => {
    const r = parseInsightsResponse('{ "insights": [{ "type": "objectif", "insight": "X", "confidence": 0.5 }] }')
    expect(r).toEqual([])
  })

  it('utilise la default confidence si manquante', () => {
    const r = parseInsightsResponse('{ "insights": [{ "type": "objectif", "insight": "Un objectif clair" }] }')
    expect(r[0]!.confidence).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// extractAndPersistInsights
// ─────────────────────────────────────────────────────────────────

interface Insert { table: string; values: Record<string, unknown> }
interface Update { table: string; values: Record<string, unknown> }

function makeSupabase(opts: {
  messages?: Array<{ role: string; content: string }>
  existingMatch?: { id: string; confidence: number } | null
}) {
  const inserts: Insert[] = []
  const updates: Update[] = []
  const supabase = {
    from(table: string) {
      const builder = {
        select() { return builder },
        eq()     { return builder },
        ilike()  { return builder },
        order()  { return builder },
        maybeSingle: async () => ({ data: opts.existingMatch ?? null, error: null }),
        then(onFulfilled: (v: unknown) => unknown) {
          if (table === 'aria_messages') {
            return Promise.resolve({ data: opts.messages ?? [], error: null }).then(onFulfilled)
          }
          return Promise.resolve({ data: null, error: null }).then(onFulfilled)
        },
        insert(values: Record<string, unknown>) {
          inserts.push({ table, values })
          return Promise.resolve({ data: null, error: null })
        },
        update(values: Record<string, unknown>) {
          updates.push({ table, values })
          return {
            eq: async () => ({ data: null, error: null }),
            then(o: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(o) },
          }
        },
      }
      return builder
    },
  }
  return { supabase, inserts, updates }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
  // Restore le mock create par defaut (au cas ou un test precedent l'a override)
  mockCreate.mockReset()
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({
      insights: [
        { type: 'preoccupation', insight: 'Stresse securite', confidence: 0.8 },
        { type: 'objectif',      insight: 'FIRE 50 ans',      confidence: 0.7 },
      ],
    }) }],
  } as unknown as Awaited<ReturnType<typeof mockCreate>>)
})

describe('extractAndPersistInsights', () => {
  it('insere de nouveaux insights si pas de match existant', async () => {
    const { supabase, inserts } = makeSupabase({
      messages: Array.from({ length: 6 }).map((_, i) => ({ role: 'user', content: `M${i}` })),
      existingMatch: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await extractAndPersistInsights({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.persisted).toBe(true)
    expect(r.insights).toHaveLength(2)
    expect(inserts.length).toBe(2)
    expect(inserts[0]!.table).toBe('aria_user_insights')
  })

  it('met a jour un insight existant au lieu de doubloner', async () => {
    const { supabase, updates, inserts } = makeSupabase({
      messages: Array.from({ length: 6 }).map((_, i) => ({ role: 'user', content: `M${i}` })),
      existingMatch: { id: 'existing-1', confidence: 0.6 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await extractAndPersistInsights({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.persisted).toBe(true)
    expect(updates.length).toBeGreaterThan(0)
    expect(inserts.length).toBe(0)
  })

  it('skip si trop peu de messages', async () => {
    const { supabase } = makeSupabase({
      messages: [{ role: 'user', content: 'Salut' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await extractAndPersistInsights({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.persisted).toBe(false)
    expect(r.reason).toBe('too_short')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('skip si pas d\'API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { supabase } = makeSupabase({ messages: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await extractAndPersistInsights({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.persisted).toBe(false)
    expect(r.reason).toBe('no_api_key')
  })

  it('renvoie no_insights_detected si JSON vide', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{ "insights": [] }' }],
    } as unknown as Awaited<ReturnType<typeof mockCreate>>)
    const { supabase } = makeSupabase({
      messages: Array.from({ length: 6 }).map(() => ({ role: 'user', content: 'M' })),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await extractAndPersistInsights({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.persisted).toBe(false)
    expect(r.reason).toBe('no_insights_detected')
  })

  it('ne throw jamais sur erreur Claude', async () => {
    mockCreate.mockRejectedValueOnce(new Error('overloaded'))
    const { supabase } = makeSupabase({
      messages: Array.from({ length: 6 }).map(() => ({ role: 'user', content: 'M' })),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await extractAndPersistInsights({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.persisted).toBe(false)
    expect(r.reason).toMatch(/overloaded/)
  })
})
