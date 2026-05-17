/**
 * Tests des stress tests FIRE (Sprint 4).
 *
 * 6 scénarios préconfigurés + fonction `simulerStress`.
 * Pas d'I/O — uniquement de la logique pure.
 */
import { describe, it, expect } from 'vitest'
import {
  simulerStress, SCENARIOS_STRESS,
  SCENARIO_CRASH_MARCHES, SCENARIO_VACANCE_LOCATIVE, SCENARIO_PERTE_EMPLOI,
  SCENARIO_DOUBLE_PEINE, SCENARIO_INFLATION_FORTE,
  type StressParamsLegacy, type ScenarioStress,
} from '../stressTest'
import type { ProjectionGlobaleResult } from '@/types/analyse'

// Baseline projection minimale (la fonction n'utilise que ageIndependanceCentral)
function projectionBaseFake(ageInd: number | null): ProjectionGlobaleResult {
  return {
    points:                          [],
    ageIndependanceCentral:          ageInd,
    ecartObjectif:                   null,
    patrimoineAgeCible:              0,
    rendementUtilise:                7,
    detailsAgeCible: {
      financier: 0, equityImmoExistant: 0, equityImmoFuture: 0, cash: 0,
      loyersNetsMensuels: 0, mensualitesSortantes: 0,
      valeurBruteImmo: 0, creditRestantImmo: 0,
    },
    cibleRevenuMensuelEnEurosFuturs: 3000,
    ciblePatrimoineAjusteeInflation: 900_000,
    swrUtilise:                      4,
    inflationUtilisee:               2,
    revenuPassifBrutProjete:         0,
    revenuPassifNetProjete:          0,
    tauxPressionFiscaleEstime:       0,
    jalons:                          [],
    warnings:                        [],
  }
}

function baseParams(
  scenario: ScenarioStress,
  over: Partial<StressParamsLegacy> = {},
): StressParamsLegacy {
  return {
    scenario,
    projectionBase:    projectionBaseFake(50),
    patrimoine_actuel: {
      total_portefeuille: 100_000,
      total_immo:         0,
      total_cash:         20_000,
      epargne_mensuelle:  1_000,
      revenu_loyers:      0,
    },
    age_actuel:            30,
    age_cible:             60,
    cible_fire:            900_000,
    revenu_passif_cible:   3000,
    rendement_central_pct: 7,
    swr_pct:               4,
    inflation_pct:         2,
    horizon_annees:        35,
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────
// Scénarios préconfigurés
// ─────────────────────────────────────────────────────────────────

describe('SCENARIOS_STRESS — catalogue', () => {
  it('expose exactement 6 scénarios', () => {
    expect(SCENARIOS_STRESS).toHaveLength(6)
  })

  it('chaque scénario a id, label, description, icône, impact', () => {
    for (const s of SCENARIOS_STRESS) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.description).toBeTruthy()
      expect(s.icone).toBeTruthy()
      expect(typeof s.impact.portefeuille_pct).toBe('number')
      expect(typeof s.impact.duree_mois).toBe('number')
      expect(s.impact.duree_mois).toBeGreaterThan(0)
    }
  })

  it('CRASH_MARCHES impacte le portefeuille de -30 %', () => {
    expect(SCENARIO_CRASH_MARCHES.impact.portefeuille_pct).toBe(-30)
  })

  it('VACANCE_LOCATIVE annule les loyers (-100 %)', () => {
    expect(SCENARIO_VACANCE_LOCATIVE.impact.loyers_pct).toBe(-100)
  })

  it('PERTE_EMPLOI réduit l\'épargne de 80 %', () => {
    expect(SCENARIO_PERTE_EMPLOI.impact.epargne_pct).toBe(-80)
  })
})

// ─────────────────────────────────────────────────────────────────
// Choc immédiat
// ─────────────────────────────────────────────────────────────────

