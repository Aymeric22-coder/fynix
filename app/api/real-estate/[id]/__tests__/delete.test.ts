/**
 * Tests de la route DELETE /api/real-estate/[id].
 *
 * Couverture :
 *   - bien existant et appartenant à l'utilisateur → 200
 *   - bien inexistant → 404
 *   - bien d'un autre utilisateur → 404 (RLS / filtre user_id)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface PropRow { id: string; asset_id: string }

const state: {
  propLookupResult: { data: PropRow | null }
  deleteError:      { message: string } | null
  deleteCalls:      Array<{ table: string; id: string; user_id: string }>
} = {
  propLookupResult: { data: null },
  deleteError:      null,
  deleteCalls:      [],
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (table: string) => ({
      // GET lookup : .select(...).eq('id', X).eq('user_id', Y).maybeSingle()
      select: (_cols: string) => ({
        eq: (_col1: string, _val1: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            maybeSingle: async () => state.propLookupResult,
          }),
        }),
      }),
      // DELETE chain : .delete().eq('id', X).eq('user_id', Y)
      delete: () => ({
        eq: (_col1: string, val1: unknown) => ({
          eq: async (_col2: string, val2: unknown) => {
            state.deleteCalls.push({
              table, id: String(val1), user_id: String(val2),
            })
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

// Import APRÈS les mocks
import { DELETE } from '../route'

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  state.propLookupResult = { data: null }
  state.deleteError = null
  state.deleteCalls = []
})

describe('DELETE /api/real-estate/[id]', () => {
  it('bien existant et appartient à l\'utilisateur → 200 et supprime l\'asset (cascade)', async () => {
    state.propLookupResult = { data: { id: 'prop-1', asset_id: 'asset-1' } }
    const res = await DELETE(new Request('http://x'), makeCtx('prop-1'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual({ deleted: true })
    // On a bien supprimé l'asset (cascade fait le reste côté SQL)
    expect(state.deleteCalls).toHaveLength(1)
    expect(state.deleteCalls[0]).toEqual({
      table: 'assets', id: 'asset-1', user_id: 'user-test',
    })
  })

  it('bien inexistant → 404 sans appeler delete', async () => {
    state.propLookupResult = { data: null }
    const res = await DELETE(new Request('http://x'), makeCtx('prop-missing'))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Property not found')
    expect(state.deleteCalls).toHaveLength(0)
  })

  it('bien d\'un autre utilisateur → 404 (filtre user_id en lookup)', async () => {
    // Le mock de lookup retourne null si user_id != propriétaire — on simule.
    state.propLookupResult = { data: null }
    const res = await DELETE(new Request('http://x'), makeCtx('prop-other'))
    expect(res.status).toBe(404)
    expect(state.deleteCalls).toHaveLength(0)
  })

  it('erreur SQL pendant le delete → 500', async () => {
    state.propLookupResult = { data: { id: 'prop-1', asset_id: 'asset-1' } }
    state.deleteError = { message: 'simulated db error' }
    const res = await DELETE(new Request('http://x'), makeCtx('prop-1'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('simulated db error')
  })
})
