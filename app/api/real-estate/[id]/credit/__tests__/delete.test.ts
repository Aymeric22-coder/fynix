/**
 * V3.2 — Tests du DELETE /api/real-estate/[id]/credit (multi-crédit).
 *
 * Invariant clé : la suppression cible UN SEUL crédit identifié par
 * (asset_id, user_id, status='active', loan_kind=X). Avant V3.2, le
 * DELETE supprimait TOUS les crédits actifs sans filtre — bug INTEG-005,
 * particulièrement dangereux sur un bien multi-crédit (principal + PTZ).
 *
 * Couverture :
 *   - Sans `?loan_kind=` → 400 (param requis)
 *   - `?loan_kind=` invalide → 400 (validation enum)
 *   - `?loan_kind=ptz` → 200 + filtre `.eq('loan_kind', 'ptz')` passé à supabase
 *   - Bien d'un autre user (lookup null) → 404
 *   - Erreur Supabase pendant DELETE → 500
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface DeleteCall {
  filters: Array<{ column: string; value: unknown }>
}

const state: {
  propLookup:  { data: { asset_id: string } | null }
  deleteCalls: DeleteCall[]
  deleteError: { message: string } | null
} = {
  propLookup:  { data: null },
  deleteCalls: [],
  deleteError: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'real_estate_properties') {
        // .select('asset_id').eq('id', X).eq('user_id', Y).single()
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => state.propLookup,
              }),
            }),
          }),
        }
      }
      if (table === 'debts') {
        // .delete().eq().eq().eq().eq() — on collecte tous les filtres
        const call: DeleteCall = { filters: [] }
        const chain = {
          eq: (column: string, value: unknown) => {
            call.filters.push({ column, value })
            return chain
          },
          then: (cb: (v: { error: { message: string } | null }) => unknown) => {
            state.deleteCalls.push(call)
            return cb({ error: state.deleteError })
          },
        }
        return { delete: () => chain }
      }
      return {}
    },
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

// Import APRÈS les mocks
import { DELETE } from '../route'

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })
const makeReq = (url: string) =>
  new Request(url, { method: 'DELETE' })

beforeEach(() => {
  state.propLookup  = { data: { asset_id: 'asset-1' } }
  state.deleteCalls = []
  state.deleteError = null
})

describe('DELETE /api/real-estate/[id]/credit — V3.2 strict loan_kind', () => {

  it('sans ?loan_kind= → 400 "loan_kind query param required"', async () => {
    const res = await DELETE(
      makeReq('http://x/api/real-estate/prop-1/credit'),
      makeCtx('prop-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/loan_kind/i)
    expect(state.deleteCalls).toHaveLength(0)  // aucun DELETE émis
  })

  it('?loan_kind=invalid → 400 (validation enum)', async () => {
    const res = await DELETE(
      makeReq('http://x/api/real-estate/prop-1/credit?loan_kind=foobar'),
      makeCtx('prop-1'),
    )
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/loan_kind must be one of/i)
    expect(state.deleteCalls).toHaveLength(0)
  })

  it('?loan_kind=ptz → DELETE ciblé sur le PTZ uniquement, principal intact', async () => {
    // Scénario : bien à 2 crédits actifs (principal + PTZ). On supprime le PTZ.
    // Le mock collecte les filtres .eq() : on doit voir asset_id, user_id,
    // status='active' ET loan_kind='ptz'. Pas de filtre supplémentaire qui
    // toucherait le principal.
    const res = await DELETE(
      makeReq('http://x/api/real-estate/prop-1/credit?loan_kind=ptz'),
      makeCtx('prop-1'),
    )
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { deleted: boolean; loan_kind: string } }
    expect(json.data.deleted).toBe(true)
    expect(json.data.loan_kind).toBe('ptz')

    expect(state.deleteCalls).toHaveLength(1)
    const filters = state.deleteCalls[0]!.filters
    // Les 4 filtres doivent être posés ensemble : asset_id, user_id, status, loan_kind
    expect(filters).toContainEqual({ column: 'asset_id',  value: 'asset-1' })
    expect(filters).toContainEqual({ column: 'user_id',   value: 'user-test' })
    expect(filters).toContainEqual({ column: 'status',    value: 'active' })
    expect(filters).toContainEqual({ column: 'loan_kind', value: 'ptz' })
    // Pas de filtre orphelin qui élargirait la portée
    expect(filters).toHaveLength(4)
  })

  it('?loan_kind=principal → DELETE ciblé sur le principal uniquement', async () => {
    const res = await DELETE(
      makeReq('http://x/api/real-estate/prop-1/credit?loan_kind=principal'),
      makeCtx('prop-1'),
    )
    expect(res.status).toBe(200)
    expect(state.deleteCalls[0]!.filters)
      .toContainEqual({ column: 'loan_kind', value: 'principal' })
  })

  it('bien d\'un autre user (asset_id lookup null) → 404', async () => {
    state.propLookup = { data: null }
    const res = await DELETE(
      makeReq('http://x/api/real-estate/prop-1/credit?loan_kind=ptz'),
      makeCtx('prop-1'),
    )
    expect(res.status).toBe(404)
    expect(state.deleteCalls).toHaveLength(0)  // pas de DELETE tenté
  })

  it('erreur Supabase pendant DELETE → 500', async () => {
    state.deleteError = { message: 'connection lost' }
    const res = await DELETE(
      makeReq('http://x/api/real-estate/prop-1/credit?loan_kind=travaux'),
      makeCtx('prop-1'),
    )
    expect(res.status).toBe(500)
    const json = await res.json() as { error: string }
    expect(json.error).toBe('connection lost')
  })
})
