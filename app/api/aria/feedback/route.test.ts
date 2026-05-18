/**
 * Test d'integration POST /api/aria/feedback.
 *
 * Mocke supabase pour controler les reponses de aria_messages
 * (verification ownership) + aria_feedback (upsert).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

interface QueryStub { data: unknown; error: { message: string } | null }

function makeSupabase(opts: {
  message?:   { id: string; role: string; user_id?: string } | null
  messageErr?: { message: string } | null
  upsertResult?: QueryStub
}) {
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from(table: string) {
      if (table === 'aria_messages') {
        return {
          select() { return this },
          eq()     { return this },
          maybeSingle: async () => ({
            data: opts.message ?? null,
            error: opts.messageErr ?? null,
          }),
        }
      }
      if (table === 'aria_feedback') {
        return {
          upsert() {
            return {
              select() { return this },
              single: async () => opts.upsertResult ?? ({
                data:  { id: 'fb-1', rating: 1, reason: null },
                error: null,
              }),
            }
          },
        }
      }
      throw new Error(`stub manquant pour table ${table}`)
    },
  }
  return supabase
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase/server'

beforeEach(() => {
  vi.clearAllMocks()
})

async function callPOST(body: unknown) {
  const { POST } = await import('./route')
  const req = new Request('http://localhost/api/aria/feedback', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (POST as any)(req, { params: Promise.resolve({}) })
}

describe('POST /api/aria/feedback', () => {
  it('rejette body sans message_id', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServerClient).mockResolvedValue(makeSupabase({}) as any)
    const res = await callPOST({ rating: 1 })
    expect(res.status).toBe(400)
  })

  it('rejette rating invalide', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServerClient).mockResolvedValue(makeSupabase({}) as any)
    const res = await callPOST({ message_id: 'm', rating: 5 })
    expect(res.status).toBe(400)
  })

  it('renvoie 404 si message inexistant', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServerClient).mockResolvedValue(makeSupabase({ message: null }) as any)
    const res = await callPOST({ message_id: 'm', rating: 1 })
    expect(res.status).toBe(404)
  })

  it('rejette si message n\'est pas role=assistant', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSupabase({ message: { id: 'm', role: 'user' } }) as any,
    )
    const res = await callPOST({ message_id: 'm', rating: 1 })
    expect(res.status).toBe(400)
  })

  it('upsert un feedback positif valide', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeSupabase({ message: { id: 'm', role: 'assistant' } }) as any,
    )
    const res = await callPOST({ message_id: 'm', rating: 1 })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.rating).toBe(1)
  })

  it('upsert un feedback negatif avec raison', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      makeSupabase({
        message: { id: 'm', role: 'assistant' },
        upsertResult: { data: { id: 'fb-2', rating: -1, reason: 'reponse hors sujet' }, error: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    const res = await callPOST({ message_id: 'm', rating: -1, reason: 'reponse hors sujet' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.rating).toBe(-1)
    expect(json.data.reason).toBe('reponse hors sujet')
  })

  it('renvoie 500 si l\'upsert echoue', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      makeSupabase({
        message: { id: 'm', role: 'assistant' },
        upsertResult: { data: null, error: { message: 'unique constraint' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    const res = await callPOST({ message_id: 'm', rating: 1 })
    expect(res.status).toBe(500)
  })
})
