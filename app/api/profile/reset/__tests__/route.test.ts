/**
 * Tests de la route POST /api/profile/reset.
 *
 * Vérifie :
 *   - Le payload UPDATE wipe les champs wizard + onboarding 60s.
 *   - Préserve display_name, email_monthly_report, email_unsubscribe_token,
 *     id (= pas écrits par l'UPDATE).
 *   - wizard_step_completed = 0, profile_completed_at = null.
 *   - onboarding_quick_done = false, onboarding_quick_data = null.
 *   - Réponse 200 + redirect = '/bienvenue'.
 *   - WHERE id = user.id (RLS ceinture-bretelles).
 *   - Aucune autre table touchée (mock from() compte les appels par table).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updates:    Array<Record<string, unknown>> = []
const tablesHit:  string[] = []
const whereChain: Array<{ col: string; val: unknown }> = []
let mockUpdateError: { message: string } | null = null

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    from: (table: string) => {
      tablesHit.push(table)
      return {
        update: (arg: Record<string, unknown>) => {
          updates.push(arg)
          return {
            eq: (col: string, val: unknown) => {
              whereChain.push({ col, val })
              return Promise.resolve({ error: mockUpdateError })
            },
          }
        },
      }
    },
  })),
}))

vi.mock('@/lib/utils/api', () => ({
  withAuth: (h: (req: Request, user: { id: string }) => Promise<Response>) =>
    (req: Request) => h(req, { id: 'user-reset' }),
  ok:  (data: unknown) => Response.json({ data, error: null }),
  err: (message: string, status = 400) =>
    Response.json({ data: null, error: message }, { status }),
}))

import { POST, RESET_WIPE_PAYLOAD } from '../route'

beforeEach(() => {
  updates.length = 0
  tablesHit.length = 0
  whereChain.length = 0
  mockUpdateError = null
})

function req(): Request {
  return new Request('http://localhost/api/profile/reset', { method: 'POST' })
}

describe('POST /api/profile/reset', () => {
  it('renvoie 200 + redirect=/bienvenue', async () => {
    const res = await POST(req(), {} as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.ok).toBe(true)
    expect(json.data.redirect).toBe('/bienvenue')
  })

  it('touche UNIQUEMENT la table profiles (aucune autre table)', async () => {
    await POST(req(), {} as never)
    expect(tablesHit).toEqual(['profiles'])
  })

  it('UPDATE WHERE id = user.id (RLS ceinture-bretelles)', async () => {
    await POST(req(), {} as never)
    expect(whereChain).toEqual([{ col: 'id', val: 'user-reset' }])
  })

  it('wipe tous les champs wizard (Step 1 à 9)', async () => {
    await POST(req(), {} as never)
    const payload = updates[0]!

    // Step 1
    expect(payload.prenom).toBeNull()
    expect(payload.age).toBeNull()
    expect(payload.situation_familiale).toBeNull()
    expect(payload.enfants).toBeNull()
    expect(payload.statut_pro).toBeNull()
    // Step 2
    expect(payload.revenu_mensuel).toBeNull()
    expect(payload.revenu_conjoint).toBeNull()
    expect(payload.autres_revenus).toBeNull()
    expect(payload.stabilite_revenus).toBeNull()
    // Step 3
    expect(payload.loyer).toBeNull()
    expect(payload.autres_credits).toBeNull()
    expect(payload.charges_fixes).toBeNull()
    expect(payload.depenses_courantes).toBeNull()
    // Step 4
    expect(payload.epargne_mensuelle).toBeNull()
    expect(payload.enveloppes).toEqual([])
    // Step 5/6/7
    expect(payload.quiz_bourse).toEqual([])
    expect(payload.quiz_crypto).toEqual([])
    expect(payload.quiz_immo).toEqual([])
    expect(payload.quiz_self_declared_domains).toEqual([])
    // Step 8
    expect(payload.risk_1).toBeNull()
    expect(payload.risk_2).toBeNull()
    expect(payload.risk_3).toBeNull()
    expect(payload.risk_4).toBeNull()
    expect(payload.fire_type).toBeNull()
    expect(payload.revenu_passif_cible).toBeNull()
    expect(payload.age_cible).toBeNull()
    expect(payload.priorite).toBeNull()
    // Step 9 (CS1)
    expect(payload.tmi_rate).toBeNull()
  })

  it('reset les sentinelles wizard (step=0, profile_completed_at=null)', async () => {
    await POST(req(), {} as never)
    const payload = updates[0]!
    expect(payload.wizard_step_completed).toBe(0)
    expect(payload.profile_completed_at).toBeNull()
  })

  it('reset onboarding 60s (quick_done=false, quick_data=null)', async () => {
    await POST(req(), {} as never)
    const payload = updates[0]!
    expect(payload.onboarding_quick_done).toBe(false)
    expect(payload.onboarding_quick_data).toBeNull()
  })

  it('wipe les colonnes legacy (QW1 invest_mensuel + CS1 fiscal_*)', async () => {
    await POST(req(), {} as never)
    const payload = updates[0]!
    expect(payload.invest_mensuel).toBeNull()
    expect(payload.fiscal_situation).toBeNull()
    expect(payload.professional_income_eur).toBe(0)
    expect(payload.foyer_fiscal_parts).toBe(1.0)
  })

  it('PRÉSERVE les champs hors wipe (display_name, email_*, etc.)', async () => {
    await POST(req(), {} as never)
    const payload = updates[0]!
    // Ces clés NE doivent PAS être présentes dans le payload UPDATE :
    // si elles n'y sont pas, Supabase ne les touche pas.
    expect('display_name' in payload).toBe(false)
    expect('email_monthly_report' in payload).toBe(false)
    expect('email_unsubscribe_token' in payload).toBe(false)
    expect('reference_currency' in payload).toBe(false)
    expect('last_monthly_report_sent_at' in payload).toBe(false)
    expect('id' in payload).toBe(false)
    expect('created_at' in payload).toBe(false)
    expect('updated_at' in payload).toBe(false)
  })

  it('payload exporté RESET_WIPE_PAYLOAD est utilisé tel quel', async () => {
    await POST(req(), {} as never)
    expect(updates[0]).toEqual(RESET_WIPE_PAYLOAD)
  })

  it('erreur Supabase → 500 avec message', async () => {
    mockUpdateError = { message: 'boom' }
    const res = await POST(req(), {} as never)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toContain('boom')
  })
})
