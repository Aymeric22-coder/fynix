/**
 * Tests du mapping PatrimoineComplet -> AriaLiveContext.
 * Logique pure, fixtures uniquement, pas d'I/O.
 */
import { describe, it, expect } from 'vitest'
import { buildContextFromRaw } from '../computeMetrics'
import { makePatrimoineFixture, makePositionFixture, makeBienFixture, makeCompteFixture, makeScoresFixture, makeRecommandationFixture } from './fixtures'
import type { AriaRawData, AriaWealthSnapshotRow } from '../types'

const REF_DATE = new Date('2026-05-17T10:00:00.000Z')

function makeRaw(overrides: Partial<AriaRawData> = {}): AriaRawData {
  return {
    patrimoine: makePatrimoineFixture(),
    snapshots:  [],
    activites:  [],
    conversations_passees: [],
    insights_persistants:  [],
    ...overrides,
  }
}

describe('buildContextFromRaw — profil', () => {
  it('mappe correctement les champs profil', () => {
    const ctx = buildContextFromRaw(makeRaw(), { section: 'dashboard' }, REF_DATE)
    expect(ctx.profil.prenom).toBe('Aymeric')
    expect(ctx.profil.age).toBe(35)
    expect(ctx.profil.age_fire_cible).toBe(50)
    expect(ctx.profil.type_investisseur).toBe('Equilibre')
    expect(ctx.profil.tolerance_risque).toBe(60)
    expect(ctx.profil.revenu_passif_objectif).toBe(3000)
    expect(ctx.profil.tmi_rate).toBe(0.30)
  })
})

describe('buildContextFromRaw — patrimoine', () => {
  it('expose totaux brut/net/dettes', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    expect(ctx.patrimoine.brut).toBeGreaterThan(0)
    expect(ctx.patrimoine.net).toBe(ctx.patrimoine.brut - ctx.patrimoine.dettes)
  })

  it('renvoie null pour evolution sans snapshot', () => {
    const ctx = buildContextFromRaw(makeRaw({ snapshots: [] }), null, REF_DATE)
    expect(ctx.patrimoine.evolution_30j_pct).toBeNull()
    expect(ctx.patrimoine.evolution_90j_pct).toBeNull()
  })

  it('calcule evolution 30j depuis snapshot recent', () => {
    const snap30: AriaWealthSnapshotRow = {
      snapshot_date:   '2026-04-17',         // exactement 30j avant REF_DATE
      patrimoine_net:  50_000,
      patrimoine_brut: 80_000,
      total_dettes:    30_000,
    }
    const patrimoine = makePatrimoineFixture()
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [snap30], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    // attendu: ((totalNet - 50_000) / 50_000) * 100
    const attendu = ((patrimoine.totalNet - 50_000) / 50_000) * 100
    expect(ctx.patrimoine.evolution_30j_pct).toBeCloseTo(attendu, 1)
  })

  it('ignore les snapshots trop anciens (>14 jours du target)', () => {
    const snap: AriaWealthSnapshotRow = {
      snapshot_date:   '2026-01-01',
      patrimoine_net:  10_000,
      patrimoine_brut: 20_000,
      total_dettes:    10_000,
    }
    const ctx = buildContextFromRaw(makeRaw({ snapshots: [snap] }), null, REF_DATE)
    expect(ctx.patrimoine.evolution_30j_pct).toBeNull()
  })
})

