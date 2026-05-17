/**
 * Stress tests FIRE — simule l'impact d'une crise sur la trajectoire.
 *
 * 6 scénarios préconfigurés (crash boursier, vacance locative, perte
 * d'emploi, hausse des taux, inflation forte, double peine). Chaque
 * scénario applique :
 *   1. Un choc immédiat sur le patrimoine (portefeuille)
 *   2. Une phase de choc durant `duree_mois` avec rendement/épargne/loyers
 *      dégradés
 *   3. Une phase de récupération graduelle sur 12 mois (interpolation
 *      linéaire entre params dégradés et params normaux)
 *   4. Une phase normale jusqu'à l'horizon de projection
 *
 * Pure (pas d'I/O), calculs 100 % client. Compare avec la projection
 * de base pour produire des métriques actionnables (retard FIRE,
 * années de récupération, etc.).
 */

import type { ProjectionGlobaleResult } from '@/types/analyse'

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export interface ImpactStress {
  /** Choc immédiat (%) sur la valeur du portefeuille financier (négatif = perte). */
  portefeuille_pct:    number
  /** Choc (%) sur les loyers perçus pendant la phase de choc. */
  loyers_pct:          number
  /** Choc (%) sur la capacité d'épargne mensuelle pendant la phase de choc. */
  epargne_pct:         number
  /** Durée du choc avant retour graduel (mois). */
  duree_mois:          number
  /** Variation absolue du rendement annuel pendant le choc (points de %). */
  rendement_delta_pct: number
}

export interface ScenarioStress {
  id:          string
  label:       string
  description: string
  icone:       string
  impact:      ImpactStress
}

export interface PatrimoineActuelStress {
  total_portefeuille: number
  total_immo:         number
  total_cash:         number
  /** Épargne mensuelle de base (avant choc). */
  epargne_mensuelle:  number
  /** Revenu mensuel de loyers nets (cashflow immo positif). */
  revenu_loyers:      number
}

export interface StressParams {
  scenario:          ScenarioStress
  /** Résultat de la projection NORMALE (baseline pour comparaison).
   *  Sprint 1 — I5 : sert aussi de point d'ancrage. Quand le scenario a un
   *  impact strictement nul (tous les chocs a 0), on aligne directement
   *  ageFireAvecStress sur baselineProjection.ageIndependanceCentral au
   *  lieu de recalculer une trajectoire mensuelle qui diverge legerement
   *  (algo mensuel vs annuel, pas d'amortissement crédit, etc.). */
  baselineProjection: ProjectionGlobaleResult
  patrimoine_actuel: PatrimoineActuelStress
  age_actuel:        number
  age_cible:         number
  /** Cible patrimoine FIRE (ajustée inflation, calculée dans baselineProjection). */
  cible_fire:        number
  /** Cible revenu passif mensuel (€/mois en € constants). */
  revenu_passif_cible: number
  /** Rendement annuel central du portefeuille (%). */
  rendement_central_pct: number
  /** SWR utilisé (%). Défaut 4. */
  swr_pct?:          number
  /** Inflation (%/an) pour indexer la cible revenu. Défaut 2. */
  inflation_pct?:    number
  /** Horizon de simulation en années (défaut 35). */
  horizon_annees?:   number
}

/** @deprecated Compat pour appels qui passent encore `projectionBase`. */
export type StressParamsLegacy = Omit<StressParams, 'baselineProjection'> & {
  projectionBase: ProjectionGlobaleResult
}

export interface ResultatStress {
  scenario_id:                string
  /** Valeur immédiate du portefeuille APRÈS choc instantané. */
  patrimoine_choque:          number
  /** Montant perdu instantanément (€, positif). */
  perte_immediate:            number
  /** Âge FIRE sans stress (baseline). null = hors horizon. */
  age_fire_sans_stress:       number | null
  /** Âge FIRE après le scénario. null = hors horizon ou inatteignable. */
  age_fire_avec_stress:       number | null
  /** Retard en mois (positif). 0 si pas de retard, null si non comparable. */
  retard_mois:                number | null
  /** Nombre d'années pour revenir au patrimoine total pré-choc. null si jamais. */
  annees_recuperation:        number | null
  /** Patrimoine total projeté à l'âge cible avec stress. */
  patrimoine_a_age_cible:     number
  /** Revenu passif mensuel projeté à l'âge cible avec stress (€/mois). */
  revenu_passif_a_age_cible:  number
  /** True si la cible FIRE est encore atteinte malgré le stress. */
  objectif_atteint:           boolean
  /** Courbe annuelle stressée pour superposition graphique. */
  courbe_stressee:            Array<{ age: number; valeur: number }>
  /** Phase de choc : âge début / âge fin (pour ReferenceArea). */
  phase_choc:                 { age_debut: number; age_fin: number }
}

