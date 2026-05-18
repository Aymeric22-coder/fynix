/**
 * Tests de fetchUserData : verifie le comportement parallele et
 * la robustesse aux erreurs partielles (safeQuery).
 *
 * On mocke `getPatrimoineComplet` (sinon il tente d'ouvrir une vraie
 * connexion Supabase) et on fournit un faux client Supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makePatrimoineFixture } from './fixtures'

vi.mock('@/lib/analyse/aggregateur', () => ({
  getPatrimoineComplet: vi.fn(),
}))

import { fetchUserData } from '../fetchUserData'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'

// ── Helpers ──────────────────────────────────────────────────────

interface QueryStub {
  data:  unknown[]
  error: { message: string } | null
}

function makeSupabaseStub(stubs: Record<string, QueryStub | (() => Promise<QueryStub>)>) {
  return {
    from(table: string) {
      const resolve = () => {
        const v = stubs[table]
        // Stub manquant -> fallback silencieux : evite de polluer les tests
        // qui n'ont besoin que d'une ou deux tables specifiques.
        if (!v) return Promise.resolve({ data: [], error: null } as QueryStub)
        return typeof v === 'function' ? v() : Promise.resolve(v)
      }
      const builder = {
        select() { return builder },
        eq()     { return builder },
        neq()    { return builder },
        not()    { return builder },
        ilike()  { return builder },
        gte()    { return builder },
        order()  { return builder },
        limit:   resolve,
      }
      return builder
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchUserData', () => {
  it('appelle getPatrimoineComplet, wealth_snapshots et user_activity_log', async () => {
    const fakePatrimoine = makePatrimoineFixture()
    vi.mocked(getPatrimoineComplet).mockResolvedValue(fakePatrimoine)

    const sb = makeSupabaseStub({
      wealth_snapshots:  { data: [{ snapshot_date: '2026-05-01', patrimoine_net: 50_000, patrimoine_brut: 80_000, total_dettes: 30_000 }], error: null },
      user_activity_log: { data: [{ id: 'a1', type: 'ajout_position', description: 'Test', metadata: {}, created_at: '2026-05-15T10:00:00Z' }], error: null },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchUserData(sb as any, 'user-1')

    expect(getPatrimoineComplet).toHaveBeenCalledWith('user-1')
    expect(raw.patrimoine).toBe(fakePatrimoine)
    expect(raw.snapshots).toHaveLength(1)
    expect(raw.snapshots[0]!.patrimoine_net).toBe(50_000)
    expect(raw.activites).toHaveLength(1)
    expect(raw.activites[0]!.description).toBe('Test')
  })

  it('renvoie [] pour snapshots si la query erreur (safeQuery)', async () => {
    vi.mocked(getPatrimoineComplet).mockResolvedValue(makePatrimoineFixture())

    const sb = makeSupabaseStub({
      wealth_snapshots:  { data: [], error: { message: 'table missing' } },
      user_activity_log: { data: [], error: null },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchUserData(sb as any, 'user-1')
    expect(raw.snapshots).toEqual([])
    expect(raw.activites).toEqual([])
  })

  it('renvoie [] pour activites si la query throw', async () => {
    vi.mocked(getPatrimoineComplet).mockResolvedValue(makePatrimoineFixture())

    const sb = makeSupabaseStub({
      wealth_snapshots:  { data: [], error: null },
      user_activity_log: () => Promise.reject(new Error('boom')),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchUserData(sb as any, 'user-1')
    expect(raw.activites).toEqual([])
  })

  it('propage l\'erreur de getPatrimoineComplet (donnee indispensable)', async () => {
    vi.mocked(getPatrimoineComplet).mockRejectedValue(new Error('aggregat KO'))
    const sb = makeSupabaseStub({
      wealth_snapshots:  { data: [], error: null },
      user_activity_log: { data: [], error: null },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(fetchUserData(sb as any, 'user-1')).rejects.toThrow('aggregat KO')
  })

  it('charge les conversations passees avec summary (Phase 4)', async () => {
    vi.mocked(getPatrimoineComplet).mockResolvedValue(makePatrimoineFixture())
    const sb = makeSupabaseStub({
      aria_conversations: { data: [
        { id: 'c1', summary: 'Discussion DCA', last_message_at: '2026-05-10T10:00:00Z' },
        { id: 'c2', summary: 'Question LMNP',  last_message_at: '2026-05-05T10:00:00Z' },
      ], error: null },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchUserData(sb as any, 'user-1')
    expect(raw.conversations_passees).toHaveLength(2)
    expect(raw.conversations_passees[0]!.summary).toBe('Discussion DCA')
  })

  it('charge les insights persistants (Phase 4)', async () => {
    vi.mocked(getPatrimoineComplet).mockResolvedValue(makePatrimoineFixture())
    const sb = makeSupabaseStub({
      aria_user_insights: { data: [
        { insight_type: 'preoccupation', insight: 'Stresse securite', confidence: 0.85, last_confirmed_at: '2026-05-15T10:00:00Z' },
        { insight_type: 'objectif',      insight: 'FIRE 50 ans',      confidence: 0.7,  last_confirmed_at: '2026-05-10T10:00:00Z' },
      ], error: null },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchUserData(sb as any, 'user-1')
    expect(raw.insights_persistants).toHaveLength(2)
    expect(raw.insights_persistants[0]!.type).toBe('preoccupation')
    expect(raw.insights_persistants[0]!.confidence).toBeCloseTo(0.85)
  })

  it('fallback [] si query insights ou conversations echoue', async () => {
    vi.mocked(getPatrimoineComplet).mockResolvedValue(makePatrimoineFixture())
    const sb = makeSupabaseStub({
      aria_conversations: { data: [], error: { message: 'rls' } },
      aria_user_insights: () => Promise.reject(new Error('boom')),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await fetchUserData(sb as any, 'user-1')
    expect(raw.conversations_passees).toEqual([])
    expect(raw.insights_persistants).toEqual([])
  })

  it('execute les queries Supabase en parallele', async () => {
    vi.mocked(getPatrimoineComplet).mockResolvedValue(makePatrimoineFixture())

    let startedSnapshots = 0
    let startedActivites = 0
    let endedSnapshots = false
    let endedActivites = false

    const sb = makeSupabaseStub({
      wealth_snapshots: () => {
        startedSnapshots = Date.now()
        return new Promise<QueryStub>((resolve) => setTimeout(() => {
          endedSnapshots = true
          resolve({ data: [], error: null })
        }, 50))
      },
      user_activity_log: () => {
        startedActivites = Date.now()
        return new Promise<QueryStub>((resolve) => setTimeout(() => {
          endedActivites = true
          resolve({ data: [], error: null })
        }, 50))
      },
    })

    const t0 = Date.now()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await fetchUserData(sb as any, 'user-1')
    const elapsed = Date.now() - t0

    // Si les queries etaient sequentielles, elapsed ~ 100 ms.
    // En parallele, elapsed ~ 50 ms. On tolere 90 ms pour la lenteur CI.
    expect(elapsed).toBeLessThan(90)
    expect(endedSnapshots).toBe(true)
    expect(endedActivites).toBe(true)
    // Les deux queries demarrent dans la meme tranche (<10 ms d'ecart).
    expect(Math.abs(startedSnapshots - startedActivites)).toBeLessThan(10)
  })
})
