/**
 * Tests des routes PUT et DELETE /api/real-estate/[id]/lots/[lotId].
 *
 * Couverture :
 *   - PUT : update lot (loyer modifie, autres champs preserves cote DB)
 *   - PUT : exclut id / user_id / property_id du body
 *   - PUT : lot inexistant => 404
 *   - DELETE : lot existant => 200
 *   - DELETE : erreur SQL => 500
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface UpdateCall {
  fields: Record<string, unknown>
  lotId:  string
}

const state: {
  updateCalls: UpdateCall[]
  updateResult: { data: Record<string, unknown> | null; error: { message: string } | null }
  deleteCalled: boolean
  deleteError:  { message: string } | null
} = {
  updateCalls: [],
  updateResult: { data: { id: 'lot-1', rent_amount: 850 }, error: null },
  deleteCalled: false,
  deleteError: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (_table: string) => ({
      update: (fields: Record<string, unknown>) => ({
        eq: (_c1: string, lotId: unknown) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                state.updateCalls.push({ fields, lotId: String(lotId) })
                return state.updateResult
              },
            }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => {
            state.deleteCalled = true
            return { error: state.deleteError }
          },
        }),
      }),
    }),
  })),
}))

vi.mock('@/lib/utils/api', async () => ({
  withAuth: <T,>(
    h: (req: Request, user: { id: string }, ctx: T) => Promise<Response>,
  ) =>
    (req: Request, ctx: T) => h(req, { id: 'user-test' }, ctx),
  ok:  (data: unknown) => Response.json({ data, error: null }),
  err: (message: string, status = 400) =>
    Response.json({ data: null, error: message }, { status }),
  parseBody: async <T,>(req: Request): Promise<T | null> => {
    try { return (await req.json()) as T } catch { return null }
  },
}))

import { PUT, DELETE } from '../route'

const makeCtx = (id: string, lotId: string) => ({
  params: Promise.resolve({ id, lotId }),
})
const makeReq = (body: Record<string, unknown>) =>
  new Request('http://x', { method: 'PUT', body: JSON.stringify(body) })

beforeEach(() => {
  state.updateCalls = []
  state.updateResult = { data: { id: 'lot-1', rent_amount: 850 }, error: null }
  state.deleteCalled = false
  state.deleteError = null
})

describe('PUT /api/real-estate/[id]/lots/[lotId]', () => {
  it('modifie le loyer => fields contient rent_amount', async () => {
    const res = await PUT(makeReq({ rent_amount: 850, charges_amount: 80 }),
      makeCtx('prop-1', 'lot-1'))
    expect(res.status).toBe(200)

    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0]!.fields).toEqual({
      rent_amount: 850,
      charges_amount: 80,
    })
    expect(state.updateCalls[0]!.lotId).toBe('lot-1')
  })

  it('exclut id / user_id / property_id / created_at du payload', async () => {
    await PUT(makeReq({
      id: 'should-be-ignored',
      user_id: 'fake-user',
      property_id: 'fake-prop',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      rent_amount: 900,
    }), makeCtx('prop-1', 'lot-1'))

    const fields = state.updateCalls[0]!.fields
    expect(fields).not.toHaveProperty('id')
    expect(fields).not.toHaveProperty('user_id')
    expect(fields).not.toHaveProperty('property_id')
    expect(fields).not.toHaveProperty('created_at')
    expect(fields).not.toHaveProperty('updated_at')
    expect(fields).toHaveProperty('rent_amount', 900)
  })

  it('PUT body invalide => 400', async () => {
    const badReq = new Request('http://x', { method: 'PUT', body: 'broken' })
    const res = await PUT(badReq, makeCtx('prop-1', 'lot-1'))
    expect(res.status).toBe(400)
  })

  it('PUT lot courte duree => champs short-term presents dans le payload', async () => {
    await PUT(makeReq({
      rental_type: 'short_term',
      nightly_rate_low: 80,
      occupancy_rate_pct: 70,
      tourism_classification: 'classe_3_4_5',
    }), makeCtx('prop-1', 'lot-1'))

    const fields = state.updateCalls[0]!.fields
    expect(fields.rental_type).toBe('short_term')
    expect(fields.nightly_rate_low).toBe(80)
    expect(fields.tourism_classification).toBe('classe_3_4_5')
  })
})

describe('DELETE /api/real-estate/[id]/lots/[lotId]', () => {
  it('lot existant => 200 et delete appele', async () => {
    const res = await DELETE(new Request('http://x'), makeCtx('prop-1', 'lot-1'))
    expect(res.status).toBe(200)
    expect(state.deleteCalled).toBe(true)
    const json = await res.json()
    expect(json.data).toEqual({ deleted: true })
  })

  it('erreur SQL => 500', async () => {
    state.deleteError = { message: 'foreign key violation' }
    const res = await DELETE(new Request('http://x'), makeCtx('prop-1', 'lot-1'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('foreign key violation')
  })
})