// ─────────────────────────────────────────────────────────────────
// Scénarios préconfigurés
// ─────────────────────────────────────────────────────────────────

export const SCENARIO_CRASH_MARCHES: ScenarioStress = {
  id:          'crash_marches',
  label:       'Crash boursier -30 %',
  description: 'Chute brutale des marchés actions et ETF similaire à 2008 ou 2020.',
  icone:       '📉',
  impact: {
    portefeuille_pct:    -30,
    loyers_pct:          0,
    epargne_pct:         0,
    duree_mois:          18,
    rendement_delta_pct: -5,
  },
}

export const SCENARIO_VACANCE_LOCATIVE: ScenarioStress = {
  id:          'vacance_locative',
  label:       'Vacance locative 6 mois',
  description: "Perte totale des loyers sur l'ensemble du parc immobilier pendant 6 mois.",
  icone:       '🏚️',
  impact: {
    portefeuille_pct:    0,
    loyers_pct:          -100,
    epargne_pct:         -30,
    duree_mois:          6,
    rendement_delta_pct: 0,
  },
}

export const SCENARIO_PERTE_EMPLOI: ScenarioStress = {
  id:          'perte_emploi',
  label:       "Perte d'emploi 12 mois",
  description: 'Arrêt total des revenus salariaux pendant un an, épargne fortement réduite.',
  icone:       '💼',
  impact: {
    portefeuille_pct:    0,
    loyers_pct:          0,
    epargne_pct:         -80,
    duree_mois:          12,
    rendement_delta_pct: 0,
  },
}

export const SCENARIO_HAUSSE_TAUX: ScenarioStress = {
  id:          'hausse_taux',
  label:       'Hausse des taux +3 %',
  description: 'Remontée brutale des taux directeurs impactant les rendements obligataires et immo.',
  icone:       '📈',
  impact: {
    portefeuille_pct:    -15,
    loyers_pct:          0,
    epargne_pct:         0,
    duree_mois:          36,
    rendement_delta_pct: -2,
  },
}

export const SCENARIO_INFLATION_FORTE: ScenarioStress = {
  id:          'inflation_forte',
  label:       'Inflation à 6 % pendant 3 ans',
  description: "Résurgence de l'inflation réduisant le pouvoir d'achat et les rendements réels.",
  icone:       '🔥',
  impact: {
    portefeuille_pct:    0,
    loyers_pct:          10,    // les loyers suivent partiellement (IRL)
    epargne_pct:         -20,
    duree_mois:          36,
    rendement_delta_pct: -4,
  },
}

export const SCENARIO_DOUBLE_PEINE: ScenarioStress = {
  id:          'double_peine',
  label:       'Scénario catastrophe',
  description: 'Crash boursier + perte d\'emploi simultanés. Le pire scénario plausible.',
  icone:       '⚠️',
  impact: {
    portefeuille_pct:    -25,
    loyers_pct:          0,
    epargne_pct:         -70,
    duree_mois:          18,
    rendement_delta_pct: -4,
  },
}

/** Liste ordonnée des 6 scénarios — consommée par l'UI. */
export const SCENARIOS_STRESS: ReadonlyArray<ScenarioStress> = [
  SCENARIO_CRASH_MARCHES,
  SCENARIO_VACANCE_LOCATIVE,
  SCENARIO_PERTE_EMPLOI,
  SCENARIO_HAUSSE_TAUX,
  SCENARIO_INFLATION_FORTE,
  SCENARIO_DOUBLE_PEINE,
]

// ─────────────────────────────────────────────────────────────────
// Constantes simulation
// ─────────────────────────────────────────────────────────────────

/** Durée de la récupération graduelle après la phase de choc (mois). */
const RECUP_MOIS = 12

/** SWR par défaut si non fourni. */
const SWR_DEFAUT = 4

/** Inflation par défaut si non fournie. */
const INFLATION_DEFAUT = 2

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

/**
 * Simule un scénario de stress et compare à la projection de base.
 *
 * Algorithme :
 *   1. Choc immédiat sur le portefeuille → patrimoine_choque.
 *   2. Mois 0..duree_mois : épargne et rendement réduits selon scenario.impact.
 *   3. Mois duree_mois..duree_mois+12 : retour graduel (interpolation linéaire).
 *   4. Au-delà : params normaux (rendement central, épargne base, loyers complets).
 *   5. La courbe annuelle est captée à chaque fin d'année (12 / 24 / 36... mois).
 *   6. Détection âge FIRE : 1ère année où revenu_potentiel ≥ cible_indexée.
 *   7. Récupération : 1ère année où patrimoine total ≥ patrimoine_total_initial.
 */
