/**
 * Tool : simule une acquisition immobiliere future (RP ou locatif) et
 * mesure l'impact sur la trajectoire FIRE.
 *
 * Reutilise `projectionGlobale` avec `acquisitionsFutures` (geree
 * nativement par lib/analyse/projectionFIRE).
 */

import type { AcquisitionFuture, PatrimoineComplet } from '@/types/analyse'
import { projectionGlobale } from '@/lib/analyse/projectionFIRE'
import { buildProjectionInputs } from '../projectionInputs'

export interface SimulerAcquisitionFutureArgs {
  prix_achat:          number
  apport:              number
  dans_combien_annees: number
  type:                'locatif' | 'RP'
  loyer_brut_mensuel?: number
  duree_credit_ans:    number
  taux_interet:        number
}

export interface SimulerAcquisitionFutureResult {
  ok:                       boolean
  raison?:                  string
  acquisition?:             AcquisitionFuture
  age_fire_sans_acquisition: number | null
  age_fire_avec_acquisition: number | null
  delta_annees:             number | null
  patrimoine_age_cible_sans: number
  patrimoine_age_cible_avec: number
  delta_patrimoine_eur:     number
}

export async function executeSimulerAcquisitionFuture(
  p: PatrimoineComplet,
  args: SimulerAcquisitionFutureArgs,
): Promise<SimulerAcquisitionFutureResult> {
  const baseInputs = buildProjectionInputs(p)
  if (!baseInputs) {
    return {
      ok: false,
      raison: 'Profil incomplet : age, age cible FIRE ou revenu passif cible non renseigne.',
      age_fire_sans_acquisition: null,
      age_fire_avec_acquisition: null,
      delta_annees: null,
      patrimoine_age_cible_sans: 0,
      patrimoine_age_cible_avec: 0,
      delta_patrimoine_eur: 0,
    }
  }

  const acquisition: AcquisitionFuture = {
    id:                       `aria-${Date.now()}`,
    nom:                      'Acquisition simulee',
    dans_combien_annees:      Math.max(0, Math.min(20, Number(args.dans_combien_annees) || 0)),
    prix_achat:               Math.max(0, Number(args.prix_achat) || 0),
    frais_notaire_pct:        8,
    apport:                   Math.max(0, Number(args.apport) || 0),
    taux_interet:             Number(args.taux_interet) || 3,
    duree_credit_ans:         Math.max(5, Math.min(30, Number(args.duree_credit_ans) || 20)),
    type:                     args.type === 'RP' ? 'RP' : 'locatif',
    loyer_brut_mensuel:       args.type === 'RP' ? 0 : Math.max(0, Number(args.loyer_brut_mensuel) || 0),
    taux_vacance_pct:         5,
    charges_mensuelles:       0,
    appreciation_annuelle_pct: 2,
  }

  const sans = projectionGlobale(baseInputs)
  const avec = projectionGlobale({ ...baseInputs, acquisitionsFutures: [acquisition] })

  const delta = sans.ageIndependanceCentral !== null && avec.ageIndependanceCentral !== null
    ? Math.round((avec.ageIndependanceCentral - sans.ageIndependanceCentral) * 10) / 10
    : null

  return {
    ok: true,
    acquisition,
    age_fire_sans_acquisition: sans.ageIndependanceCentral,
    age_fire_avec_acquisition: avec.ageIndependanceCentral,
    delta_annees:              delta,
    patrimoine_age_cible_sans: Math.round(sans.patrimoineAgeCible),
    patrimoine_age_cible_avec: Math.round(avec.patrimoineAgeCible),
    delta_patrimoine_eur:      Math.round(avec.patrimoineAgeCible - sans.patrimoineAgeCible),
  }
}