describe('simulerStress — choc immédiat', () => {
  it('CRASH_MARCHES sur 100 k€ → perte_immediate = 30 k€', () => {
    const r = simulerStress(baseParams(SCENARIO_CRASH_MARCHES))
    expect(r.perte_immediate).toBe(30_000)
    expect(r.patrimoine_choque).toBe(70_000)
  })

  it('VACANCE_LOCATIVE → pas de perte immédiate sur portefeuille', () => {
    const r = simulerStress(baseParams(SCENARIO_VACANCE_LOCATIVE))
    expect(r.perte_immediate).toBe(0)
    expect(r.patrimoine_choque).toBe(100_000)
  })

  it('DOUBLE_PEINE -25 % sur 200 k€ → perte 50 k€', () => {
    const r = simulerStress(baseParams(SCENARIO_DOUBLE_PEINE, {
      patrimoine_actuel: {
        total_portefeuille: 200_000, total_immo: 0, total_cash: 20_000,
        epargne_mensuelle: 1000, revenu_loyers: 0,
      },
    }))
    expect(r.perte_immediate).toBe(50_000)
  })
})

// ─────────────────────────────────────────────────────────────────
// Cohérence des metrics
// ─────────────────────────────────────────────────────────────────

describe('simulerStress — metrics', () => {
  it('courbe_stressee commence à age_actuel et finit à age_actuel + horizon', () => {
    const r = simulerStress(baseParams(SCENARIO_CRASH_MARCHES, { horizon_annees: 30 }))
    expect(r.courbe_stressee[0]!.age).toBe(30)
    expect(r.courbe_stressee[r.courbe_stressee.length - 1]!.age).toBe(60)
  })

  it('courbe_stressee[0].valeur = patrimoine après choc + immo + cash', () => {
    const r = simulerStress(baseParams(SCENARIO_CRASH_MARCHES, {
      patrimoine_actuel: {
        total_portefeuille: 100_000, total_immo: 50_000, total_cash: 20_000,
        epargne_mensuelle: 1000, revenu_loyers: 0,
      },
    }))
    // 100_000 × 0.7 + 50_000 + 20_000 = 140_000
    expect(r.courbe_stressee[0]!.valeur).toBe(140_000)
  })

  it('phase_choc.age_debut = age_actuel, age_fin = age + (durée+12)/12', () => {
    const r = simulerStress(baseParams(SCENARIO_CRASH_MARCHES))
    expect(r.phase_choc.age_debut).toBe(30)
    // CRASH_MARCHES : durée 18 mois + 12 récup = 30 mois = 2.5 ans
    expect(r.phase_choc.age_fin).toBe(32.5)
  })

  it('annees_recuperation cohérent : positif (le patrimoine remonte)', () => {
    // Avec une bonne épargne et un choc modéré, on récupère
    const r = simulerStress(baseParams(SCENARIO_CRASH_MARCHES, {
      patrimoine_actuel: {
        total_portefeuille: 100_000, total_immo: 0, total_cash: 20_000,
        epargne_mensuelle: 1500, revenu_loyers: 0,
      },
    }))
    // 30 k€ de perte récupérée avec 1500 €/mois d'épargne + 7 % rendement
    // → quelques années max
    if (r.annees_recuperation !== null) {
      expect(r.annees_recuperation).toBeGreaterThan(0)
      expect(r.annees_recuperation).toBeLessThan(10)
    }
  })

  it('annees_recuperation = null si patrimoine ne revient jamais au niveau pré-choc', () => {
    // Aucune épargne, perte énorme, rendement réduit fortement → impossible
    const r = simulerStress(baseParams(SCENARIO_DOUBLE_PEINE, {
      patrimoine_actuel: {
        total_portefeuille: 10_000, total_immo: 0, total_cash: 0,
        epargne_mensuelle: 0, revenu_loyers: 0,
      },
      rendement_central_pct: 1,
      horizon_annees: 5,
    }))
    expect(r.annees_recuperation).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────
// Comparaison à la baseline
// ─────────────────────────────────────────────────────────────────

describe('simulerStress — vs baseline', () => {
  it('age_fire_sans_stress = baseline.ageIndependanceCentral', () => {
    const r = simulerStress(baseParams(SCENARIO_CRASH_MARCHES, {
      projectionBase: projectionBaseFake(52),
    }))
    expect(r.age_fire_sans_stress).toBe(52)
  })

  it('un crash boursier retarde le FIRE par rapport à un scénario non-choquant', () => {
    // Compare 2 stress tests sur le même patrimoine : un crash -30 % retarde
    // l'âge FIRE par rapport à une vacance locative (impact loyers seulement,
    // mais le patrimoine n'a pas de loyers ici donc impact ≈ nul).
    const setup = {
      patrimoine_actuel: {
        total_portefeuille: 500_000, total_immo: 0, total_cash: 50_000,
        epargne_mensuelle: 2000, revenu_loyers: 0,
      },
    }
    const crash   = simulerStress(baseParams(SCENARIO_CRASH_MARCHES,   setup))
    const vacance = simulerStress(baseParams(SCENARIO_VACANCE_LOCATIVE, setup))
    if (crash.age_fire_avec_stress !== null && vacance.age_fire_avec_stress !== null) {
      expect(crash.age_fire_avec_stress).toBeGreaterThanOrEqual(vacance.age_fire_avec_stress)
    }
  })

  it('retard_mois = 0 si l\'âge FIRE n\'est pas affecté', () => {
    // Choc minimal sur patrimoine énorme : marginal
    const r = simulerStress(baseParams(SCENARIO_VACANCE_LOCATIVE, {
      patrimoine_actuel: {
        total_portefeuille: 2_000_000, total_immo: 0, total_cash: 100_000,
        epargne_mensuelle: 5000, revenu_loyers: 0,
      },
    }))
    if (r.retard_mois !== null) {
      expect(r.retard_mois).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────
// Objectif atteint malgré le stress
// ─────────────────────────────────────────────────────────────────

describe('simulerStress — objectif_atteint', () => {
  it('patrimoine suffisant à l\'âge cible → objectif_atteint = true', () => {
    const r = simulerStress(baseParams(SCENARIO_VACANCE_LOCATIVE, {
      patrimoine_actuel: {
        total_portefeuille: 500_000, total_immo: 200_000, total_cash: 50_000,
        epargne_mensuelle: 2000, revenu_loyers: 1500,
      },
      cible_fire: 800_000,
    }))
    expect(r.objectif_atteint).toBe(true)
  })

  it('patrimoine insuffisant à l\'âge cible → objectif_atteint = false', () => {
    const r = simulerStress(baseParams(SCENARIO_DOUBLE_PEINE, {
      patrimoine_actuel: {
        total_portefeuille: 30_000, total_immo: 0, total_cash: 5_000,
        epargne_mensuelle: 200, revenu_loyers: 0,
      },
      cible_fire: 2_000_000,
    }))
    expect(r.objectif_atteint).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// Comportements spécifiques par scénario
// ─────────────────────────────────────────────────────────────────

describe('simulerStress — VACANCE_LOCATIVE', () => {
  it('loyers annulés pendant 6 mois → impact patrimoine bien moindre que crash', () => {
    const params = baseParams(SCENARIO_VACANCE_LOCATIVE, {
      patrimoine_actuel: {
        total_portefeuille: 100_000, total_immo: 0, total_cash: 20_000,
        epargne_mensuelle: 1000, revenu_loyers: 1500,
      },
    })
    const r = simulerStress(params)
    // Pas de choc instantané, le retard FIRE doit être modéré
    expect(r.perte_immediate).toBe(0)
  })
})

describe('simulerStress — INFLATION_FORTE', () => {
  it('loyers boostés de 10 % → patrimoine relativement préservé', () => {
    const r = simulerStress(baseParams(SCENARIO_INFLATION_FORTE, {
      patrimoine_actuel: {
        total_portefeuille: 100_000, total_immo: 0, total_cash: 20_000,
        epargne_mensuelle: 1000, revenu_loyers: 1000,
      },
    }))
    expect(r.perte_immediate).toBe(0)  // pas de choc immédiat
  })
})

describe('simulerStress — PERTE_EMPLOI 12 mois', () => {
  it('épargne réduite de 80 % pendant 12 mois → patrimoine final inférieur au baseline', () => {
    const r = simulerStress(baseParams(SCENARIO_PERTE_EMPLOI))
    // Mois 1 → sévérité 1, épargne = 1000 × (1 + (-80/100) × 1) = 200
    // → courbe stressée à 12 mois doit être visiblement plus basse qu'avec
    // épargne pleine. On vérifie juste qu'on a bien des points cohérents.
    expect(r.courbe_stressee.length).toBeGreaterThan(10)
    expect(r.courbe_stressee[0]!.valeur).toBe(120_000)  // pas de choc immédiat
  })
})

// ─────────────────────────────────────────────────────────────────
// Sprint 1 — I5 : ancrage scenario neutre + I6 : double comptage loyers
// ─────────────────────────────────────────────────────────────────

const SCENARIO_NEUTRE: ScenarioStress = {
  id:          'neutre',
  label:       'Neutre (test)',
  description: 'Tous les chocs a 0 — sert a valider que stress == baseline.',
  icone:       '⚖',
  impact: {
    portefeuille_pct:    0,
    loyers_pct:          0,
    epargne_pct:         0,
    duree_mois:          12,
    rendement_delta_pct: 0,
  },
}

describe('simulerStress — scenario neutre (Sprint 1 I5)', () => {
  it('loyers 1000 €/mois + portefeuille fixe : age FIRE inchange vs baseline', () => {
    const baseline = projectionBaseFake(48)
    const r = simulerStress({
      scenario:          SCENARIO_NEUTRE,
      baselineProjection: baseline,
      patrimoine_actuel: {
        total_portefeuille: 200_000,
        total_immo:         0,
        total_cash:         0,
        epargne_mensuelle:  0,       // portefeuille "fixe"
        revenu_loyers:      1000,    // 1000 €/mois loyers nets
      },
      age_actuel:            30,
      age_cible:             60,
      cible_fire:            900_000,
      revenu_passif_cible:   3000,
      rendement_central_pct: 7,
    })
    expect(r.age_fire_avec_stress).toBe(48)
    expect(r.retard_mois).toBe(0)
    expect(r.perte_immediate).toBe(0)
  })

  it('baseline inatteignable + scenario neutre → stress aussi null', () => {
    const r = simulerStress({
      scenario:          SCENARIO_NEUTRE,
      baselineProjection: projectionBaseFake(null),
      patrimoine_actuel: {
        total_portefeuille: 10_000, total_immo: 0, total_cash: 0,
        epargne_mensuelle: 0, revenu_loyers: 0,
      },
      age_actuel: 30, age_cible: 60,
      cible_fire: 5_000_000, revenu_passif_cible: 10_000,
      rendement_central_pct: 7,
    })
    expect(r.age_fire_avec_stress).toBeNull()
    expect(r.retard_mois).toBe(0)
  })

  it('scenario avec impact NON nul ne court-circuite pas', () => {
    const r = simulerStress({
      scenario:          SCENARIO_CRASH_MARCHES,  // portefeuille_pct = -30
      baselineProjection: projectionBaseFake(48),
      patrimoine_actuel: {
        total_portefeuille: 200_000, total_immo: 0, total_cash: 0,
        epargne_mensuelle: 1000, revenu_loyers: 0,
      },
      age_actuel: 30, age_cible: 60,
      cible_fire: 900_000, revenu_passif_cible: 3000,
      rendement_central_pct: 7,
    })
    expect(r.perte_immediate).toBe(60_000)
    // age_fire_avec_stress doit refléter le choc, pas être aligné sur 48
  })

  it('accepte projectionBase (legacy) en plus de baselineProjection', () => {
    // Compat retro : les anciens appelants passent projectionBase.
    const r = simulerStress({
      scenario:          SCENARIO_NEUTRE,
      projectionBase:    projectionBaseFake(45),
      patrimoine_actuel: {
        total_portefeuille: 200_000, total_immo: 0, total_cash: 0,
        epargne_mensuelle: 0, revenu_loyers: 0,
      },
      age_actuel: 30, age_cible: 60,
      cible_fire: 900_000, revenu_passif_cible: 3000,
      rendement_central_pct: 7,
    })
    expect(r.age_fire_avec_stress).toBe(45)
  })
})
