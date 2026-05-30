/**
 * CS5 — Tests du builder + non-régression moteur projection.
 *
 * Garanties testées :
 *   1. Liste vide → vecteurs vides → projection identique bit-pour-bit
 *      au moteur pré-CS5 (invariant critique).
 *   2. Capital exceptionnel → inflow ponctuel à l'année cible.
 *   3. Retraite → delta epargne à partir de la date.
 *   4. Naissance → delta -300 €/m × N pendant 22 ans à partir de la date.
 *   5. Achat RP → AcquisitionFuture type 'RP' générée.
 *   6. Matrice 3 personas concrets (Annie / Bernard / Marc) :
 *      capital FIRE et âge FIRE avant/après évènements.
 */
import { describe, it, expect } from 'vitest'
import { buildLifeEventVectors, hasActiveLifeEventImpact } from '../lifeEvents'
import { NAISSANCE_COUT_MENSUEL_EUR, PENSION_TAUX_REMPLACEMENT_FALLBACK } from '../lifeEventsConstants'
import { projectionGlobale } from '@/lib/analyse/projectionFIRE'
import type { LifeEventRow } from '@/types/database.types'
import type { ProjectionInputs } from '@/types/analyse'

// ────────────────────────────────────────────────────────────────────
// Helpers fixture
// ────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-01T00:00:00Z')

function evt(partial: Partial<LifeEventRow> & Pick<LifeEventRow, 'type' | 'occurrence_date'>): LifeEventRow {
  return {
    id:              partial.id ?? `evt-${Math.random()}`,
    user_id:         'user-test',
    is_active:       true,
    montant:         null,
    label:           null,
    meta:            {},
    created_at:      '2026-01-01',
    updated_at:      '2026-01-01',
    ...partial,
  } as LifeEventRow
}

const BASE_PROFILE = {
  age:                  35,
  revenu_mensuel_total: 4000,
  epargne_mensuelle:    1000,
} as const

const BASE_INPUTS: ProjectionInputs = {
  ageActuel:                 35,
  ageCible:                  60,
  revenuPassifCible:         3000,
  epargneMensuelle:          1000,
  rendementCentral:          7,
  appreciationImmoPct:       2,
  inflationLoyersPct:        1.5,
  inflationPct:              2,
  swrPct:                    4,
  patrimoineFinancierActuel: 50_000,
  cashActuel:                10_000,
  biensExistants:            [],
  acquisitionsFutures:       [],
  horizonAnnees:             40,
}

// ────────────────────────────────────────────────────────────────────
// 1. Non-régression bit-pour-bit (invariant critique CS5)
// ────────────────────────────────────────────────────────────────────

