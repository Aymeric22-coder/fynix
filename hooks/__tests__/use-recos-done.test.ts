/* @vitest-environment jsdom */
/**
 * Tests du hook useRecosDone : optimistic update + rollback réseau.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRecosDone } from '../use-recos-done'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('useRecosDone', () => {
  beforeEach(() => {
    // Par défaut : GET renvoie 2 clés actives.
    globalThis.fetch = vi.fn(async (input: Request | URL | string) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input)
      if (url.endsWith('/api/recos/done')) {
        return new Response(
          JSON.stringify({ data: { recoKeys: ['pea-non-ouvert', 'cash-excessif'] }, error: null }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
  })

  it('charge les recoKeys au montage et passe loading à false', async () => {
    const { result } = renderHook(() => useRecosDone())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(Array.from(result.current.doneKeys).sort()).toEqual(['cash-excessif', 'pea-non-ouvert'])
    expect(result.current.error).toBeNull()
  })

  it('toggle(key, true) applique optimistic update AVANT que fetch ne résolve', async () => {
    // POST très lent : on contrôle la résolution via une promesse externe.
    let resolvePost: (v: Response) => void = () => {}
    const postPromise = new Promise<Response>((r) => { resolvePost = r })

    globalThis.fetch = vi.fn(async (input: Request | URL | string, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input)
      if (init?.method === 'POST' && url.endsWith('/api/recos/done')) {
        return postPromise
      }
      return new Response(
        JSON.stringify({ data: { recoKeys: [] }, error: null }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useRecosDone())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.doneKeys.has('new-key')).toBe(false)

    // Lance le toggle SANS attendre — l'optimistic doit s'appliquer immédiatement
    let togglePromise: Promise<void>
    act(() => {
      togglePromise = result.current.toggle('new-key', true)
    })
    expect(result.current.doneKeys.has('new-key')).toBe(true)

    // Résout le POST → pas de rollback
    await act(async () => {
      resolvePost(new Response(
        JSON.stringify({ data: { ok: true }, error: null }),
        { status: 200 },
      ))
      await togglePromise!
    })
    expect(result.current.doneKeys.has('new-key')).toBe(true)
  })

  it('toggle(key, true) → erreur HTTP 500 ⇒ rollback du state', async () => {
    globalThis.fetch = vi.fn(async (input: Request | URL | string, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input)
      if (init?.method === 'POST' && url.endsWith('/api/recos/done')) {
        return new Response(
          JSON.stringify({ data: null, error: 'boom' }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({ data: { recoKeys: [] }, error: null }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useRecosDone())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggle('rolled-back', true)
    })

    // Rollback effectif : la clé n'est PAS dans doneKeys après l'erreur
    expect(result.current.doneKeys.has('rolled-back')).toBe(false)
  })

  it('toggle erreur réseau (fetch reject) ⇒ rollback', async () => {
    globalThis.fetch = vi.fn(async (input: Request | URL | string, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input)
      if (init?.method === 'POST' && url.endsWith('/api/recos/done')) {
        throw new Error('network down')
      }
      return new Response(
        JSON.stringify({ data: { recoKeys: ['a'] }, error: null }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useRecosDone())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggle('a', false) // tentative de retirer
    })
    // Rollback : 'a' est toujours dans doneKeys
    expect(result.current.doneKeys.has('a')).toBe(true)
  })

  it('GET retourne une erreur → loading=false + error renseigné', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: null, error: 'no auth' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useRecosDone())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('no auth')
    expect(result.current.doneKeys.size).toBe(0)
  })
})
