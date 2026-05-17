/**
 * Test d'integration de la route /api/aria/chat (streaming SSE).
 *
 * Mocke :
 *   - @anthropic-ai/sdk : .messages.stream() qui emet des deltas
 *   - @/lib/supabase/server : createServerClient avec auth + tables stubbees
 *   - @/lib/aria : buildLiveContext renvoie un system prompt bidon
 *
 * Verifie :
 *   - Les frames SSE attendues arrivent dans l'ordre (meta, delta..., done)
 *   - La conversation est creee en DB si pas d'ID fourni
 *   - Le message user est persiste avant l'appel Claude
 *   - Le message assistant final est persiste a la fin du stream
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSSEParser, type AriaSSEEvent } from '@/lib/aria/sse'

// ─────────────────────────────────────────────────────────────────
// Mocks
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
          // Insert without .select() returns directly (route uses both forms)
          then(onFulfilled: (v: unknown) => unknown) {
            return Promise.resolve({ data: null, error: null }).then(onFulfilled)
          },
        }
      },
      select() {
        return {
          eq()      { return this },
          maybeSingle: async () => ({ data: { id: 'conv-existing' }, error: null }),
        }
      },
      update() {
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
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => mockSupabase),
}))

vi.mock('@/lib/aria', () => ({
  buildLiveContext: vi.fn(async () => ({ context: {}, systemPrompt: 'STUBBED PROMPT' })),
}))

// Fake Anthropic stream : un async iterable + finalMessage()
const fakeDeltas = ['Bonjour', ' Aymeric', ', voici ton patrimoine.']

function makeFakeStream() {
  const events = fakeDeltas.map((text) => ({
    type:  'content_block_delta' as const,
    delta: { type: 'text_delta' as const, text },
  }))
  const iter = {
    async *[Symbol.asyncIterator]() {
      for (const evt of events) yield evt
    },
    finalMessage: async () => ({
      usage: { input_tokens: 42, output_tokens: 7 },
    }),
  }
  return iter
}

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { stream: vi.fn(() => makeFakeStream()) }
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
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake-key-for-tests'
})

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

describe('POST /api/aria/chat (streaming)', () => {
  it('emet meta -> deltas -> done dans l\'ordre', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messages: [{ role: 'user', content: 'Salut ARIA' }],
        ui:       { section: 'dashboard' },
      }),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')

    const events = await collectSSE(res.body as ReadableStream<Uint8Array>)
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('meta')
    expect(types[types.length - 1]).toBe('done')
    expect(types.filter((t) => t === 'delta').length).toBe(fakeDeltas.length)

    // Le concat des deltas = texte final
    const textFinal = events
      .filter((e): e is Extract<AriaSSEEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.delta).join('')
    expect(textFinal).toBe(fakeDeltas.join(''))
  })

  it('cree une conversation si conversation_id absent', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [{ role: 'user', content: 'Salut' }] }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    await collectSSE(res.body as ReadableStream<Uint8Array>)

    const insertedTables = insertedRows.map((r) => r.table)
    expect(insertedTables).toContain('aria_conversations')
  })

  it('persiste le message user puis le message assistant', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [{ role: 'user', content: 'Question test' }] }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    await collectSSE(res.body as ReadableStream<Uint8Array>)

    const ariaMsgInserts = insertedRows
      .filter((r) => r.table === 'aria_messages')
      .map((r) => r.row)
    expect(ariaMsgInserts.length).toBe(2)
    expect(ariaMsgInserts[0]!.role).toBe('user')
    expect(ariaMsgInserts[0]!.content).toBe('Question test')
    expect(ariaMsgInserts[1]!.role).toBe('assistant')
    expect(ariaMsgInserts[1]!.content).toBe(fakeDeltas.join(''))
  })

  it('refuse un body sans messages', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('refuse si dernier message n\'est pas role=user', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messages: [
          { role: 'user', content: 'q1' },
          { role: 'assistant', content: 'r1' },
        ],
      }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(400)
  })

  it('refuse si ANTHROPIC_API_KEY absente', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/aria/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages: [{ role: 'user', content: 'Salut' }] }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (POST as any)(req, { params: Promise.resolve({}) })
    expect(res.status).toBe(500)
  })
})
