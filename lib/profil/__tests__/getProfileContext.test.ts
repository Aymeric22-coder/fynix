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

// V1.1-PATCH — Le helper somme désormais les 4 sous-postes de charges
// (loyer, autres_credits, charges_fixes, depenses_courantes). La pseudo-
// colonne `charges_mensuelles` n'existe pas sur la table `profiles`.

describe('getProfileContext — 4 cas de complétude', () => {
  it('profil complet (CDI) → charges sommées sur 4 sous-postes', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     3_500,
      loyer:              800,
      autres_credits:     200,
      charges_fixes:      500,
      depenses_courantes: 700,
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

  it('aucun sous-poste de charges → chargesMensuelles = null, le reste OK', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     3_500,
      loyer:              null,
      autres_credits:     null,
      charges_fixes:      null,
      depenses_courantes: null,
      statut_pro:         'Salarié',
      stabilite_revenus:  null,
    })
    const ctx = await getProfileContext(supabase, 'u-1')
    expect(ctx.chargesMensuelles).toBeNull()
    expect(ctx.revenuMensuel).toBe(3_500)
    expect(ctx.statutPro).toBe('cdi')
  })

  it('statut manquant → statutPro = null, charges OK', async () => {
    const supabase = mockSupabase({
      revenu_mensuel:     2_800,
      loyer:              700,
      autres_credits:     0,
      charges_fixes:      300,
      depenses_courantes: 500,
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
      loyer:              null,
      autres_credits:     null,
      charges_fixes:      null,
      depenses_courantes: null,
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

// ──────────────────────────────────────────────────────────────────────
// V1.1-PATCH — Régression visée : cas réel observé en prod sur fynix-mu.
// Un utilisateur Indépendant avec loyer 375 / crédits 0 / charges 500 /
// dépenses 800 voyait l'état « données manquantes » au lieu de la cible
// matelas 6-12 mois × 1 675 € = [10 050 ; 20 100] €.
// ──────────────────────────────────────────────────────────────────────
describe('getProfileContext — V1.1-PATCH régression Aymeric', () => {
  it('charges 375 + 0 + 500 + 800 = 1 675 € (et non null)', async () => {
    const ctx = await getProfileContext(mockSupabase({
      revenu_mensuel:     null,
      loyer:              375,
      autres_credits:     0,
      charges_fixes:      500,
      depenses_courantes: 800,
      statut_pro:         'Indépendant / Freelance',
      stabilite_revenus:  null,
    }), 'u-1')
    expect(ctx.chargesMensuelles).toBe(1_675)
    expect(ctx.statutPro).toBe('independant')
    // Avec un cash de 18 600 € et charges 1 675 €, le helper matelas doit
    // produire cible basse 10 050 (6× charges) et cible haute 20 100 (12×).
    // Test du helper matelas couvert separement dans lib/cash/__tests__/.
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

  it('revenu ≤ 0 → null (et non 0)', async () => {
    const ctx = await getProfileContext(mockSupabase({
      revenu_mensuel:     0,
      loyer:              null,
      autres_credits:     null,
      charges_fixes:      null,
      depenses_courantes: -100, // ignoré silencieusement par le helper
      statut_pro:         'Salarié',
      stabilite_revenus:  null,
    }), 'u-1')
    expect(ctx.revenuMensuel).toBeNull()
    expect(ctx.chargesMensuelles).toBeNull()
  })

  it('charges string-typées (Supabase NUMERIC sérialisé) → parsées', async () => {
    const ctx = await getProfileContext(mockSupabase({
      revenu_mensuel:     '3500',
      loyer:              '800',
      autres_credits:     '0',
      charges_fixes:      '500.25',
      depenses_courantes: '900',
      statut_pro:         'Salarié',
      stabilite_revenus:  null,
    }), 'u-1')
    expect(ctx.revenuMensuel).toBe(3_500)
    expect(ctx.chargesMensuelles).toBe(2_200.25)
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
