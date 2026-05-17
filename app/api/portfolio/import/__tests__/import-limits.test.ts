/**
 * Tests des limites de l'import CSV (Sprint 2 — D14).
 *
 * On teste la route en mode "unit" : on lui construit des Request directs et
 * on remplace `withAuth` par un mock qui appelle directement le handler.
 *
 * Note : on ne lance PAS le pipeline Supabase ici ; on se contente de
 * verifier que les limites taille / lignes / body Zod ont l'effet attendu
 * AVANT toute interaction DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        in: async () => ({ data: [] }),
      }),
      insert: () => ({
        select: () => ({ maybeSingle: async () => ({ data: { id: 'mock' } }) }),
      }),
    }),
  })),
}))

vi.mock('@/lib/utils/api', () => ({
  // Bypass auth : on appelle le handler directement.
  withAuth: (h: (req: Request, user: { id: string }) => Promise<Response>) =>
    (req: Request) => h(req, { id: 'user-1' }),
  ok:  (data: unknown) => Response.json({ data }),
  err: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}))

vi.mock('@/lib/analyse/isinEnricher', () => ({
  enrichISIN: vi.fn(async () => ({ name: 'X', asset_type: 'stock' })),
}))

import { POST } from '../route'
import { MAX_CSV_BYTES, MAX_CSV_LINES } from '@/lib/portfolio/importLimits'

function jsonRequest(body: unknown, opts: { contentLength?: number } = {}): Request {
  const json = JSON.stringify(body)
  const headers = new Headers({ 'content-type': 'application/json' })
  if (opts.contentLength !== undefined) {
    headers.set('content-length', String(opts.contentLength))
  } else {
    headers.set('content-length', String(json.length))
  }
  return new Request('http://localhost/api/portfolio/import', {
    method: 'POST', headers, body: json,
  })
}

describe('POST /api/portfolio/import — limites D14', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('Content-Length > 5 Mo + 1 → 413', async () => {
    const req = jsonRequest({}, { contentLength: MAX_CSV_BYTES + 1 })
    const res = await POST(req as never, {} as never)
    expect(res.status).toBe(413)
    const json = await res.json()
    expect(json.error).toMatch(/trop volumineux/i)
  })

  it('CSV > 5 000 lignes → 422', async () => {
    // 5001 lignes = 5000 \n + ligne finale
    const csv = 'a;b\n' + 'x;y\n'.repeat(MAX_CSV_LINES + 1)
    const req = jsonRequest({ csv })
    const res = await POST(req as never, {} as never)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toMatch(/trop long/i)
  })

  it('CSV de 4 999 lignes ne declenche pas la limite 422', async () => {
    const csv = 'a;b\n' + 'x;y\n'.repeat(MAX_CSV_LINES - 2) + 'x;y'
    const req = jsonRequest({ csv })
    const res = await POST(req as never, {} as never)
    // Pas 422 (limite OK). Peut etre 200 (ok summary vide) ou 400 si parser refuse.
    expect(res.status).not.toBe(422)
    expect(res.status).not.toBe(413)
  })

  it('Body Zod invalide → 400 avec message lisible', async () => {
    const req = jsonRequest({ excludedIds: 'not-an-array' })
    const res = await POST(req as never, {} as never)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/excludedIds/)
  })
})
