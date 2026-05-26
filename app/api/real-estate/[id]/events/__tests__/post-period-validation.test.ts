/**
 * V10.1 — ROB-103 (serveur) : la POST /events doit refuser une période
 * `period_end < period_start` (400). Défense en profondeur — le client
 * fait déjà la même vérification (add-event-modal.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  ownerOk: boolean
  inserted: unknown
} = { ownerOk: true, inserted: null }

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (_table: string) => ({
      // assertOwner : .select(...).eq().eq().maybeSingle()
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.ownerOk ? { id: 'p-1' } : null }),
          }),
        }),
      }),
      // insert : .insert().select().single()
      insert: (payload: unknown) => {
        state.inserted = payload
        return {
          select: () => ({
            single: async () => ({ data: { id: 'evt-1', ...(payload as object) }, error: null }),
          }),
        }
      },
      // update (effet de bord rent_revision) : .update().eq().eq()
      update: () => ({
        eq: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/utils/api', () => ({
  withAuth: <T,>(
    h: (req: Request, user: { id: string }, ctx: T) => Promise<Response>,
  ) =>
    (req: Request, ctx: T) => h(req, { id: 'user-test' }, ctx),
  ok:  (data: unknown, status = 200) => Response.json({ data, error: null }, { status }),
  err: (message: string, status = 400) =>
    Response.json({ data: null, error: message }, { status }),
  parseBody: async <T,>(req: Request): Promise<T | null> => {
    try { return (await req.json()) as T } catch { return null }
  },
}))

import { POST } from '../route'

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })
const makeReq = (body: Record<string, unknown>) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  state.ownerOk = true
  state.inserted = null
})

describe('POST /api/real-estate/[id]/events — V10.1 ROB-103 période', () => {
  it('période valide (start ≤ end) : 201 + insert payload contient les dates', async () => {
    const res = await POST(makeReq({
      kind: 'vacancy',
      event_date: '2026-05-26',
      period_start: '2026-04-01',
      period_end:   '2026-05-15',
    }), makeCtx('p-1'))
    expect(res.status).toBe(201)
    expect((state.inserted as { period_start: string }).period_start).toBe('2026-04-01')
    expect((state.inserted as { period_end: string }).period_end).toBe('2026-05-15')
  })

  it('période identique (start === end) : autorisée (séjour 1 jour)', async () => {
    const res = await POST(makeReq({
      kind: 'booking_cancellation',
      event_date: '2026-05-26',
      period_start: '2026-06-01',
      period_end:   '2026-06-01',
    }), makeCtx('p-1'))
    expect(res.status).toBe(201)
  })

  it('période INVERSÉE (end < start) : 400, aucun insert', async () => {
    const res = await POST(makeReq({
      kind: 'vacancy',
      event_date: '2026-05-26',
      period_start: '2026-05-15',
      period_end:   '2026-04-01',
    }), makeCtx('p-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/date de fin doit être/i)
    expect(state.inserted).toBeNull()
  })

  it('period_end seul (sans period_start) : autorisé (legacy / vacance ouverte)', async () => {
    const res = await POST(makeReq({
      kind: 'vacancy',
      event_date: '2026-05-26',
      period_end: '2026-06-01',
    }), makeCtx('p-1'))
    expect(res.status).toBe(201)
  })

  it('period_start seul (vacance en cours) : autorisé', async () => {
    const res = await POST(makeReq({
      kind: 'vacancy',
      event_date: '2026-05-26',
      period_start: '2026-05-01',
    }), makeCtx('p-1'))
    expect(res.status).toBe(201)
  })
})
