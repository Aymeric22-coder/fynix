/**
 * Tests `getProfileContext` (Cash V1.1, Volet C.1).
 *
 * Couvre :
 *   - 4 cas de complétude (profil complet / charges null / statut null / tout null)
 *   - Mapping libellés DB FR → enums (StatutPro, StabiliteRevenus)
 *   - Robustesse : ligne profile inexistante, erreur Supabase, valeurs ≤ 0
 */
import { describe, it, expect } from 'vitest'
import {
  getProfileContext,
  mapStatutProToEnum,
  mapStabiliteToEnum,
} from '../getProfileContext'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Fake Supabase qui retourne une seule ligne profil. */
function mockSupabase(profileRow: Record<string, unknown> | null, throwOnSelect = false): SupabaseClient {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq:     () => builder,
    maybeSingle: async () => {
      if (throwOnSelect) throw new Error('boom')
      return { data: profileRow, error: null }
    },
  }
  return { from: () => builder } as unknown as SupabaseClient
}

describe('getProfileContext — 4 cas de complétude', () => {
  it('profil complet (CDI) → tous les champs remplis', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     3_500,
      charges_mensuelles: 2_200,
      statut_pro:         'Salarié',
      stabilite_revenus:  'Très stables (CDI)',
    })
    const ctx = await getProfileContext(supabase, 'u-1')
    expect(ctx).toEqual({
      revenuMensuel:     3_500,
      chargesMensuelles: 2_200,
      statutPro:         'cdi',
      stabiliteRevenus:  'stable',
    })
  })

  it('charges manquantes → chargesMensuelles = null, le reste OK', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     3_500,
      charges_mensuelles: null,
      statut_pro:         'Salarié',
      stabilite_revenus:  null,
    })
    const ctx = await getProfileContext(supabase, 'u-1')
    expect(ctx.chargesMensuelles).toBeNull()
    expect(ctx.revenuMensuel).toBe(3_500)
    expect(ctx.statutPro).toBe('cdi')
  })

  it('statut manquant → statutPro = null, le reste OK', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     2_800,
      charges_mensuelles: 1_500,
      statut_pro:         null,
      stabilite_revenus:  null,
    })
    const ctx = await getProfileContext(supabase, 'u-1')
    expect(ctx.statutPro).toBeNull()
    expect(ctx.chargesMensuelles).toBe(1_500)
  })

  it('tout null → contexte tout null (pas de throw)', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     null,
      charges_mensuelles: null,
      statut_pro:         null,
      stabilite_revenus:  null,
    })
    const ctx = await getProfileContext(supabase, 'u-1')
    expect(ctx).toEqual({
      revenuMensuel:     null,
      chargesMensuelles: null,
      statutPro:         null,
      stabiliteRevenus:  null,
    })
  })
})

describe('getProfileContext — robustesse', () => {
  it('ligne profile inexistante → tout null', async () => {
    const ctx = await getProfileContext(mockSupabase(null), 'u-1')
    expect(ctx.revenuMensuel).toBeNull()
    expect(ctx.statutPro).toBeNull()
  })

  it('erreur Supabase → tout null, pas de throw', async () => {
    const ctx = await getProfileContext(mockSupabase(null, true), 'u-1')
    expect(ctx.statutPro).toBeNull()
  })

  it('valeurs ≤ 0 → null (et non 0)', async () => {
    const ctx = await getProfileContext(mockSupabase({
      revenu_mensuel:     0,
      charges_mensuelles: -100,
      statut_pro:         'Salarié',
      stabilite_revenus:  null,
    }), 'u-1')
    expect(ctx.revenuMensuel).toBeNull()
    expect(ctx.chargesMensuelles).toBeNull()
  })

  it('valeurs string-typées (Supabase NUMERIC) → parsées', async () => {
    const ctx = await getProfileContext(mockSupabase({
      revenu_mensuel:     '3500',
      charges_mensuelles: '2200.50',
      statut_pro:         'Salarié',
      stabilite_revenus:  null,
    }), 'u-1')
    expect(ctx.revenuMensuel).toBe(3_500)
    expect(ctx.chargesMensuelles).toBe(2_200.5)
  })
})

describe('mapStatutProToEnum — libellés wizard FR', () => {
  it.each([
    ['Salarié',                  'cdi'],
    ['Indépendant / Freelance',  'independant'],
    ["Chef d'entreprise",        'dirigeant'],
    ['Retraité',                 'retraite'],
    ['Autre',                    'autre'],
  ] as const)('« %s » → %s', (input, expected) => {
    expect(mapStatutProToEnum(input)).toBe(expected)
  })

  it('inconnu → null', () => {
    expect(mapStatutProToEnum('Astronaute')).toBeNull()
  })

  it('null / vide → null', () => {
    expect(mapStatutProToEnum(null)).toBeNull()
    expect(mapStatutProToEnum('')).toBeNull()
  })

  it('reconnaît aussi les valeurs canoniques snake_case', () => {
    expect(mapStatutProToEnum('cdi')).toBe('cdi')
    expect(mapStatutProToEnum('dirigeant')).toBe('dirigeant')
  })
})

describe('mapStabiliteToEnum — libellés wizard FR', () => {
  it.each([
    ['Très stables (CDI)',       'stable'],
    ['Stables mais variables',   'moyenne'],
    ['Irréguliers',              'instable'],
    ['Très variables',           'instable'],
    ['Chômage longue durée',     'instable'],
  ] as const)('« %s » → %s', (input, expected) => {
    expect(mapStabiliteToEnum(input)).toBe(expected)
  })

  it('null / vide / inconnu → null', () => {
    expect(mapStabiliteToEnum(null)).toBeNull()
    expect(mapStabiliteToEnum('')).toBeNull()
    expect(mapStabiliteToEnum('???')).toBeNull()
  })
})
