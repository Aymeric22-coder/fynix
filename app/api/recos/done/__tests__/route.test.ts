/**
 * Tests de la route /api/recos/done — mock Supabase + bypass withAuth.
 *
 * Couverture :
 *   - GET  : renvoie les recoKeys actives (undone_at IS NULL)
 *   - POST done:true  : upsert avec undone_at=null
 *   - POST done:false : update undone_at = now()
 *   - POST body invalide : 400 avec message Zod
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

interface RecoRow { reco_key: string }

const calls: {
  selectIs?:    { column: string; value: unknown }
  upsertArg?:   unknown
  upsertOpts?:  unknown
  updateArg?:   unknown
  whereChain?:  Array<{ col: string; val: unknown }>
} = {}

let mockRows: RecoRow[] = []
let mockSelectError: { message: string } | null = null
let mockUpsertError: { message: string } | null = null
let mockUpdateError: { message: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (_table: string) => ({
      // GET path: select('reco_key').eq('user_id', X).is('undone_at', null)
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          is: async (column: string, value: unknown) => {
            calls.selectIs = { column, value }
            return mockSelectError
              ? { data: null, error: mockSelectError }
              : { data: mockRows, error: null }
          },
        }),
      }),
      // POST done:true path
      upsert: async (arg: unknown, opts: unknown) => {
        calls.upsertArg = arg
        calls.upsertOpts = opts
        return { error: mockUpsertError }
      },
      // POST done:false path
      update: (arg: unknown) => {
        calls.updateArg = arg
        calls.whereChain = []
        const chain = {
          eq: (col: string, val: unknown) => {
            calls.whereChain!.push({ col, val })
            // Le second .eq() doit terminer la promesse
            if (calls.whereChain!.length >= 2) {
              return Promise.resolve({ error: mockUpdateError })
            }
            return chain
          },
        }
        return chain
      },
    }),
  })),
}))

vi.mock('@/lib/utils/api', async () => {
  return {
    withAuth: (h: (req: Request, user: { id: string }) => Promise<Response>) =>
      (req: Request) => h(req, { id: 'user-test' }),
    ok:  (data: unknown) => Response.json({ data, error: null }),
    err: (message: string, status = 400) =>
      Response.json({ data: null, error: message }, { status }),
    parseBody: async <T,>(req: Request): Promise<T | null> => {
      try { return (await req.json()) as T } catch { return null }
    },
  }
})

import { GET, POST } from '../route'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/recos/done', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

beforeEach(() => {
  mockRows = []
  mockSelectError = null
  mockUpsertError = null
  mockUpdateError = null
  for (const k of Object.keys(calls)) delete (calls as Record<string, unknown>)[k]
})

describe('GET /api/recos/done', () => {
  it('renvoie la liste des reco_key actives (undone_at IS NULL)', async () => {
    mockRows = [{ reco_key: 'pea-non-ouvert' }, { reco_key: 'cash-excessif' }]
    const res = await GET(new Request('http://localhost/api/recos/done'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBeNull()
    expect(body.data.recoKeys).toEqual(['pea-non-ouvert', 'cash-excessif'])
    // Vérifie que le filtre undone_at IS NULL est bien appliqué
    expect(calls.selectIs).toEqual({ column: 'undone_at', value: null })
  })

  it('renvoie tableau vide si Supabase ne renvoie aucun row', async () => {
    mockRows = []
    const res = await GET(new Request('http://localhost/api/recos/done'), {} as never)
    const body = await res.json()
    expect(body.data.recoKeys).toEqual([])
  })

  it('propage les erreurs Supabase en 500', async () => {
    mockSelectError = { message: 'connection lost' }
    const res = await GET(new Request('http://localhost/api/recos/done'), {} as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/connection lost/)
  })
})

describe('POST /api/recos/done', () => {
  it('done:true → upsert avec undone_at=null + onConflict (user_id,reco_key)', async () => {
    const res = await POST(jsonRequest({ recoKey: 'pea-non-ouvert', done: true }), {} as never)
    expect(res.status).toBe(200)
    const arg = calls.upsertArg as Record<string, unknown>
    expect(arg.user_id).toBe('user-test')
    expect(arg.reco_key).toBe('pea-non-ouvert')
    expect(arg.undone_at).toBeNull()
    expect(arg.done_at).toEqual(expect.any(String))
    expect(calls.upsertOpts).toEqual({ onConflict: 'user_id,reco_key' })
  })

  it('done:false → update undone_at = now() avec where (user_id, reco_key)', async () => {
    const res = await POST(jsonRequest({ recoKey: 'cash-excessif', done: false }), {} as never)
    expect(res.status).toBe(200)
    const arg = calls.updateArg as Record<string, unknown>
    expect(arg.undone_at).toEqual(expect.any(String))
    expect(calls.whereChain).toEqual([
      { col: 'user_id', val: 'user-test' },
      { col: 'reco_key', val: 'cash-excessif' },
    ])
  })

  it('body invalide (recoKey vide) → 400 + message Zod lisible', async () => {
    const res = await POST(jsonRequest({ recoKey: '', done: true }), {} as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/recoKey/i)
  })

  it('body invalide (done absent) → 400', async () => {
    const res = await POST(jsonRequest({ recoKey: 'x' }), {} as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/done/i)
  })

  it('body invalide (recoKey > 100 chars) → 400', async () => {
    const res = await POST(jsonRequest({ recoKey: 'a'.repeat(101), done: true }), {} as never)
    expect(res.status).toBe(400)
  })

  it('upsert Supabase échec → 500', async () => {
    mockUpsertError = { message: 'unique violation' }
    const res = await POST(jsonRequest({ recoKey: 'k', done: true }), {} as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/unique violation/)
  })
})
