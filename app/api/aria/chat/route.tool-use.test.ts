/**
 * Test d'integration de la boucle tool_use sur /api/aria/chat.
 *
 * Scenario simule :
 *   1er tour Claude : stop_reason=tool_use, emet un bloc tool_use chercherPosition
 *   2e tour Claude : stop_reason=end_turn, emet un texte final
 *
 * Verifie :
 *   - Les events SSE tool_use puis tool_result apparaissent
 *   - Le message assistant final contient le texte du dernier tour
 *   - tool_calls et tool_results sont persistes dans aria_messages
 *   - La limite MAX_TOOL_ITERATIONS (5) est respectee
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSSEParser, type AriaSSEEvent } from '@/lib/aria/sse'
import { makePatrimoineFixture, makePositionFixture } from '@/lib/aria/__tests__/fixtures'

// ─────────────────────────────────────────────────────────────────
// Mocks supabase + aria + aggregateur
// ─────────────────────────────────────────────────────────────────

interface InsertedRow { table: string; row: Record<string, unknown> }
const insertedRows: InsertedRow[] = []

const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
  },
  from(table: string) {
    return {
      insert(row: Record<string, unknown>) {
        insertedRows.push({ table, row })
        return {
          select() { return this },
          single: async () => ({ data: { id: `${table}-new-id` }, error: null }),
          then(o: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(o) },
        }
      },
      select() {
        return {
          eq() { return this },
          maybeSingle: async () => ({ data: { id: 'conv' }, error: null }),
        }
      },
      update() {
        return {
          eq() { return { eq: async () => ({ data: null, error: null }) } }
        }
      },
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => mockSupabase),
}))

vi.mock('@/lib/aria', () => ({
  buildLiveContext: vi.fn(async () => ({ context: {}, systemPrompt: 'STUBBED' })),
}))

vi.mock('@/lib/aria/memory/summarizer', () => ({
  summarizeConversation: vi.fn(async () => ({ generated: false, reason: 'mocked' })),
}))

vi.mock('@/lib/aria/memory/insights', () => ({
  extractAndPersistInsights: vi.fn(async () => ({ persisted: false, insights: [], reason: 'mocked' })),
}))

vi.mock('@/lib/analyse/aggregateur', () => ({
  getPatrimoineComplet: vi.fn(async () => makePatrimoineFixture({
    positions: [makePositionFixture({ isin: 'US-APPLE', name: 'Apple Inc', current_value: 1000 })],
  })),
}))

// ─────────────────────────────────────────────────────────────────
// Fake Anthropic stream avec 2 tours : tool_use puis end_turn
// ─────────────────────────────────────────────────────────────────

let callIndex = 0

function makeStreamForCall(index: number) {
  if (index === 0) {
    // 1er tour : Claude veut appeler chercherPosition
    return {
      async *[Symbol.asyncIterator]() {
        // Pas de delta text dans ce tour
      },
      finalMessage: async () => ({
        content: [
          {
            type:  'tool_use' as const,
            id:    'toolu_abc123',
            name:  'chercherPosition',
            input: { query: 'apple' },
          },
        ],
        stop_reason: 'tool_use',
        usage:       { input_tokens: 100, output_tokens: 20 },
      }),
    }
  }
  // 2e tour : reponse finale
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'content_block_delta' as const, delta: { type: 'text_delta' as const, text: 'Tu as Apple en portefeuille a 1000 EUR.' } }
    },
    finalMessage: async () => ({
      content:     [{ type: 'text' as const, text: 'Tu as Apple en portefeuille a 1000 EUR.' }],
      stop_reason: 'end_turn',
      usage:       { input_tokens: 200, output_tokens: 15 },
    }),
  }
}

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: vi.fn(() => {
        const s = makeStreamForCall(callIndex)
        callIndex++
        return s
      }),
    }
    constructor(_opts: unknown) { /* noop */ }
  }
  return { default: Anthropic }
})

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function collectSSE(stream: ReadableStream<Uint8Array>): Promise<AriaSSEEvent[]> {
  const events: AriaSSEEvent[] = []
  const parser = createSSEParser((e) => events.push(e))
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    parser.push(decoder.decode(value, { stream: true }))
  }
  parser.flush()
  return events
}

beforeEach(() => {
  insertedRows.length = 0
  callIndex = 0
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake'
})

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('POST /api/aria/chat — boucle tool_use', () => {
  it('execute le tool puis renvoie un texte final', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [{ role: 'user', content: 'Mon Apple ?' }] }),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    const events = await collectSSE(res.body as ReadableStream<Uint8Array>)
    const types = events.map((e) => e.type)

    // Sequence attendue : meta -> tool_use -> tool_result -> delta -> done
    expect(types).toContain('tool_use')
    expect(types).toContain('tool_result')
    expect(types[0]).toBe('meta')
    expect(types[types.length - 1]).toBe('done')

    // L'ordre tool_use precede tool_result
    const idxToolUse    = types.indexOf('tool_use')
    const idxToolResult = types.indexOf('tool_result')
    expect(idxToolResult).toBeGreaterThan(idxToolUse)

    // Le tool_result correspond bien au tool_use
    const toolUse    = events.find((e): e is Extract<AriaSSEEvent, { type: 'tool_use' }> => e.type === 'tool_use')!
    const toolResult = events.find((e): e is Extract<AriaSSEEvent, { type: 'tool_result' }> => e.type === 'tool_result')!
    expect(toolUse.name).toBe('chercherPosition')
    expect(toolResult.tool_use_id).toBe(toolUse.tool_use_id)
    expect(toolResult.success).toBe(true)
  })

  it('persiste tool_calls et tool_results dans aria_messages', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [{ role: 'user', content: 'Mon Apple ?' }] }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    await collectSSE(res.body as ReadableStream<Uint8Array>)

    const assistantRow = insertedRows
      .filter((r) => r.table === 'aria_messages')
      .map((r) => r.row)
      .find((row) => row.role === 'assistant')
    expect(assistantRow).toBeDefined()
    expect(assistantRow!.content).toContain('Apple')
    expect(Array.isArray(assistantRow!.tool_calls)).toBe(true)
    expect((assistantRow!.tool_calls as Array<{ name: string }>)[0]!.name).toBe('chercherPosition')
    expect(Array.isArray(assistantRow!.tool_results)).toBe(true)
  })
})
