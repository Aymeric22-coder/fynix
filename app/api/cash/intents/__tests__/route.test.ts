/**
 * Tests `app/api/cash/intents` (V1.2).
 *
 * Couvre :
 *   - Validation zod : POST montant ≤ 0 → 400 ; motif invalide → 400 ;
 *     target_date mauvais format → 400.
 *   - Garde anti-dépassement : POST qui ferait Σ intents > totalCash → 422.
 *   - Happy path : POST valide → 201 + retour de l'intent créée.
 *   - PUT : recalcul intelligent du dépassement (remplace l'ancien montant
 *     par le nouveau dans la somme projetée).
 *   - DELETE : retourne 200.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks Supabase ────────────────────────────────────────────────────
interface MockState {
  cashAccounts:    Array<{ id: string; asset_id: string | null; balance: number; currency: string; account_type: string }>
  cashIntents:     Array<{ id: string; user_id: string; cash_account_id: string | null; montant: number; motif: string; motif_libre: string | null; target_date: string | null; created_at: string; updated_at: string }>
  inserted:        Record<string, unknown> | null
  updated:         Record<string, unknown> | null
  deleted:         string | null
}

const state: MockState = {
  cashAccounts: [],
  cashIntents:  [],
  inserted:     null,
  updated:      null,
  deleted:      null,
}

function makeSelectChain(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq:     () => builder,
    order:  () => builder,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single:      async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'cash_accounts') {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => {
              const r = makeSelectChain(state.cashAccounts)
              return Object.assign(r, {
                maybeSingle: async () => ({
                  data: state.cashAccounts[0] ?? null,
                  error: null,
                }),
              })
            },
          }),
        }
      }
      if (table === 'cash_intents') {
        return {
          select: () => ({
            eq: (_col: string, _val: unknown) => Object.assign(makeSelectChain(state.cashIntents), {
              eq: (_col2: string, _val2: unknown) => Object.assign(makeSelectChain(state.cashIntents), {
                maybeSingle: async () => ({ data: state.cashIntents[0] ?? null, error: null }),
              }),
              order: () => makeSelectChain(state.cashIntents),
              maybeSingle: async () => ({ data: state.cashIntents[0] ?? null, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                state.inserted = row
                return {
                  data: {
                    id: 'new-intent-id',
                    ...row,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col1: string, _val1: unknown) => ({
              eq: (_col2: string, _val2: unknown) => ({
                select: () => ({
                  single: async () => {
                    state.updated = patch
                    return {
                      data: { id: 'updated-id', ...patch },
                      error: null,
                    }
                  },
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: (_col1: string, val1: unknown) => {
              // 1er .eq('id', id) → on capte l'id pour le test
              state.deleted = String(val1)
              return {
                eq: (_col2: string, _val2: unknown) =>
                  Promise.resolve({ error: null }),
              }
            },
          }),
        }
      }
      return makeSelectChain([])
    },
  })),
  createServiceClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/providers/fx', () => ({
  toEur: async (amount: number) => amount,
  getFxRate: async () => 1,
}))

vi.mock('@/lib/utils/api', async () => ({
  withAuth: (h: (req: Request, user: { id: string }, ctx?: unknown) => Promise<Response>) =>
    (req: Request, ctx?: unknown) => h(req, { id: 'user-test' }, ctx),
  ok:  (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  err: (message: string, status = 400) =>
    Response.json({ data: null, error: message }, { status }),
  parseBody: async <T,>(req: Request): Promise<T | null> => {
    try { return (await req.json()) as T } catch { return null }
  },
}))

import { POST } from '../route'
import { PUT, DELETE } from '../[id]/route'

function makeReq(body: unknown): Request {
  return new Request('http://test/api/cash/intents', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  state.cashAccounts = []
  state.cashIntents  = []
  state.inserted     = null
  state.updated      = null
  state.deleted      = null
})

describe('POST /api/cash/intents — validation zod', () => {
  it('montant ≤ 0 → 400', async () => {
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(makeReq({ montant: 0, motif: 'apport_immo' }))
    expect(res.status).toBe(400)
  })

  it('motif invalide → 400', async () => {
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(makeReq({ montant: 1000, motif: 'pas-un-motif' }))
    expect(res.status).toBe(400)
  })

  it('target_date mauvais format → 400', async () => {
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(makeReq({
      montant: 1000, motif: 'voyage', target_date: '15/06/2026',
    }))
    expect(res.status).toBe(400)
  })

  it('body JSON invalide → 400 « Invalid JSON body »', async () => {
    const req = new Request('http://test', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/cash/intents — garde anti-dépassement', () => {
  it('Σ intents + nouveau > totalCash → 422 avec message clair', async () => {
    state.cashAccounts = [
      { id: 'a', asset_id: null, balance: 18_578, currency: 'EUR', account_type: 'livret_a' },
    ]
    state.cashIntents = [
      // 1 intent existante de 15 000 €. Total cash = 18 578. Nouveau 5 000 → dépasse.
      {
        id: 'i1', user_id: 'user-test', cash_account_id: null,
        montant: 15_000, motif: 'apport_immo', motif_libre: null,
        target_date: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
    ]
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(makeReq({ montant: 5_000, motif: 'voyage' }))
    expect(res.status).toBe(422)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/dépasserait/)
  })

  it('Σ intents + nouveau ≤ totalCash → 201 + insertion', async () => {
    state.cashAccounts = [
      { id: 'a', asset_id: null, balance: 18_578, currency: 'EUR', account_type: 'livret_a' },
    ]
    state.cashIntents = []
    const res = await (POST as unknown as (req: Request) => Promise<Response>)(makeReq({
      montant: 5_000, motif: 'apport_immo', motif_libre: 'Saint-Brieuc Q4',
    }))
    expect(res.status).toBe(201)
    expect(state.inserted).toMatchObject({
      montant: 5_000,
      motif:   'apport_immo',
      motif_libre: 'Saint-Brieuc Q4',
      user_id: 'user-test',
    })
  })
})

describe('PUT /api/cash/intents/[id] — recalcul intelligent', () => {
  it('PUT remplace l\'ancien montant dans la somme projetée', async () => {
    state.cashAccounts = [
      { id: 'a', asset_id: null, balance: 18_578, currency: 'EUR', account_type: 'livret_a' },
    ]
    // L'intent existante a 15 000. Total intent autorisé = 18 578.
    state.cashIntents = [
      {
        id: 'i1', user_id: 'user-test', cash_account_id: null,
        montant: 15_000, motif: 'apport_immo', motif_libre: null,
        target_date: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
    ]
    // On REDUIT l'intent à 10 000 → projeté = 10 000 ≤ 18 578 → OK.
    const req = new Request('http://test/api/cash/intents/i1', {
      method: 'PUT',
      body: JSON.stringify({ montant: 10_000 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req, ctx('i1'))
    expect(res.status).toBe(200)
  })

  it('PUT dont le NOUVEAU montant ferait dépasser → 422', async () => {
    state.cashAccounts = [
      { id: 'a', asset_id: null, balance: 18_578, currency: 'EUR', account_type: 'livret_a' },
    ]
    state.cashIntents = [
      {
        id: 'i1', user_id: 'user-test', cash_account_id: null,
        montant: 5_000, motif: 'apport_immo', motif_libre: null,
        target_date: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      // Une 2e intent de 10 000. Total intent = 15 000.
      {
        id: 'i2', user_id: 'user-test', cash_account_id: null,
        montant: 10_000, motif: 'voyage', motif_libre: null,
        target_date: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
    ]
    // On essaye de passer i1 à 20 000 → projeté = 20 000 + 10 000 = 30 000 > 18 578.
    const req = new Request('http://test/api/cash/intents/i1', {
      method: 'PUT',
      body: JSON.stringify({ montant: 20_000 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req, ctx('i1'))
    expect(res.status).toBe(422)
  })

  it('PUT intention inexistante → 404', async () => {
    state.cashIntents = []
    const req = new Request('http://test/api/cash/intents/nope', {
      method: 'PUT',
      body: JSON.stringify({ montant: 1000 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req, ctx('nope'))
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/cash/intents/[id]', () => {
  it('appelle delete().eq("id", ...).eq("user_id", ...) → 200', async () => {
    const req = new Request('http://test/api/cash/intents/i-xyz', {
      method: 'DELETE',
    })
    const res = await DELETE(req, ctx('i-xyz'))
    expect(res.status).toBe(200)
    expect(state.deleted).toBe('i-xyz')
  })
})
