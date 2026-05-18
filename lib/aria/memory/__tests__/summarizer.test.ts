/**
 * Tests de summarizeConversation + helpers purs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────
// Mock Anthropic SDK
// ─────────────────────────────────────────────────────────────────

const mockCreate = vi.fn(async () => ({
  content: [{ type: 'text', text: 'Resume genere par Claude.' }],
}))

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mockCreate }
    constructor(_opts: unknown) { /* noop */ }
  }
  return { default: Anthropic }
})

import { shouldSummarize, summarizeConversation } from '../summarizer'

// ─────────────────────────────────────────────────────────────────
// shouldSummarize (pure)
// ─────────────────────────────────────────────────────────────────

describe('shouldSummarize', () => {
  it('false si pas assez de messages', () => {
    expect(shouldSummarize(3, null, null)).toBe(false)
  })

  it('true si messages OK et aucun summary', () => {
    expect(shouldSummarize(5, null, null)).toBe(true)
  })

  it('false si summary present et frais', () => {
    expect(shouldSummarize(10, 'resume', 1000)).toBe(false)
  })

  it('true si summary present mais > TTL', () => {
    expect(shouldSummarize(10, 'resume', 25 * 3600 * 1000)).toBe(true)
  })

  it('respecte minMessages custom', () => {
    expect(shouldSummarize(3, null, null, { minMessages: 2 })).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// summarizeConversation (avec mocks)
// ─────────────────────────────────────────────────────────────────

interface UpdateCall { table: string; values: Record<string, unknown> }

function makeSupabase(opts: {
  conv?:     { summary: string | null; last_message_at: string } | null
  messages?: Array<{ role: string; content: string }>
}) {
  const updates: UpdateCall[] = []
  const supabase = {
    from(table: string) {
      const builder = {
        select() { return builder },
        eq()     { return builder },
        order()  { return builder },
        maybeSingle: async () => {
          if (table === 'aria_conversations' && opts.conv !== null) {
            return { data: opts.conv ?? null, error: null }
          }
          return { data: null, error: null }
        },
        // pour la fin de chaine .order() sur aria_messages
        then(onFulfilled: (v: unknown) => unknown) {
          if (table === 'aria_messages') {
            return Promise.resolve({ data: opts.messages ?? [], error: null }).then(onFulfilled)
          }
          return Promise.resolve({ data: [], error: null }).then(onFulfilled)
        },
        update(values: Record<string, unknown>) {
          updates.push({ table, values })
          return {
            eq() {
              return {
                eq: async () => ({ data: null, error: null }),
                then(o: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(o) },
              }
            },
          }
        },
      }
      return builder
    },
  }
  return { supabase, updates }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
})

describe('summarizeConversation', () => {
  it('genere et persiste un resume si conversation longue', async () => {
    const { supabase, updates } = makeSupabase({
      conv: { summary: null, last_message_at: '2026-05-18T10:00:00Z' },
      messages: Array.from({ length: 6 }).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      })),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await summarizeConversation({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.generated).toBe(true)
    expect(r.summary).toBe('Resume genere par Claude.')
    expect(updates.some((u) => u.table === 'aria_conversations' && u.values.summary)).toBe(true)
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('skip si trop court', async () => {
    const { supabase } = makeSupabase({
      conv: { summary: null, last_message_at: '2026-05-18T10:00:00Z' },
      messages: [{ role: 'user', content: 'Salut' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await summarizeConversation({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.generated).toBe(false)
    expect(r.reason).toBe('too_short_or_fresh')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('skip si pas d\'API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { supabase } = makeSupabase({ conv: { summary: null, last_message_at: '' }, messages: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await summarizeConversation({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.generated).toBe(false)
    expect(r.reason).toBe('no_api_key')
  })

  it('renvoie generated=false si conversation introuvable', async () => {
    const { supabase } = makeSupabase({ conv: null, messages: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await summarizeConversation({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.generated).toBe(false)
    expect(r.reason).toBe('conversation_not_found')
  })

  it('ne throw jamais sur erreur reseau (Claude)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate limit'))
    const { supabase } = makeSupabase({
      conv: { summary: null, last_message_at: '2026-05-18T10:00:00Z' },
      messages: Array.from({ length: 6 }).map((_, i) => ({ role: 'user', content: `M${i}` })),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await summarizeConversation({ supabase: supabase as any, userId: 'u', conversationId: 'c1' })
    expect(r.generated).toBe(false)
    expect(r.reason).toMatch(/error: rate limit/)
  })
})
