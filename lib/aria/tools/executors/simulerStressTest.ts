/**
 * Tool : simule un scenario de stress preconfigure et compare a la
 * trajectoire normale. Reutilise `simulerStress` + `SCENARIOS_STRESS`
 * exposes par `lib/analyse/stressTest`.
 */

import type { PatrimoineComplet } from '@/types/analyse'
import { projectionGlobale } from '@/lib/analyse/projectionFIRE'
import { simulerStress, SCENARIOS_STRESS } from '@/lib/analyse/stressTest'
import { buildProjectionInputs } from '../projectionInputs'

export interface SimulerStressTestArgs {
  scenario_id: string
}

export interface SimulerStressTestResult {
  ok:                       boolean
  raison?:                  string
  scenario_id:              string
  scenario_label?:          string
  scenario_description?:    string
  perte_immediate_eur?:     number
  patrimoine_choque_eur?:   number
  age_fire_sans_stress?:    number | null
  age_fire_avec_stress?:    number | null
  retard_mois?:             number | null
  annees_recuperation?:     number | null
  objectif_atteint?:        boolean
  revenu_passif_a_age_cible_eur?: number
}

export async function executeSimulerStressTest(
  p: PatrimoineComplet,
  args: SimulerStressTestArgs,
): Promise<SimulerStressTestResult> {
  const scenarioId = String(args.scenario_id || '').trim()
  const scenario = SCENARIOS_STRESS.find((s) => s.id === scenarioId)
  if (!scenario) {
    return {
      ok: false,
      raison: `Scenario inconnu : ${scenarioId}. Valeurs valides : ${SCENARIOS_STRESS.map((s) => s.id).join(', ')}.`,
      scenario_id: scenarioId,
    }
  }

  const baseInputs = buildProjectionInputs(p)
  if (!baseInputs) {
    return {
      ok: false,
      raison: 'Profil incomplet : age, age cible FIRE ou revenu passif cible non renseigne.',
      scenario_id: scenarioId,
      scenario_label: scenario.label,
      scenario_description: scenario.description,
    }
  }

  const baseline = projectionGlobale(baseInputs)

  const result = simulerStress({
    scenario,
    baselineProjection: baseline,
    patrimoine_actuel: {
      total_portefeuille: p.totalPortefeuille,
      total_immo:         p.totalImmo,
      total_cash:         p.totalCash,
      epargne_mensuelle:  baseInputs.epargneMensuelle,
      revenu_loyers:      Math.max(0, p.revenuPassifImmo),
    },
    age_actuel:           baseInputs.ageActuel,
    age_cible:            baseInputs.ageCible,
    cible_fire:           baseline.ciblePatrimoineAjusteeInflation,
    revenu_passif_cible:  baseInputs.revenuPassifCible,
    rendement_central_pct: baseInputs.rendementCentral,
    swr_pct:              baseInputs.swrPct,
    inflation_pct:        baseInputs.inflationPct,
  })

  return {
    ok: true,
    scenario_id:           scenario.id,
    scenario_label:        scenario.label,
    scenario_description:  scenario.description,
    perte_immediate_eur:   Math.round(result.perte_immediate),
    patrimoine_choque_eur: Math.round(result.patrimoine_choque),
    age_fire_sans_stress:  result.age_fire_sans_stress,
    age_fire_avec_stress:  result.age_fire_avec_stress,
    retard_mois:           result.retard_mois,
    annees_recuperation:   result.annees_recuperation,
    objectif_atteint:      result.objectif_atteint,
    revenu_passif_a_age_cible_eur: Math.round(result.revenu_passif_a_age_cible),
  }
}
