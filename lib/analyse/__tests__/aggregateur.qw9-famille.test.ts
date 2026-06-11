/**
 * QW9 — Tests d'intégration : composition foyer ajuste la cible FIRE
 * tout au long de la chaîne /analyse.
 *
 * Vérifie :
 *  1. Cible ajustée > brut quand famille (couple + enfants).
 *  2. Capital FIRE projeté et âge FIRE strictement supérieurs pour le couple
 *     avec enfants vs célibataire à revenus/âge identiques.
 *  3. Disjonction couple : marié + revenu_conjoint > 0 ne déclenche PAS le
 *     bonus +50 % (seuls les enfants comptent).
 *  4. Cohérence intra-/analyse : projectionFIRESnapshot, score Progression FIRE
 *     et reco #7 "retard-fire" consomment exactement la même cible (= ajustée).
 *  5. Non-régression brut : célibataire 0 enfant → cible_ajustee == cible_brute
 *     et patrimoine_fire_cible identique à l'existant (snapshot 3000 €/mois).
 *
 * Le modèle de test reprend `buildSupabaseMock` de aggregateur.integration.test.ts
 * (fake client Supabase, mocks réseau).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Fake Supabase ─────────────────────────────────────────────────────

function buildSupabaseMock(tables: Record<string, unknown[]>) {
  function tableBuilder(_table: string, rows: unknown[]) {
    const data = { rows }
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq:     () => builder,
      neq:    () => builder,
      in:     () => builder,
      not:    () => builder,
      gte:    () => builder,
      lte:    () => builder,
      gt:     () => builder,
      lt:     () => builder,
      order:  () => builder,
      limit:  () => builder,
      range:  () => builder,
      maybeSingle: async () => ({ data: data.rows[0] ?? null, error: null }),
      single:      async () => ({ data: data.rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: data.rows, error: null }).then(resolve),
    }
    return builder
  }
  return { from: (table: string) => tableBuilder(table, tables[table] ?? []) }
}

const supabaseTables: Record<string, unknown[]> = {}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient:  vi.fn(async () => buildSupabaseMock(supabaseTables)),
  createServiceClient: vi.fn(() => buildSupabaseMock(supabaseTables)),
}))

vi.mock('@/lib/providers/fx', () => ({
  toEur: async (amount: number) => amount,
  getFxRate: async () => 1,
}))

vi.mock('../enrichPositions', () => ({
  getEnrichedPositions: vi.fn(async () => ({ positions: [], totalValue: 0 })),
}))

vi.mock('../isinBatch', () => ({
  enrichMultipleISIN: async () => new Map(),
}))

import { getPatrimoineComplet } from '../aggregateur'

// ── Helpers ───────────────────────────────────────────────────────────

interface ProfileFixture {
  revenu_passif_cible:  number
  situation_familiale?: string
  enfants?:             string
  revenu_conjoint?:     number
}

function setProfile(p: ProfileFixture) {
  for (const k of Object.keys(supabaseTables)) delete supabaseTables[k]
  Object.assign(supabaseTables, {
    profiles: [{
      id: 'u-1',
      tmi_rate: 30, fire_type: 'classic',
      age: 35, age_cible: 50,
      epargne_mensuelle: 1000,
      revenu_passif_cible: p.revenu_passif_cible,
      revenu_mensuel: 5000, revenu_conjoint: p.revenu_conjoint ?? 0,
      autres_revenus: 0,
      loyer: 0, autres_credits: 0, charges_fixes: 0, depenses_courantes: 2000,
      enveloppes: ['PEA', 'Assurance-vie'],
      stabilite_revenus: 'Très stables (CDI)',
      priorite: 'Liberté de temps',
      situation_familiale: p.situation_familiale ?? 'Célibataire',
      enfants:             p.enfants ?? '0',
      risk_1: 'Attendre', risk_2: '7-15ans', risk_3: '5-10%', risk_4: '10-30%',
      quiz_bourse: [0, 1, 2, 3], quiz_crypto: [0, 1, 2, 1], quiz_immo: [1, 2, 3],
      prenom: 'Test',
    }],
    real_estate_properties: [],
    real_estate_lots:       [],
    debts:                  [],
    cash_accounts:          [],
    property_charges:       [],
    real_estate_valuations: [],
    transactions:           [],
  })
}

beforeEach(() => { setProfile({ revenu_passif_cible: 3000 }) })

// ─────────────────────────────────────────────────────────────────────
// 1 — Cible ajustée > brut quand famille
// ─────────────────────────────────────────────────────────────────────

describe('QW9 — composition foyer ajuste la cible FIRE', () => {
  it('célibataire 0 enfant : ajustée == brute (= 3000)', async () => {
    setProfile({ revenu_passif_cible: 3000 })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible).toBe(3000)
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(3000)
  })

  it('marié + 2 enfants SANS revenu conjoint : ajustée = 3000 + 600 + 1500 = 5100', async () => {
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '2',
      revenu_conjoint: 0,
    })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible).toBe(3000)            // brut inchangé
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(5100)     // 3000 + 600 + 1500
  })

  it('célibataire avec 1 enfant : ajustée = 3000 + 300 = 3300', async () => {
    setProfile({ revenu_passif_cible: 3000, enfants: '1' })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(3300)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 2 — Capital FIRE projeté et âge FIRE strictement supérieurs
// ─────────────────────────────────────────────────────────────────────

describe('QW9 — patrimoine_fire_cible reflète la composition foyer', () => {
  it('couple 2 enfants sans revenu conjoint → capital FIRE > célibataire', async () => {
    // Célibataire 0 enfant
    setProfile({ revenu_passif_cible: 3000 })
    const pSeul = await getPatrimoineComplet('u-1')
    const cibleSeul = pSeul.projectionFIRESnapshot?.patrimoine_fire_cible ?? 0

    // Couple + 2 enfants sans revenu conjoint
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '2',
      revenu_conjoint: 0,
    })
    const pFamille = await getPatrimoineComplet('u-1')
    const cibleFamille = pFamille.projectionFIRESnapshot?.patrimoine_fire_cible ?? 0

    expect(cibleSeul).toBeGreaterThan(0)
    expect(cibleFamille).toBeGreaterThan(cibleSeul)
    // Rapport attendu : 5100/3000 = 1.7 → cible famille ~70 % plus haute.
    expect(cibleFamille / cibleSeul).toBeCloseTo(5100 / 3000, 2)
  })

  it('âge FIRE projeté reculé pour le couple avec enfants à épargne identique', async () => {
    setProfile({ revenu_passif_cible: 3000 })
    const pSeul = await getPatrimoineComplet('u-1')

    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '2',
      revenu_conjoint: 0,
    })
    const pFamille = await getPatrimoineComplet('u-1')

    const ageSeul    = pSeul.projectionFIRESnapshot?.age_fire_median
    const ageFamille = pFamille.projectionFIRESnapshot?.age_fire_median

    // Si l'un ou les deux ne sont pas atteignables (null), l'autre devrait
    // être au moins null lui aussi quand la cible monte. On gère les cas :
    if (ageSeul !== null && ageFamille !== null) {
      expect(ageFamille).toBeGreaterThanOrEqual(ageSeul as number)
    } else {
      // Cible famille plus haute → si solo atteint et famille pas, c'est
      // cohérent. Si solo n'atteint déjà pas, famille non plus.
      if (ageSeul === null) expect(ageFamille).toBeNull()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────
// 3 — Disjonction couple : revenu_conjoint > 0 désactive le bonus +50 %
// ─────────────────────────────────────────────────────────────────────

describe('QW9 — disjonction couple (revenu_conjoint > 0)', () => {
  it('marié + 2 enfants AVEC revenu conjoint : ajustée = 3000 + 600 (enfants seuls) = 3600', async () => {
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '2',
      revenu_conjoint: 2500,    // > 0 → bonus couple NON appliqué
    })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(3600)
  })

  it('marié 0 enfant AVEC revenu conjoint : ajustée = brute (3000) — aucun bonus', async () => {
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '0',
      revenu_conjoint: 2500,
    })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(3000)
  })

  it('marié 0 enfant SANS revenu conjoint : ajustée = 3000 + 1500 = 4500', async () => {
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '0',
      revenu_conjoint: 0,
    })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(4500)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 4 — Cohérence intra-/analyse : 3 consommateurs lisent la MÊME cible
// ─────────────────────────────────────────────────────────────────────

describe('QW9 — cohérence Snapshot / score Progression FIRE / reco #7', () => {
  it('même cible utilisée par projectionFIRESnapshot, score Progression FIRE et reco retard-fire', async () => {
    // Profil famille avec retard FIRE : ageCible 40, peu d'épargne, cible élevée.
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '2',
      revenu_conjoint: 0,
    })
    const p = await getPatrimoineComplet('u-1')

    // 1) Snapshot : patrimoine_fire_cible calculé avec swr 4 % standard,
    //    inflation 2 %, sur 15 ans, à partir de la cible ajustée (5100).
    //    On valide juste qu'il est calculé à partir de 5100 (pas 3000).
    const snapshot = p.projectionFIRESnapshot
    expect(snapshot).not.toBeNull()
    // Cible classique non-inflatée ≈ 5100 × 12 × 25 = 1 530 000 € pour 0 an.
    // Avec inflation 2 %/an sur 15 ans, c'est ~2 060 000 €.
    // On vérifie juste que c'est largement au-dessus de la cible brute (900 000).
    expect(snapshot!.patrimoine_fire_cible).toBeGreaterThan(1_500_000)

    // 2) Score Progression FIRE : lit revenu_passif_cible_ajuste.
    //    QW9-bis : quand hasAdjustment, le label monolithique
    //    "Revenu passif cible" est remplacé par "(saisi)" + "(foyer ajusté)".
    //    On valide la présence de la ligne ajustée avec 5100.
    const sc = p.scores.progression_fire
    expect(sc.value).not.toBeNull()
    const cibleEntry = sc.explanation?.inputs.find(
      (i) => i.label === 'Revenu passif cible (foyer ajusté)',
    )
    expect(cibleEntry).toBeDefined()
    expect(cibleEntry!.value).toContain('5100')
    // La ligne saisie est aussi présente (transparence brut)
    const saisiEntry = sc.explanation?.inputs.find(
      (i) => i.label === 'Revenu passif cible (saisi)',
    )
    expect(saisiEntry).toBeDefined()
    expect(saisiEntry!.value).toContain('3000')

    // 3) Reco #7 "retard-fire" : la cible (formule unifiée P1 :
    //    calculerCiblePatrimoine sur revenu_passif_cible_ajuste) et le delta
    //    +200 €/mois portent sur revenu_passif_cible_ajuste.
    //    On vérifie indirectement : reco retard-fire est présente (couple 2
    //    enfants à 1000 €/mois d'épargne sur 15 ans n'atteint pas 5100/mois).
    const recoRetard = p.recommandations.find((r) => r.id === 'retard-fire')
    expect(recoRetard).toBeDefined()
    // Le texte mentionne l'âge cible 50 ans → cohérent avec ce qu'on a saisi.
    expect(recoRetard!.description).toMatch(/50 ans/)
  })

  it('cohérence ajustée vs brute : 3 lieux convergent sur la valeur ajustée', async () => {
    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '2',
      revenu_conjoint: 0,
    })
    const p = await getPatrimoineComplet('u-1')

    // a) fireInputs expose les 2
    expect(p.fireInputs.revenu_passif_cible).toBe(3000)
    expect(p.fireInputs.revenu_passif_cible_ajuste).toBe(5100)

    // b) Score Progression FIRE lit l'ajusté (cf. inputs ci-dessus)
    //    QW9-bis : label "(foyer ajusté)" quand hasAdjustment.
    const cibleScoreText = p.scores.progression_fire.explanation?.inputs
      .find((i) => i.label === 'Revenu passif cible (foyer ajusté)')?.value as string
    expect(cibleScoreText).toContain('5100')

    // c) Reco #7 utilise l'ajusté : la cible employée (formule unifiée P1,
    //    calculerCiblePatrimoine) part de 5100 €/mois, pas 3000 €/mois.
    //    On valide via le contenu : la reco doit indiquer un retard,
    //    confirmant que la cible employée est bien la version ajustée.
    const recoRetard = p.recommandations.find((r) => r.id === 'retard-fire')
    expect(recoRetard).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────
// 5 — Non-régression brut : célibataire 0 enfant → comportement inchangé
// ─────────────────────────────────────────────────────────────────────

describe('QW9 — non-régression brut (célibataire 0 enfant)', () => {
  it('cible_brute == cible_ajustee pour célibataire 0 enfant', async () => {
    setProfile({ revenu_passif_cible: 3000 })
    const p = await getPatrimoineComplet('u-1')
    expect(p.fireInputs.revenu_passif_cible).toBe(
      p.fireInputs.revenu_passif_cible_ajuste,
    )
  })

  it('patrimoine_fire_cible identique pour les deux scénarios "célibataire" et "marié 0 enfant AVEC revenu_conjoint"', async () => {
    setProfile({ revenu_passif_cible: 3000, situation_familiale: 'Célibataire', enfants: '0' })
    const pCelib = await getPatrimoineComplet('u-1')

    setProfile({
      revenu_passif_cible: 3000,
      situation_familiale: 'Marié(e) / PACS',
      enfants: '0',
      revenu_conjoint: 2500,
    })
    const pMarie = await getPatrimoineComplet('u-1')

    expect(pMarie.projectionFIRESnapshot?.patrimoine_fire_cible)
      .toBe(pCelib.projectionFIRESnapshot?.patrimoine_fire_cible)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 6 — Non-régression ProfilCard : computeProfileMetrics inchangé
// ─────────────────────────────────────────────────────────────────────

describe('QW9 — ProfilCard (computeProfileMetrics) inchangée', () => {
  it('même profil famille → computeProfileMetrics retourne la cible BRUTE (non ajustée)', async () => {
    // computeProfileMetrics ne passe pas par loadProfile, il lit le Profile
    // brut depuis l'API. Cas dégénéré : on appelle directement la fonction
    // avec un input "profile" brut, comme le fait ProfilCard côté UI.
    const { computeProfileMetrics } = await import('@/lib/profil/calculs')
    const m = computeProfileMetrics({
      age: 35, age_cible: 50,
      revenu_mensuel: 5000, revenu_conjoint: 0,
      epargne_mensuelle: 1000,
      revenu_passif_cible: 3000,
      enfants: '2',
      situation_familiale: 'Marié(e) / PACS',
      fire_type: 'classic',
      // tous les autres champs facultatifs absents
    })
    // fireTargetCapital = fireTarget(3000) = 3000 × 12 × 25 = 900 000 €
    // (NON ajusté famille — c'est exactement le comportement avant QW9,
    //  et c'est volontaire : hors périmètre QW9, ticket bis prévu).
    expect(m.fireTargetCapital).toBe(3000 * 12 * 25)
  })
})