describe('CS5 — Non-régression bit-pour-bit', () => {
  it('liste vide → vecteurs vides (tous zéro)', () => {
    const v = buildLifeEventVectors([], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.revenuPassifExceptionnelParAnnee.every((x) => x === 0)).toBe(true)
    expect(v.epargneDeltaParAnnee.every((x) => x === 0)).toBe(true)
    expect(v.acquisitionsFuturesFromEvents).toHaveLength(0)
    expect(v.appliedEvents).toHaveLength(0)
    expect(hasActiveLifeEventImpact(v)).toBe(false)
  })

  it('évènement is_active=false → ignoré (vecteurs vides)', () => {
    const v = buildLifeEventVectors([
      evt({ type: 'capital_exceptionnel', occurrence_date: '2030-01-01', montant: 100_000, is_active: false }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.appliedEvents).toHaveLength(0)
    expect(v.revenuPassifExceptionnelParAnnee.every((x) => x === 0)).toBe(true)
  })

  it('projection bit-pour-bit identique avec et sans champs CS5 absents', () => {
    const sansCS5 = projectionGlobale(BASE_INPUTS)
    const avecVecteursVides = projectionGlobale({
      ...BASE_INPUTS,
      revenuPassifExceptionnelParAnnee: [],
      epargneDeltaParAnnee:             [],
    })
    expect(avecVecteursVides.patrimoineAgeCible).toBe(sansCS5.patrimoineAgeCible)
    expect(avecVecteursVides.ageIndependanceCentral).toBe(sansCS5.ageIndependanceCentral)
    // Échantillon de points : bit-pour-bit identique
    for (let i = 0; i < sansCS5.points.length; i++) {
      expect(avecVecteursVides.points[i]!.total).toBe(sansCS5.points[i]!.total)
      expect(avecVecteursVides.points[i]!.patrimoineFinancier).toBe(sansCS5.points[i]!.patrimoineFinancier)
    }
  })

  it('vecteurs tous-zéro explicites = vecteurs absents', () => {
    const zeroVecs = new Array(36).fill(0) as number[]
    const sansCS5 = projectionGlobale(BASE_INPUTS)
    const avecZeros = projectionGlobale({
      ...BASE_INPUTS,
      revenuPassifExceptionnelParAnnee: zeroVecs,
      epargneDeltaParAnnee:             zeroVecs,
    })
    expect(avecZeros.patrimoineAgeCible).toBe(sansCS5.patrimoineAgeCible)
    expect(avecZeros.ageIndependanceCentral).toBe(sansCS5.ageIndependanceCentral)
  })
})

// ────────────────────────────────────────────────────────────────────
// 2. Capital exceptionnel (héritage / vente)
// ────────────────────────────────────────────────────────────────────

describe('CS5 — Capital exceptionnel', () => {
  it('injecte un inflow ponctuel à l\'année cible', () => {
    const v = buildLifeEventVectors([
      evt({ id: 'h1', type: 'capital_exceptionnel', occurrence_date: '2031-01-01', montant: 50_000 }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    // Jan 2031 vu de Jan 2026 = +5 ans
    expect(v.revenuPassifExceptionnelParAnnee[5]).toBe(50_000)
    // Avant et après : 0
    expect(v.revenuPassifExceptionnelParAnnee[4]).toBe(0)
    expect(v.revenuPassifExceptionnelParAnnee[6]).toBe(0)
  })

  it('cumulatif si plusieurs Capital exceptionnel même année', () => {
    const v = buildLifeEventVectors([
      evt({ id: 'h1', type: 'capital_exceptionnel', occurrence_date: '2031-01-01', montant: 50_000 }),
      evt({ id: 'h2', type: 'capital_exceptionnel', occurrence_date: '2031-06-01', montant: 20_000 }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    // 2031-01 vu de 2026-01 = +5.0 → round = 5.
    // 2031-06 vu de 2026-01 = 5 + 5/12 ≈ 5.42 → round = 5.
    // Les deux atterrissent sur year=5 → sommés = 70_000.
    expect(v.revenuPassifExceptionnelParAnnee[5]).toBe(70_000)
  })

  it('héritage augmente le capital age cible vs projection sans events', () => {
    const events = [evt({ id: 'h1', type: 'capital_exceptionnel', occurrence_date: '2031-01-01', montant: 100_000 })]
    const vecs = buildLifeEventVectors(events, BASE_PROFILE, { horizon: 40, now: NOW })
    const avant = projectionGlobale(BASE_INPUTS)
    const apres = projectionGlobale({ ...BASE_INPUTS, ...vecs })
    expect(apres.patrimoineAgeCible).toBeGreaterThan(avant.patrimoineAgeCible)
  })
})

// ────────────────────────────────────────────────────────────────────
// 3. Retraite (bascule épargne)
// ────────────────────────────────────────────────────────────────────

describe('CS5 — Retraite', () => {
  it('pension fournie = override epargne à partir de la date', () => {
    // Profile : revenu 4000, épargne 1000 → charges implicites = 3000.
    // Pension 2500 → epargne_pension = 2500 - 3000 = -500.
    // delta = -500 - 1000 = -1500 €/m
    const v = buildLifeEventVectors([
      evt({ id: 'r1', type: 'retraite', occurrence_date: '2031-01-01', montant: 2500 }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.epargneDeltaParAnnee[4]).toBe(0)   // avant retraite
    expect(v.epargneDeltaParAnnee[5]).toBe(-1500)
    expect(v.epargneDeltaParAnnee[10]).toBe(-1500)
    expect(v.epargneDeltaParAnnee[35]).toBe(-1500)
  })

  it('pension non fournie → fallback 50 % du revenu', () => {
    // Pension fallback = 4000 * 0.5 = 2000.
    // epargne_pension = 2000 - 3000 = -1000.
    // delta = -1000 - 1000 = -2000.
    const v = buildLifeEventVectors([
      evt({ id: 'r1', type: 'retraite', occurrence_date: '2031-01-01' }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.epargneDeltaParAnnee[5]).toBe(-2000)
    expect(PENSION_TAUX_REMPLACEMENT_FALLBACK).toBe(0.5)
  })
})

// ────────────────────────────────────────────────────────────────────
// 4. Naissance
// ────────────────────────────────────────────────────────────────────

describe('CS5 — Naissance', () => {
  it('1 enfant = -300 €/m pendant 22 ans à partir de la date', () => {
    const v = buildLifeEventVectors([
      evt({ id: 'n1', type: 'naissance', occurrence_date: '2028-01-01', meta: { nb_enfants: 1 } }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.epargneDeltaParAnnee[1]).toBe(0)
    expect(v.epargneDeltaParAnnee[2]).toBe(-NAISSANCE_COUT_MENSUEL_EUR)
    expect(v.epargneDeltaParAnnee[2 + 21]).toBe(-NAISSANCE_COUT_MENSUEL_EUR)
    expect(v.epargneDeltaParAnnee[2 + 22]).toBe(0)
  })

  it('2 enfants = -600 €/m', () => {
    const v = buildLifeEventVectors([
      evt({ id: 'n1', type: 'naissance', occurrence_date: '2028-01-01', meta: { nb_enfants: 2 } }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.epargneDeltaParAnnee[2]).toBe(-2 * NAISSANCE_COUT_MENSUEL_EUR)
  })

  it('naissance + retraite cumulatif sur la fenêtre commune', () => {
    // Naissance 2028 → -300 pendant 22 ans (year 2 à 23).
    // Retraite 2031 → -2000 à partir year 5.
    // Year 5 : -300 + -2000 = -2300
    // Year 24 : retraite seule -2000 (naissance terminée)
    const v = buildLifeEventVectors([
      evt({ id: 'n1', type: 'naissance', occurrence_date: '2028-01-01', meta: { nb_enfants: 1 } }),
      evt({ id: 'r1', type: 'retraite',   occurrence_date: '2031-01-01' }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.epargneDeltaParAnnee[5]).toBe(-300 - 2000)
    expect(v.epargneDeltaParAnnee[24]).toBe(-2000)
  })
})

// ────────────────────────────────────────────────────────────────────
// 5. Achat RP
// ────────────────────────────────────────────────────────────────────

describe('CS5 — Achat RP', () => {
  it('génère une AcquisitionFuture type RP', () => {
    const v = buildLifeEventVectors([
      evt({
        id: 'rp1', type: 'achat_rp', occurrence_date: '2029-01-01',
        montant: 350_000,
        meta: { apport: 50_000, duree_credit_annees: 25 },
      }),
    ], BASE_PROFILE, { horizon: 35, now: NOW })
    expect(v.acquisitionsFuturesFromEvents).toHaveLength(1)
    expect(v.acquisitionsFuturesFromEvents[0]!.type).toBe('RP')
    expect(v.acquisitionsFuturesFromEvents[0]!.prix_achat).toBe(350_000)
    expect(v.acquisitionsFuturesFromEvents[0]!.apport).toBe(50_000)
    expect(v.acquisitionsFuturesFromEvents[0]!.dans_combien_annees).toBe(3)
  })
})

// ────────────────────────────────────────────────────────────────────
// 6. Matrice 3 personas concrets
// ────────────────────────────────────────────────────────────────────

describe('CS5 — Matrice 3 personas (Annie / Bernard / Marc)', () => {
  const fmt = (n: number) => Math.round(n / 1000) + 'k€'

  it('Annie (60, retraite immédiate à 60) : capital FIRE chute, age FIRE recule', () => {
    // Annie : pension 1500, charges 2500 → épargne_pension = -1000.
    // Avant CS5 : epargne 500/m → capital cible 60 ans.
    // Après : retraite year 0 → epargne devient -1000/m → capital chute.
    const annieProfile = { age: 60, revenu_mensuel_total: 3000, epargne_mensuelle: 500 } as const
    const annieInputs: ProjectionInputs = {
      ...BASE_INPUTS,
      ageActuel: 60, ageCible: 65,
      epargneMensuelle: 500,
      revenuPassifCible: 2000,
      patrimoineFinancierActuel: 200_000,
    }
    const events = [evt({ id: 'r1', type: 'retraite', occurrence_date: '2026-01-01', montant: 1500 })]
    const vecs = buildLifeEventVectors(events, annieProfile, { horizon: 40, now: NOW })

    const avant = projectionGlobale(annieInputs)
    const apres = projectionGlobale({ ...annieInputs, ...vecs })

    // Capital age cible doit chuter (épargne devient négative dès year 0)
    expect(apres.patrimoineAgeCible).toBeLessThan(avant.patrimoineAgeCible)
    // L'âge FIRE doit reculer ou rester null
    if (apres.ageIndependanceCentral !== null && avant.ageIndependanceCentral !== null) {
      expect(apres.ageIndependanceCentral).toBeGreaterThanOrEqual(avant.ageIndependanceCentral)
    }
    console.info(`[Annie] capital age cible avant ${fmt(avant.patrimoineAgeCible)} → après ${fmt(apres.patrimoineAgeCible)} (Δ ${fmt(apres.patrimoineAgeCible - avant.patrimoineAgeCible)})`)
    console.info(`[Annie] age FIRE avant ${avant.ageIndependanceCentral} → après ${apres.ageIndependanceCentral}`)
  })

  it('Bernard (38, achat RP +5 ans, naissance +1 an) : effort accru', () => {
    const bernardProfile = { age: 38, revenu_mensuel_total: 6000, epargne_mensuelle: 1200 } as const
    const bernardInputs: ProjectionInputs = {
      ...BASE_INPUTS,
      ageActuel: 38, ageCible: 55,
      epargneMensuelle: 1200,
      revenuPassifCible: 3500,
      patrimoineFinancierActuel: 100_000,
    }
    const events = [
      evt({ id: 'rp1', type: 'achat_rp',   occurrence_date: '2031-01-01',
            montant: 400_000, meta: { apport: 60_000, duree_credit_annees: 25 } }),
      evt({ id: 'n1',  type: 'naissance',  occurrence_date: '2027-01-01', meta: { nb_enfants: 1 } }),
    ]
    const vecs = buildLifeEventVectors(events, bernardProfile, { horizon: 40, now: NOW })

    const avant = projectionGlobale(bernardInputs)
    const apres = projectionGlobale({
      ...bernardInputs,
      acquisitionsFutures: vecs.acquisitionsFuturesFromEvents,
      revenuPassifExceptionnelParAnnee: vecs.revenuPassifExceptionnelParAnnee,
      epargneDeltaParAnnee:             vecs.epargneDeltaParAnnee,
    })

    // RP : apport sorti + mensualité = effort cumulé. Naissance -300/m.
    // Capital age cible doit chuter
    expect(apres.patrimoineAgeCible).toBeLessThan(avant.patrimoineAgeCible)
    // Acquisition RP injectée
    expect(vecs.acquisitionsFuturesFromEvents).toHaveLength(1)
    expect(vecs.epargneDeltaParAnnee[1]).toBe(-300)  // naissance kicks in year 1
    console.info(`[Bernard] capital age cible avant ${fmt(avant.patrimoineAgeCible)} → après ${fmt(apres.patrimoineAgeCible)} (Δ ${fmt(apres.patrimoineAgeCible - avant.patrimoineAgeCible)})`)
    console.info(`[Bernard] age FIRE avant ${avant.ageIndependanceCentral} → après ${apres.ageIndependanceCentral}`)
  })

  it('Marc (52, héritage 80 k€ à 5 ans) : capital + et age FIRE avance', () => {
    const marcProfile = { age: 52, revenu_mensuel_total: 5500, epargne_mensuelle: 1800 } as const
    const marcInputs: ProjectionInputs = {
      ...BASE_INPUTS,
      ageActuel: 52, ageCible: 62,
      epargneMensuelle: 1800,
      revenuPassifCible: 2800,
      patrimoineFinancierActuel: 280_000,
    }
    const events = [
      evt({ id: 'h1', type: 'capital_exceptionnel', occurrence_date: '2031-01-01', montant: 80_000 }),
    ]
    const vecs = buildLifeEventVectors(events, marcProfile, { horizon: 40, now: NOW })

    const avant = projectionGlobale(marcInputs)
    const apres = projectionGlobale({ ...marcInputs, ...vecs })

    // Capital age cible augmente
    expect(apres.patrimoineAgeCible).toBeGreaterThan(avant.patrimoineAgeCible)
    // Age FIRE doit s'avancer ou rester égal
    if (apres.ageIndependanceCentral !== null && avant.ageIndependanceCentral !== null) {
      expect(apres.ageIndependanceCentral).toBeLessThanOrEqual(avant.ageIndependanceCentral)
    }
    console.info(`[Marc] capital age cible avant ${fmt(avant.patrimoineAgeCible)} → après ${fmt(apres.patrimoineAgeCible)} (Δ +${fmt(apres.patrimoineAgeCible - avant.patrimoineAgeCible)})`)
    console.info(`[Marc] age FIRE avant ${avant.ageIndependanceCentral} → après ${apres.ageIndependanceCentral}`)
  })
})