describe('buildContextFromRaw — portefeuille', () => {
  it('trie le top 3 par valeur descendante', () => {
    const positions = [
      makePositionFixture({ isin: 'A', name: 'AAA', current_value: 100 }),
      makePositionFixture({ isin: 'B', name: 'BBB', current_value: 500 }),
      makePositionFixture({ isin: 'C', name: 'CCC', current_value: 300 }),
      makePositionFixture({ isin: 'D', name: 'DDD', current_value: 50 }),
    ]
    const patrimoine = makePatrimoineFixture({ positions })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.portefeuille.nb_positions).toBe(4)
    expect(ctx.portefeuille.top_3_par_valeur.map((p) => p.ticker)).toEqual(['B', 'C', 'A'])
  })

  it('agrege la +/- value latente totale', () => {
    const positions = [
      makePositionFixture({ gain_loss: 200 }),
      makePositionFixture({ gain_loss: -50 }),
      makePositionFixture({ gain_loss: 100 }),
    ]
    const ctx = buildContextFromRaw({ patrimoine: makePatrimoineFixture({ positions }), snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.portefeuille.pv_latente_totale).toBe(250)
  })

  it('plafonne secteurs et geo a 8 entrees', () => {
    const repartitionSectorielle = Array.from({ length: 12 }).map((_, i) => ({
      secteur: `Sec${i}`, valeur: 100, pourcentage: 8.3, benchmark: 5, deviation: 3, status: 'aligned' as const,
      positions: [], alerte: false,
    }))
    const ctx = buildContextFromRaw({ patrimoine: makePatrimoineFixture({ repartitionSectorielle }), snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.portefeuille.repartition_secteurs.length).toBe(8)
  })
})

describe('buildContextFromRaw — immo', () => {
  it('agrege les loyers annuels et expose biens', () => {
    const biens = [
      makeBienFixture({ id: '1', loyer_mensuel: 600 }),
      makeBienFixture({ id: '2', loyer_mensuel: 800 }),
    ]
    const ctx = buildContextFromRaw({ patrimoine: makePatrimoineFixture({ biens }), snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.immo.nb_biens).toBe(2)
    expect(ctx.immo.loyers_annuels_totaux).toBe((600 + 800) * 12)
  })

  it('normalise niveau_levier "Sans crédit" en "Sans credit"', () => {
    const biens = [makeBienFixture({ niveau_levier: 'Sans crédit', credit_restant: 0 })]
    const ctx = buildContextFromRaw({ patrimoine: makePatrimoineFixture({ biens }), snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.immo.biens[0]!.niveau_levier).toBe('Sans credit')
  })

  it('gere absence de biens', () => {
    const ctx = buildContextFromRaw({ patrimoine: makePatrimoineFixture({ biens: [] }), snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.immo.nb_biens).toBe(0)
    expect(ctx.immo.biens).toEqual([])
    expect(ctx.immo.loyers_annuels_totaux).toBe(0)
  })
})

describe('buildContextFromRaw — cash', () => {
  it('calcule les mois de precaution', () => {
    // charges = 2000, totalCash = 5000 -> 2.5 mois (avec revenuPassifImmo = -50 -> +50 -> 2050)
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    expect(ctx.cash.mois_precaution).not.toBeNull()
    expect(ctx.cash.mois_precaution!).toBeGreaterThan(2)
    expect(ctx.cash.mois_precaution!).toBeLessThan(3)
    expect(ctx.cash.cash_excessif).toBe(false)
  })

  it('detecte le cash excessif (>12 mois)', () => {
    const patrimoine = makePatrimoineFixture({
      comptes: [makeCompteFixture({ solde: 100_000 })],
    })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.cash.cash_excessif).toBe(true)
  })

  it('renvoie null si charges nulles', () => {
    const patrimoine = makePatrimoineFixture({
      fireInputs: { ...makePatrimoineFixture().fireInputs, charges_mensuelles: 0 },
      revenuPassifImmo: 0,
    })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.cash.mois_precaution).toBeNull()
  })
})

describe('buildContextFromRaw — fire', () => {
  it('expose la cible FIRE et calcule la progression', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    expect(ctx.fire.cible_patrimoine).toBe(900_000)
    expect(ctx.fire.age_fire_estime).toBe(50)
    expect(ctx.fire.age_fire_optimiste).toBe(47)
    expect(ctx.fire.age_fire_pessimiste).toBe(55)
    expect(ctx.fire.annees_restantes).toBe(15)
    expect(ctx.fire.progression_pct).not.toBeNull()
  })

  it('gere absence de projection FIRE', () => {
    const patrimoine = makePatrimoineFixture({ projectionFIRESnapshot: null })
    const ctx = buildContextFromRaw({ patrimoine, snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    expect(ctx.fire.age_fire_estime).toBeNull()
    expect(ctx.fire.cible_patrimoine).toBeNull()
    expect(ctx.fire.progression_pct).toBeNull()
  })
})

describe('buildContextFromRaw — scores', () => {
  it('mappe les 5 scores', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    expect(ctx.scores.diversification.value).toBe(75)
    expect(ctx.scores.solidite.value).toBe(70)
    expect(ctx.scores.efficience_fiscale.value).toBe(55)
  })
})

describe('buildContextFromRaw — alertes', () => {
  it('transforme une reco haute en alerte critical', () => {
    const recos = [makeRecommandationFixture({ priorite: 'haute', titre: 'Cash insuffisant', categorie: 'liquidite' })]
    const ctx = buildContextFromRaw({ patrimoine: makePatrimoineFixture({ recommandations: recos }), snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)
    const alerte = ctx.alertes.find((a) => a.message === 'Cash insuffisant')
    expect(alerte).toBeDefined()
    expect(alerte!.type).toBe('critical')
    expect(alerte!.categorie).toBe('liquidite')
  })

  it('ajoute une alerte critical pour score rouge tres bas', () => {
    const scores = makeScoresFixture({
      solidite: { value: 15, niveau: 'rouge', label: 'Tres fragile' },
    })
    const ctx = buildContextFromRaw({
      patrimoine: makePatrimoineFixture({ scores, recommandations: [] }),
      snapshots: [],
      activites: [],
      conversations_passees: [],
      insights_persistants: [],
    }, null, REF_DATE)
    const alerte = ctx.alertes.find((a) => a.categorie === 'solidite')
    expect(alerte).toBeDefined()
    expect(alerte!.type).toBe('critical')
  })
})

describe('buildContextFromRaw — actions et UI', () => {
  it('mappe les actions recentes', () => {
    const activites = [
      { id: 'a1', type: 'ajout_position', description: 'Ajout 10 AAPL', metadata: {}, created_at: '2026-05-15T10:00:00.000Z' },
    ]
    const ctx = buildContextFromRaw(makeRaw({ activites }), null, REF_DATE)
    expect(ctx.actions_recentes).toHaveLength(1)
    expect(ctx.actions_recentes[0]!.description).toBe('Ajout 10 AAPL')
  })

  it('expose le contexte UI fourni', () => {
    const ctx = buildContextFromRaw(makeRaw(), { section: 'fire', page_url: '/analyse' }, REF_DATE)
    expect(ctx.ui.section).toBe('fire')
    expect(ctx.ui.page_url).toBe('/analyse')
  })

  it('gere ui null', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    expect(ctx.ui.section).toBeNull()
    expect(ctx.ui.page_url).toBeNull()
  })
})

describe('buildContextFromRaw — robustesse', () => {
  it('fonctionne avec un patrimoine vide (nouveau user)', () => {
    const patrimoine = makePatrimoineFixture({
      positions: [],
      biens:     [],
      comptes:   [],
    })
    expect(() => buildContextFromRaw({ patrimoine, snapshots: [], activites: [], conversations_passees: [], insights_persistants: [] }, null, REF_DATE)).not.toThrow()
  })

  it('emet generated_at en ISO', () => {
    const ctx = buildContextFromRaw(makeRaw(), null, REF_DATE)
    expect(ctx.generated_at).toBe(REF_DATE.toISOString())
  })
})
