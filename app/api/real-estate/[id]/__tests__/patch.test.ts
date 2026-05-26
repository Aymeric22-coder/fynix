/**
 * Tests de la route PATCH (alias de PUT) /api/real-estate/[id].
 *
 * Couverture :
 *   - PATCH = PUT (meme implementation)
 *   - Partial update : seuls les champs fournis sont ecrits
 *   - Separation asset (name/notes/...) vs property (purchase_price/...)
 *   - Bien inexistant ou d'un autre user => 404
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface UpdateCall {
  table: string
  fields: Record<string, unknown>
  filterValue: unknown
}

const state: {
  propLookup: { data: { asset_id: string } | null }
  updateCalls: UpdateCall[]
} = {
  propLookup: { data: null },
  updateCalls: [],
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (table: string) => ({
      // .select(...).eq().eq().single() => lookup asset_id
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => state.propLookup,
          }),
        }),
      }),
      // .update({...}).eq('id', val) => returns thenable
      update: (fields: Record<string, unknown>) => ({
        eq: (_col: string, val: unknown) => {
          state.updateCalls.push({ table, fields, filterValue: val })
          // Doit etre awaitable (Promise-like) — la route fait Promise.all
          return Promise.resolve({ data: null, error: null }) as unknown as PromiseLike<unknown>
        },
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

// Import APRES les mocks
import { PUT, PATCH } from '../route'

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })
const makeReq = (body: Record<string, unknown>) =>
  new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) })

beforeEach(() => {
  state.propLookup = { data: null }
  state.updateCalls = []
})

describe('PATCH/PUT /api/real-estate/[id]', () => {
  it('PATCH est exactement le meme handler que PUT (meme reference)', () => {
    expect(PATCH).toBe(PUT)
  })

  it('PATCH du nom seul => update sur assets uniquement, pas sur properties', async () => {
    state.propLookup = { data: { asset_id: 'asset-1' } }
    const res = await PATCH(makeReq({ name: 'Nouveau nom' }), makeCtx('prop-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual({ id: 'prop-1', updated: true })

    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0]).toEqual({
      table: 'assets',
      fields: { name: 'Nouveau nom' },
      filterValue: 'asset-1',
    })
  })

  it('PATCH du prix d\'achat seul => update sur properties uniquement', async () => {
    state.propLookup = { data: { asset_id: 'asset-1' } }
    const res = await PATCH(makeReq({ purchase_price: 250_000 }), makeCtx('prop-1'))
    expect(res.status).toBe(200)
    expect(state.updateCalls).toHaveLength(1)
    expect(state.updateCalls[0]).toEqual({
      table: 'real_estate_properties',
      fields: { purchase_price: 250_000 },
      filterValue: 'prop-1',
    })
  })

  it('PATCH multi-champs (asset + property) => 2 updates en parallele', async () => {
    state.propLookup = { data: { asset_id: 'asset-1' } }
    const res = await PATCH(makeReq({
      name: 'Mon bien',
      purchase_price: 200_000,
      fiscal_regime: 'lmnp_reel',
      usage_type: 'short_term_rental',
    }), makeCtx('prop-1'))
    expect(res.status).toBe(200)

    expect(state.updateCalls).toHaveLength(2)
    const assetCall = state.updateCalls.find(c => c.table === 'assets')!
    const propCall  = state.updateCalls.find(c => c.table === 'real_estate_properties')!
    expect(assetCall.fields).toEqual({ name: 'Mon bien' })
    expect(propCall.fields).toEqual({
      purchase_price: 200_000,
      fiscal_regime: 'lmnp_reel',
      usage_type: 'short_term_rental',
    })
  })

  it('bien d\'un autre utilisateur => 404 (lookup retourne null)', async () => {
    state.propLookup = { data: null }
    const res = await PATCH(makeReq({ name: 'X' }), makeCtx('prop-other'))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Property not found')
    expect(state.updateCalls).toHaveLength(0)
  })

  it('body invalide (JSON cassé) => 400', async () => {
    state.propLookup = { data: { asset_id: 'asset-1' } }
    const badReq = new Request('http://x', { method: 'PATCH', body: 'not-json' })
    const res = await PATCH(badReq, makeCtx('prop-1'))
    expect(res.status).toBe(400)
  })

  it('V10.1 — ROB-106 : body vide {} => 400, aucun update (avant : 200 silencieux)', async () => {
    state.propLookup = { data: { asset_id: 'asset-1' } }
    const res = await PATCH(makeReq({}), makeCtx('prop-1'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/aucun champ valide/i)
    expect(state.updateCalls).toHaveLength(0)
  })
})
