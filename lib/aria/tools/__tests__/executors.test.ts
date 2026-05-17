/**
 * Tests des 6 executors de tools ARIA. Logique pure (pas d'I/O hors
 * du dernier executor qui touche wealth_snapshots — supabase mocke).
 */
import { describe, it, expect, vi } from 'vitest'
import { makePatrimoineFixture, makePositionFixture, makeBienFixture } from '../../__tests__/fixtures'

import { executeSimulerNouveauDCA } from '../executors/simulerNouveauDCA'
import { executeSimulerStressTest } from '../executors/simulerStressTest'
import { executeSimulerAcquisitionFuture } from '../executors/simulerAcquisitionFuture'
import { executeChercherPosition } from '../executors/chercherPosition'
import { executeObtenirDetailBien } from '../executors/obtenirDetailBien'
import { executeObtenirHistoriquePatrimoine } from '../executors/obtenirHistoriquePatrimoine'

// ─────────────────────────────────────────────────────────────────
// simulerNouveauDCA
// ─────────────────────────────────────────────────────────────────

describe('executeSimulerNouveauDCA', () => {
  it('retourne ok=false si profil incomplet', async () => {
    const p = makePatrimoineFixture({
      fireInputs: {
        ...makePatrimoineFixture().fireInputs,
        age:                 null,
      },
      projectionFIRESnapshot: null,
    })
    const r = await executeSimulerNouveauDCA(p, { nouveau_dca_mensuel: 1500 })
    expect(r.ok).toBe(false)
    expect(r.raison).toMatch(/profil incomplet/i)
  })

  it('calcule un nouveau patrimoine cible quand DCA augmente', async () => {
    const p = makePatrimoineFixture()
    const r = await executeSimulerNouveauDCA(p, { nouveau_dca_mensuel: 3000 })
    expect(r.ok).toBe(true)
    expect(r.dca_simule).toBe(3000)
    expect(r.dca_actuel).toBeGreaterThan(0)
    // DCA plus eleve -> patrimoine age cible plus eleve
    expect(r.patrimoine_age_cible_simule).toBeGreaterThan(r.patrimoine_age_cible_actuel)
    expect(r.ecart_patrimoine_eur).toBeGreaterThan(0)
  })

  it('plafonne le nouveau DCA a 0 si negatif', async () => {
    const p = makePatrimoineFixture()
    const r = await executeSimulerNouveauDCA(p, { nouveau_dca_mensuel: -500 })
    expect(r.dca_simule).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// simulerStressTest
// ─────────────────────────────────────────────────────────────────

describe('executeSimulerStressTest', () => {
  it('retourne ok=false sur scenario_id inconnu', async () => {
    const r = await executeSimulerStressTest(makePatrimoineFixture(), { scenario_id: 'krach_alien' })
    expect(r.ok).toBe(false)
    expect(r.raison).toMatch(/scenario inconnu/i)
  })

  it('execute crash_marches et expose la perte immediate + age FIRE', async () => {
    const p = makePatrimoineFixture({
      positions: [makePositionFixture({ current_value: 100_000, gain_loss: 0 })],
    })
    const r = await executeSimulerStressTest(p, { scenario_id: 'crash_marches' })
    expect(r.ok).toBe(true)
    expect(r.scenario_id).toBe('crash_marches')
    expect(r.scenario_label).toMatch(/Crash boursier/)
    expect(r.perte_immediate_eur).toBeGreaterThan(0)         // -30 % du portefeuille
    expect(r.patrimoine_choque_eur).toBeLessThan(100_000)
  })

  it('accepte les 6 scenarios canoniques', async () => {
    const ids = ['crash_marches', 'vacance_locative', 'perte_emploi', 'hausse_taux', 'inflation_forte', 'double_peine']
    for (const id of ids) {
      const r = await executeSimulerStressTest(makePatrimoineFixture(), { scenario_id: id })
      expect(r.ok).toBe(true)
      expect(r.scenario_id).toBe(id)
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// simulerAcquisitionFuture
// ─────────────────────────────────────────────────────────────────

describe('executeSimulerAcquisitionFuture', () => {
  it('cree une acquisition coherente et calcule un delta FIRE', async () => {
    const r = await executeSimulerAcquisitionFuture(makePatrimoineFixture(), {
      prix_achat:          200_000,
      apport:              40_000,
      dans_combien_annees: 3,
      type:                'locatif',
      loyer_brut_mensuel:  900,
      duree_credit_ans:    20,
      taux_interet:        3.5,
    })
    expect(r.ok).toBe(true)
    expect(r.acquisition?.prix_achat).toBe(200_000)
    expect(r.acquisition?.type).toBe('locatif')
    expect(r.acquisition?.loyer_brut_mensuel).toBe(900)
  })

  it('met loyer_brut a 0 si type=RP', async () => {
    const r = await executeSimulerAcquisitionFuture(makePatrimoineFixture(), {
      prix_achat:          200_000,
      apport:              40_000,
      dans_combien_annees: 2,
      type:                'RP',
      loyer_brut_mensuel:  1000,                    // sera ignore
      duree_credit_ans:    25,
      taux_interet:        3,
    })
    expect(r.acquisition?.loyer_brut_mensuel).toBe(0)
  })

  it('plafonne dans_combien_annees entre 0 et 20', async () => {
    const r = await executeSimulerAcquisitionFuture(makePatrimoineFixture(), {
      prix_achat: 100_000, apport: 20_000, dans_combien_annees: 99,
      type: 'locatif', loyer_brut_mensuel: 500, duree_credit_ans: 20, taux_interet: 3,
    })
    expect(r.acquisition?.dans_combien_annees).toBe(20)
  })
})

// ─────────────────────────────────────────────────────────────────
// chercherPosition
// ─────────────────────────────────────────────────────────────────

describe('executeChercherPosition', () => {
  it('trouve une position par nom partiel insensible casse', async () => {
    const p = makePatrimoineFixture({
      positions: [
        makePositionFixture({ isin: 'A', name: 'Apple Inc',  current_value: 1000 }),
        makePositionFixture({ isin: 'B', name: 'Microsoft',  current_value: 2000 }),
        makePositionFixture({ isin: 'C', name: 'LVMH',       current_value: 5000 }),
      ],
    })
    const r = await executeChercherPosition(p, { query: 'apple' })
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0]!.nom).toBe('Apple Inc')
  })

  it('trouve par ISIN', async () => {
    const p = makePatrimoineFixture({
      positions: [makePositionFixture({ isin: 'FR0000123456', name: 'X', current_value: 100 })],
    })
    const r = await executeChercherPosition(p, { query: 'fr00001234' })
    expect(r.matches).toHaveLength(1)
  })

  it('plafonne a 5 matches et trie par valeur desc', async () => {
    const positions = Array.from({ length: 10 }).map((_, i) =>
      makePositionFixture({ isin: `I${i}`, name: `Test${i}`, current_value: i * 100 }),
    )
    const p = makePatrimoineFixture({ positions })
    const r = await executeChercherPosition(p, { query: 'test' })
    expect(r.matches).toHaveLength(5)
    expect(r.matches[0]!.valeur_actuelle).toBe(900)
  })

  it('retourne matches vides si query vide', async () => {
    const r = await executeChercherPosition(makePatrimoineFixture(), { query: '' })
    expect(r.matches).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// obtenirDetailBien
// ─────────────────────────────────────────────────────────────────

describe('executeObtenirDetailBien', () => {
  it('trouve un bien par ville', async () => {
    const r = await executeObtenirDetailBien(makePatrimoineFixture(), { query: 'saint-brieuc' })
    expect(r.found).toBe(true)
    expect(r.bien?.ville).toBe('Saint-Brieuc')
  })

  it('retourne candidats si ambigu', async () => {
    const p = makePatrimoineFixture({
      biens: [
        makeBienFixture({ id: '1', nom: 'Studio Paris',      ville: 'Paris' }),
        makeBienFixture({ id: '2', nom: 'T2 Paris',          ville: 'Paris' }),
      ],
    })
    const r = await executeObtenirDetailBien(p, { query: 'paris' })
    expect(r.found).toBe(false)
    expect(r.candidates_si_ambigu).toHaveLength(2)
  })

  it('found=false si aucun match', async () => {
    const r = await executeObtenirDetailBien(makePatrimoineFixture(), { query: 'introuvable-xxx' })
    expect(r.found).toBe(false)
    expect(r.bien).toBeUndefined()
  })

  it('liste tous les biens si query vide', async () => {
    const r = await executeObtenirDetailBien(makePatrimoineFixture(), { query: '' })
    expect(r.candidates_si_ambigu?.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// obtenirHistoriquePatrimoine (mock supabase)
// ─────────────────────────────────────────────────────────────────

interface SnapshotRow { snapshot_date: string; patrimoine_net: number; patrimoine_brut: number; total_dettes: number }

function makeSupabaseStub(rows: SnapshotRow[], error: { message: string } | null = null) {
  return {
    from() {
      const builder = {
        select() { return builder },
        eq()     { return builder },
        gte()    { return builder },
        order: async () => ({ data: rows, error }),
      }
      return builder
    },
  }
}

describe('executeObtenirHistoriquePatrimoine', () => {
  it('renvoie un echantillon avec variation calculee', async () => {
    const rows: SnapshotRow[] = [
      { snapshot_date: '2026-04-01', patrimoine_net: 100_000, patrimoine_brut: 130_000, total_dettes: 30_000 },
      { snapshot_date: '2026-04-15', patrimoine_net: 105_000, patrimoine_brut: 135_000, total_dettes: 30_000 },
      { snapshot_date: '2026-05-01', patrimoine_net: 110_000, patrimoine_brut: 140_000, total_dettes: 30_000 },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await executeObtenirHistoriquePatrimoine(makeSupabaseStub(rows) as any, 'user-1', { jours: 60 })
    expect(r.ok).toBe(true)
    expect(r.nb_points).toBe(3)
    expect(r.premier_point?.patrimoine_net).toBe(100_000)
    expect(r.dernier_point?.patrimoine_net).toBe(110_000)
    expect(r.variation_eur).toBe(10_000)
    expect(r.variation_pct).toBe(10)
  })

  it('gere absence de snapshots', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await executeObtenirHistoriquePatrimoine(makeSupabaseStub([]) as any, 'user-1', { jours: 30 })
    expect(r.ok).toBe(true)
    expect(r.nb_points).toBe(0)
    expect(r.points).toEqual([])
  })

  it('renvoie ok=false sur erreur supabase', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await executeObtenirHistoriquePatrimoine(makeSupabaseStub([], { message: 'rls denied' }) as any, 'user-1', {})
    expect(r.ok).toBe(false)
    expect(r.raison).toContain('rls denied')
  })

  it('plafonne jours a [1, 120]', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await executeObtenirHistoriquePatrimoine(makeSupabaseStub([]) as any, 'user-1', { jours: 9999 })
    expect(r.jours_demandes).toBe(120)
  })
})

// ─────────────────────────────────────────────────────────────────
// Dispatcher executeTool
// ─────────────────────────────────────────────────────────────────

describe('executeTool dispatcher', () => {
  it('renvoie success=false pour un tool inconnu', async () => {
    const { executeTool } = await import('../index')
    const r = await executeTool('inexistant', {}, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: {} as any,
      userId:   'u',
      patrimoine: makePatrimoineFixture(),
    })
    expect(r.success).toBe(false)
    expect((r.data as { error: string }).error).toMatch(/inconnu/i)
  })

  it('capture les exceptions des executors', async () => {
    const { executeTool } = await import('../index')
    vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ })
    const r = await executeTool('obtenirHistoriquePatrimoine', { jours: 30 }, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { from() { throw new Error('boom DB') } } as any,
      userId:   'u',
      patrimoine: makePatrimoineFixture(),
    })
    expect(r.success).toBe(false)
  })

  it('route un tool connu', async () => {
    const { executeTool } = await import('../index')
    const r = await executeTool('chercherPosition', { query: 'apple' }, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: {} as any,
      userId:   'u',
      patrimoine: makePatrimoineFixture(),
    })
    expect(r.success).toBe(true)
  })
})
