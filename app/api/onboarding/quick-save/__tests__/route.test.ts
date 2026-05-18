/**
 * Tests de la route /api/onboarding/quick-save.
 *
 * Mock Supabase + bypass withAuth comme les autres tests de routes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updates: Array<Record<string, unknown>> = []
const whereChain: Array<{ col: string; val: unknown }> = []
let mockUpdateError: { message: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (_table: string) => ({
      update: (arg: Record<string, unknown>) => {
        updates.push(arg)
        const chain = {
          eq: (col: string, val: unknown) => {
            whereChain.push({ col, val })
            return Promise.resolve({ error: mockUpdateError })
          },
        }
        return chain
      },
    }),
  })),
}))

vi.mock('@/lib/utils/api', () => ({
  withAuth: (h: (req: Request, user: { id: string }) => Promise<Response>) =>
    (req: Request) => h(req, { id: 'user-quick' }),
  ok:  (data: unknown) => Response.json({ data, error: null }),
  err: (message: string, status = 400) =>
    Response.json({ data: null, error: message }, { status }),
  parseBody: async <T,>(req: Request): Promise<T | null> => {
    try { return (await req.json()) as T } catch { return null }
  },
}))

import { POST } from '../route'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/quick-save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

beforeEach(() => {
  updates.length = 0
  whereChain.length = 0
  mockUpdateError = null
})

describe('POST /api/onboarding/quick-save', () => {
  it('body valide → 200 + update sur (id = user) avec les 3 inputs', async () => {
    const res = await POST(jsonRequest({
      age: 32, revenuMensuelNet: 2500, patrimoineActuel: 15000,
    }), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data.ok).toBe(true)
    // Update doit cibler les champs profile + sentinel + snapshot jsonb
    expect(updates).toHaveLength(1)
    const upd = updates[0]!
    expect(upd.age).toBe(32)
    expect(upd.revenu_mensuel).toBe(2500)
    expect(upd.onboarding_quick_done).toBe(true)
    expect(upd.onboarding_quick_data).toMatchObject({
      age: 32, revenuMensuelNet: 2500, patrimoineActuel: 15000,
    })
    expect(whereChain).toEqual([{ col: 'id', val: 'user-quick' }])
  })

  it('age hors plage (< 18) → 400 avec message Zod', async () => {
    const res = await POST(jsonRequest({
      age: 15, revenuMensuelNet: 2500, patrimoineActuel: 15000,
    }), {} as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/age/i)
  })

  it('age hors plage (> 70) → 400', async () => {
    const res = await POST(jsonRequest({
      age: 75, revenuMensuelNet: 2500, patrimoineActuel: 15000,
    }), {} as never)
    expect(res.status).toBe(400)
  })

  it('revenu négatif → 400', async () => {
    const res = await POST(jsonRequest({
      age: 32, revenuMensuelNet: -1, patrimoineActuel: 1000,
    }), {} as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/revenu/i)
  })

  it('revenu = 0 → 400 (strictement positif requis)', async () => {
    const res = await POST(jsonRequest({
      age: 32, revenuMensuelNet: 0, patrimoineActuel: 1000,
    }), {} as never)
    expect(res.status).toBe(400)
  })

  it('patrimoine négatif → 400', async () => {
    const res = await POST(jsonRequest({
      age: 32, revenuMensuelNet: 2500, patrimoineActuel: -100,
    }), {} as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/patrimoine/i)
  })

  it('patrimoine = 0 accepté (débutant Thomas)', async () => {
    const res = await POST(jsonRequest({
      age: 28, revenuMensuelNet: 2500, patrimoineActuel: 0,
    }), {} as never)
    expect(res.status).toBe(200)
  })

  it('Supabase update échoue → 500', async () => {
    mockUpdateError = { message: 'connection lost' }
    const res = await POST(jsonRequest({
      age: 32, revenuMensuelNet: 2500, patrimoineActuel: 1000,
    }), {} as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/connection lost/)
  })
})