export function simulerStress(params: StressParams | StressParamsLegacy): ResultatStress {
  // Accepte `baselineProjection` (nouveau) ou `projectionBase` (legacy).
  const baseline = 'baselineProjection' in params
    ? params.baselineProjection
    : (params as StressParamsLegacy).projectionBase
  const {
    scenario, patrimoine_actuel, age_actuel, age_cible,
    cible_fire, revenu_passif_cible, rendement_central_pct,
  } = params

  const swrPct        = params.swr_pct        ?? SWR_DEFAUT
  const swrFraction   = swrPct / 100
  const inflationPct  = params.inflation_pct  ?? INFLATION_DEFAUT
  const horizonAnnees = Math.max(5, Math.min(50, params.horizon_annees ?? 35))

  const imp = scenario.impact

  // ── 1. Choc immédiat ────────────────────────────────────────────
  const portefeuilleChoque = patrimoine_actuel.total_portefeuille * (1 + imp.portefeuille_pct / 100)
  const perteImmediate     = Math.max(0, patrimoine_actuel.total_portefeuille - portefeuilleChoque)

  // Patrimoine total INITIAL (pré-choc) — baseline pour la récupération.
  const patrimoineTotalInitial = patrimoine_actuel.total_portefeuille
                               + patrimoine_actuel.total_immo
                               + patrimoine_actuel.total_cash

  // ── 2. Simulation mensuelle ─────────────────────────────────────
  // On simule mois par mois sur tout l'horizon, en appliquant un facteur
  // de "sévérité" qui décroît de 1 à 0 pendant la phase de récup.
  //
  //   sévérité(m) = 1                              si m < duree_mois
  //                 1 - (m - duree_mois) / RECUP   si duree_mois ≤ m < duree_mois+RECUP
  //                 0                              sinon
  //
  // Paramètres à l'instant m :
  //   rendement  = rendement_base + impact.rendement_delta × sévérité
  //   épargne    = épargne_base   × (1 + impact.epargne_pct/100 × sévérité)
  //   loyers     = loyers_base    × (1 + impact.loyers_pct/100  × sévérité)

  const horizonMois = horizonAnnees * 12

  let portefeuille = portefeuilleChoque
  // L'immo et le cash ne sont pas touchés par le choc instantané, mais
  // évoluent (loyers réinjectés dans portefeuille, cash composé doucement).
  let cash         = patrimoine_actuel.total_cash
  const immo       = patrimoine_actuel.total_immo  // valeur figée pour cette simulation

  // Snapshot t=0 (juste après le choc instantané)
  const courbeStressee: Array<{ age: number; valeur: number }> = [
    { age: age_actuel, valeur: portefeuille + immo + cash },
  ]

  // Premiers points (mois 0) : on attend la fin de l'année pour snapshot annuel.
  let ageFireAvecStress: number | null = null
  let anneesRecup:       number | null = null

  for (let m = 1; m <= horizonMois; m++) {
    const severite = severitePourMois(m - 1, imp.duree_mois, RECUP_MOIS)

    // Rendement annuel ajusté pendant le choc (delta négatif typiquement)
    const rendementMensuel = ((rendement_central_pct + imp.rendement_delta_pct * severite) / 100) / 12
    // Épargne mensuelle ajustée
    const epargneMensuelle = patrimoine_actuel.epargne_mensuelle
      * (1 + (imp.epargne_pct / 100) * severite)
    // Loyers mensuels ajustés (peuvent être boostés par inflation forte)
    const loyersMensuels = patrimoine_actuel.revenu_loyers
      * (1 + (imp.loyers_pct / 100) * severite)

    // Compose portefeuille
    portefeuille = portefeuille * (1 + rendementMensuel) + Math.max(0, epargneMensuelle) + Math.max(0, loyersMensuels)
    // Cash composé doucement (Livret A taux constant 3 %)
    cash = cash * (1 + 0.03 / 12)

    // Snapshot annuel
    if (m % 12 === 0) {
      const annee = m / 12
      const age   = age_actuel + annee
      const total = portefeuille + immo + cash
      courbeStressee.push({ age, valeur: total })

      // Détection âge FIRE :
      //   revenu_potentiel_annuel = total × SWR
      //   cible_annuelle_indexée  = revenu_passif_cible × 12 × (1 + inflation)^annee
      //
      // Sprint 1 — I6 : on ne re-ajoute PAS loyersAnnuelsNormaux ici. Les
      // loyers sont deja capitalises dans `portefeuille` mois par mois
      // (ligne 295) ; les compter aussi en flux SWR serait du double comptage
      // → ageFireAvecStress artificiellement avance.
      const cibleAnnuelle    = revenu_passif_cible * 12 * Math.pow(1 + inflationPct / 100, annee)
      const revenuPotentielAnnuel = total * swrFraction
      if (ageFireAvecStress === null && revenuPotentielAnnuel >= cibleAnnuelle) {
        ageFireAvecStress = age
      }

      // Détection récupération : 1ère année où total ≥ patrimoine pré-choc
      if (anneesRecup === null && total >= patrimoineTotalInitial && annee > 0) {
        anneesRecup = annee
      }
    }
  }

  // ── 3. Snapshot à l'âge cible (interpolation linéaire si nécessaire) ───
  const patrimoineAgeCible = interpolerCourbe(courbeStressee, age_cible)
  // Revenu passif mensuel à l'âge cible = patrimoine × SWR / 12 + loyers
  const revenuPassifMensuelAgeCible =
    (patrimoineAgeCible * swrFraction) / 12 + Math.max(0, patrimoine_actuel.revenu_loyers)

  // ── 4. Comparaison à la baseline ────────────────────────────────
  const ageFireBaseline = baseline.ageIndependanceCentral

  // Sprint 1 — I5 : ancrage scenario neutre. Si tous les chocs sont a 0,
  // on aligne directement sur la baseline pour eviter la divergence
  // structurelle entre l'algo de stress (mensuel constant) et l'algo de
  // projectionGlobale (annuel avec amortissement credit, croissance
  // d'epargne, etc.). Garantit que stress(scenario_neutre) == baseline.
  const isNeutralScenario =
    imp.portefeuille_pct    === 0 &&
    imp.loyers_pct          === 0 &&
    imp.epargne_pct         === 0 &&
    imp.rendement_delta_pct === 0
  if (isNeutralScenario) {
    ageFireAvecStress = ageFireBaseline
  }

  let retardMois: number | null = null
  if (ageFireBaseline !== null && ageFireAvecStress !== null) {
    retardMois = Math.max(0, Math.round((ageFireAvecStress - ageFireBaseline) * 12))
  } else if (ageFireBaseline !== null && ageFireAvecStress === null) {
    // L'objectif baseline était atteignable, plus avec le stress
    retardMois = null  // « inatteignable »
  } else if (ageFireBaseline === null && ageFireAvecStress === null) {
    retardMois = 0  // déjà inatteignable des deux côtés, pas de retard imputable
  }

  // Objectif atteint malgré le stress : patrimoine projeté à l'âge cible
  // est suffisant pour générer le revenu cible avec le SWR.
  // (Critère cohérent avec la cible FIRE inflation-adjusted.)
  const objectifAtteint = patrimoineAgeCible >= cible_fire

  // ── 5. Phase de choc (pour ReferenceArea) ──────────────────────
  const phaseChocAgeFin = age_actuel + (imp.duree_mois + RECUP_MOIS) / 12

  return {
    scenario_id:               scenario.id,
    patrimoine_choque:         Math.round(portefeuilleChoque),
    perte_immediate:           Math.round(perteImmediate),
    age_fire_sans_stress:      ageFireBaseline,
    age_fire_avec_stress:      ageFireAvecStress,
    retard_mois:               retardMois,
    annees_recuperation:       anneesRecup,
    patrimoine_a_age_cible:    Math.round(patrimoineAgeCible),
    revenu_passif_a_age_cible: Math.round(revenuPassifMensuelAgeCible),
    objectif_atteint:          objectifAtteint,
    courbe_stressee:           courbeStressee.map((p) => ({ age: p.age, valeur: Math.round(p.valeur) })),
    phase_choc: {
      age_debut: age_actuel,
      age_fin:   phaseChocAgeFin,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Sévérité du choc à l'instant m (entre 0 et 1).
 *  - m < dureeMois          → 1   (plein choc)
 *  - m < dureeMois + recup  → linéaire de 1 à 0 (récup graduelle)
 *  - sinon                  → 0   (retour normal) */
function severitePourMois(mZeroBased: number, dureeMois: number, recupMois: number): number {
  if (mZeroBased < dureeMois) return 1
  if (mZeroBased < dureeMois + recupMois) {
    return 1 - (mZeroBased - dureeMois) / recupMois
  }
  return 0
}

/** Interpole linéairement la valeur de la courbe à un âge donné.
 *  Si l'âge est hors plage, renvoie la valeur la plus proche. */
function interpolerCourbe(
  courbe: ReadonlyArray<{ age: number; valeur: number }>,
  age:    number,
): number {
  if (courbe.length === 0) return 0
  if (age <= courbe[0]!.age)                   return courbe[0]!.valeur
  if (age >= courbe[courbe.length - 1]!.age)   return courbe[courbe.length - 1]!.valeur
  for (let i = 1; i < courbe.length; i++) {
    const a = courbe[i - 1]!
    const b = courbe[i]!
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age)
      return a.valeur + t * (b.valeur - a.valeur)
    }
  }
  return courbe[courbe.length - 1]!.valeur
}
