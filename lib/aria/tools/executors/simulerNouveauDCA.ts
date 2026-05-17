/**
 * Tool : simule une nouvelle epargne mensuelle (DCA) et compare a la
 * trajectoire FIRE actuelle. Reutilise exclusivement `projectionGlobale`
 * et `projectionFIREIntervalle` (regle #1).
 */

import type { PatrimoineComplet } from '@/types/analyse'
import { projectionGlobale, projectionFIREIntervalle } from '@/lib/analyse/projectionFIRE'
import { buildProjectionInputs } from '../projectionInputs'

export interface SimulerNouveauDCAArgs {
  nouveau_dca_mensuel: number
}

export interface SimulerNouveauDCAResult {
  ok:                     boolean
  /** Erreur lisible si ok=false (ex: profil incomplet). */
  raison?:                string
  dca_actuel:             number
  dca_simule:             number
  age_fire_actuel:        number | null
  age_fire_simule:        number | null
  gain_en_annees:         number | null
  patrimoine_age_cible_actuel: number
  patrimoine_age_cible_simule: number
  ecart_patrimoine_eur:   number
}

export async function executeSimulerNouveauDCA(
  p: PatrimoineComplet,
  args: SimulerNouveauDCAArgs,
): Promise<SimulerNouveauDCAResult> {
  const nouveauDca = Math.max(0, Number(args.nouveau_dca_mensuel) || 0)
  const baseInputs = buildProjectionInputs(p)
  if (!baseInputs) {
    return {
      ok: false,
      raison: 'Profil incomplet : age, age cible FIRE ou revenu passif cible non renseigne.',
      dca_actuel: p.fireInputs.epargne_mensuelle ?? 0,
      dca_simule: nouveauDca,
      age_fire_actuel: null,
      age_fire_simule: null,
      gain_en_annees: null,
      patrimoine_age_cible_actuel: 0,
      patrimoine_age_cible_simule: 0,
      ecart_patrimoine_eur: 0,
    }
  }

  const actuelInterval = projectionFIREIntervalle(baseInputs)
  const simuleInterval = projectionFIREIntervalle({ ...baseInputs, epargneMensuelle: nouveauDca })

  // Patrimoine age cible : on prend la projection globale mediane.
  const actuelGlobal = projectionGlobale(baseInputs)
  const simuleGlobal = projectionGlobale({ ...baseInputs, epargneMensuelle: nouveauDca })

  const ageActuel = actuelInterval.age_fire_median
  const ageSimule = simuleInterval.age_fire_median
  const gain = ageActuel !== null && ageSimule !== null
    ? Math.round((ageActuel - ageSimule) * 10) / 10
    : null

  return {
    ok: true,
    dca_actuel:  baseInputs.epargneMensuelle,
    dca_simule:  nouveauDca,
    age_fire_actuel: ageActuel,
    age_fire_simule: ageSimule,
    gain_en_annees:  gain,
    patrimoine_age_cible_actuel: Math.round(actuelGlobal.patrimoineAgeCible),
    patrimoine_age_cible_simule: Math.round(simuleGlobal.patrimoineAgeCible),
    ecart_patrimoine_eur: Math.round(simuleGlobal.patrimoineAgeCible - actuelGlobal.patrimoineAgeCible),
  }
}
