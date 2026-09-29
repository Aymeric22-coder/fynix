/**
 * Tests `app/api/transactions/[id]` — non-régression sécurité (Sprint H).
 *
 * La RPC `apply_transaction_mutation` (migration 057) refuse tout appel dont
 * `p_user_id` diffère de `auth.uid()`. Ces tests verrouillent le contrat côté
 * appelant :
 *   - `p_user_id` transmis à la RPC = id de l'utilisateur de SESSION
 *     (`withAuth` → `supabase.auth.getUser()`), jamais une valeur du corps ;
 *   - la RPC est appelée via le client de session (`createServerClient`) ;
 *   - TX_NOT_OWNED → 403 ; AUTH_UID_MISMATCH → erreur (jamais 2xx) ;
 *   - sans session → 401 et aucune RPC appelée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SESSION_USER_ID = 'user-session-1'

interface MockState {
  user:      { id: string } | null
  rpcCalls:  Array<{ fn: string; args: Record<string, unknown> }>
  rpcError:  { message: string } | null
}

const state: MockState = { user: null, rpcCalls: [], rpcError: null }

const TARGET = {
  id: 'tx-2', transaction_type: 'purchase', quantity: 10, unit_price: 120, fees: 0,
  executed_at: '2024-02-01T00:00:00.000Z', realized_pnl: null, position_id: 'pos-1', currency: 'EUR',
}
const LEDGER = [
  { id: 'tx-1', transaction_type: 'purchase', quantity: 10, unit_price: 100, fees: 0, executed_at: '2024-01-01T00:00:00.000Z', realized_pnl: null },
  { id: 'tx-2', transaction_type: 'purchase', quantity: 10, unit_price: 120, fees: 0, executed_at: '2024-02-01T00:00:00.000Z', realized_pnl: null },
]
const POSITION = { id: 'pos-1', quantity: 20, average_price: 110 }

function chain(result: { single: unknown; many: unknown[] }) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq:     () => b,
    maybeSingle: async () => ({ data: result.single, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: result.many, error: null }).then(resolve),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.user ? null : { message: 'no session' } }),
    },
    from: (table: string) => ({
      select: (cols: string) => {
        if (table === 'positions') return chain({ single: POSITION, many: [POSITION] })
        // TARGET_SELECT contient `currency` ; LEDGER_SELECT non.
        if (cols.includes('currency')) return chain({ single: TARGET, many: [TARGET] })
        return chain({ single: null, many: LEDGER })
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
      if (state.rpcError) return { data: null, error: state.rpcError }
      return { data: { id: 'pos-1', quantity: args.p_new_qty, average_price: args.p_new_pru }, error: null }
    },
  })),
}))

import { DELETE, PUT } from '../route'

const ctx = { params: Promise.resolve({ id: 'tx-2' }) }

function del() {
  return DELETE(new Request('http://localhost/api/transactions/tx-2', { method: 'DELETE' }), ctx)
}

beforeEach(() => {
  state.user = { id: SESSION_USER_ID }
  state.rpcCalls = []
  state.rpcError = null
})

describe('app/api/transactions/[id] — appel RPC sécurisé', () => {
  it('DELETE transmet p_user_id = utilisateur de session', async () => {
    const res = await del()
    expect(res.status).toBe(200)
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0]!.fn).toBe('apply_transaction_mutation')
    expect(state.rpcCalls[0]!.args.p_user_id).toBe(SESSION_USER_ID)
    expect(state.rpcCalls[0]!.args.p_op).toBe('delete')
  })

  it('PUT ignore tout user_id du corps et utilise la session', async () => {
    const req = new Request('http://localhost/api/transactions/tx-2', {
      method: 'PUT',
      body: JSON.stringify({ quantity: 5, unit_price: 120, fees: 0, user_id: 'attacker', p_user_id: 'attacker' }),
    })
    const res = await PUT(req, ctx)
    expect(res.status).toBe(200)
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0]!.args.p_user_id).toBe(SESSION_USER_ID)
    expect(state.rpcCalls[0]!.args.p_op).toBe('update')
  })

  it('TX_NOT_OWNED renvoyé par la RPC → 403', async () => {
    state.rpcError = { message: 'TX_NOT_OWNED' }
    const res = await del()
    expect(res.status).toBe(403)
  })

  it('AUTH_UID_MISMATCH renvoyé par la RPC → jamais 2xx', async () => {
    state.rpcError = { message: 'AUTH_UID_MISMATCH' }
    const res = await del()
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('sans session → 401 et aucune RPC', async () => {
    state.user = null
    const res = await del()
    expect(res.status).toBe(401)
    expect(state.rpcCalls).toHaveLength(0)
  })
})
