/**
 * Projection d'indépendance financière « 60 secondes » — calcul pur
 * à partir de 3 inputs minimaux (âge, patrimoine actuel, revenu mensuel).
 *
 * Hypothèses voluntairement simplifiées pour éviter le jargon en porte
 * d'entrée. L'utilisateur peut affiner ensuite via le wizard /profil
 * qui prend en compte sa TMI, ses enveloppes, ses biens immo, etc.
 *
 * Fonction PURE — pas d'I/O, pas de hook React, pas d'import Supabase.
 * Réutilise SWR_STANDARD_PCT depuis lib/analyse/constants.ts pour rester
 * aligné avec le moteur de projection FIRE principal.
 */

import { SWR_STANDARD_PCT } from '@/lib/analyse/constants'

// ─────────────────────────────────────────────────────────────────
// Hypothèses par défaut (simplifiées pour onboarding)
// ─────────────────────────────────────────────────────────────────

export const QUICK_HYPOTHESES = {
  /** Part du revenu net mensuel allouée à l'épargne (20 %). */
  tauxEpargne:         0.20,
  /** Rendement annuel composé attendu (7 %, médiane historique ETF World
   *  net d'inflation à long terme — hypothèse standard FIRE FR). */
  rendementAnnuel:     0.07,
  /** Inflation générale annuelle (2 %, cible BCE). Sert à indexer la
   *  cible de patrimoine sur l'horizon de calcul. */
  inflationAnnuelle:   0.02,
  /** Taux de retrait sécurisé (SWR) — règle des 25× / Trinity Study.
   *  Aligné sur lib/analyse/constants.ts. */
  swrPct:              SWR_STANDARD_PCT / 100,
  /** Revenu cible à l'indépendance = X % du revenu actuel net (70 %).
   *  Reflète une consommation typiquement plus basse (pas de cotisations
   *  retraite, train de vie ajusté). */
  revenuCible:         0.70,
  /** Horizon max de simulation (80 ans). Au-delà : ageIndependance = null
   *  (« objectif non atteint » dans l'horizon raisonnable). */
  ageMax:              80,
} as const

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export interface QuickProjectionInput {
  /** Âge actuel en années (18-70). */
  age:                number
  /** Patrimoine net actuel total (€). Peut être 0 pour un débutant. */
  patrimoineActuel:   number
  /** Revenu mensuel net (€) après impôts. > 0. */
  revenuMensuelNet:   number
}

export interface TrajectoirePoint {
  annee:      number   // index 0..N depuis aujourd'hui
  age:        number
  patrimoine: number
}

export interface QuickProjectionResult {
  /** Âge auquel le patrimoine projeté dépasse la cible inflation-adjusted.
   *  Null si jamais atteint avant ageMax. */
  ageIndependance:          number | null
  /** Nb d'années restantes depuis aujourd'hui jusqu'à l'indépendance.
   *  Null si ageIndependance est null. */
  anneesRestantes:          number | null
  /** Patrimoine cible nominal à l'âge d'indépendance (ou à ageMax si
   *  non atteint), inflation-adjusted depuis la cible d'aujourd'hui. */
  patrimoineNecessaire:     number
  /** Épargne mensuelle estimée (revenu × tauxEpargne). */
  epargneMensuelleEstimee:  number
  /** Taux d'épargne en pourcentage (ex: 20 pour 20 %). */
  tauxEpargnePct:           number
  /** Trajectoire année par année jusqu'à ageMax (ou jusqu'à 5 ans après
   *  l'indépendance pour le graph). Inclut année 0 = patrimoine actuel. */
  trajectoire:              TrajectoirePoint[]
}

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

/**
 * Calcule la projection d'indépendance financière à partir des 3 inputs.
 *
 * Algorithme :
 *  1. Épargne mensuelle = revenu × tauxEpargne (constante sur l'horizon)
 *  2. Cible NOMINALE à l'âge t = (revenu × 12 × revenuCible) / swr × (1+infl)^t
 *     → indexée inflation pour préserver le pouvoir d'achat
 *  3. Simule patrimoine[t+1] = (patrimoine[t] + epargne*12) × (1 + rendement)
 *  4. Indépendance = 1er t où patrimoine[t] ≥ cible_nominale[t]
 */
export function calculerQuickProjection(input: QuickProjectionInput): QuickProjectionResult {
  const { age, patrimoineActuel, revenuMensuelNet } = input

  const epargneMensuelle  = revenuMensuelNet * QUICK_HYPOTHESES.tauxEpargne
  const epargneAnnuelle   = epargneMensuelle * 12
  const cibleAujourdhui   = (revenuMensuelNet * 12 * QUICK_HYPOTHESES.revenuCible) / QUICK_HYPOTHESES.swrPct

  const horizonAnnees = Math.max(0, QUICK_HYPOTHESES.ageMax - age)
  const trajectoire: TrajectoirePoint[] = []

  let patrimoine = Math.max(0, patrimoineActuel)
  let ageIndependance: number | null = null

  for (let t = 0; t <= horizonAnnees; t++) {
    const ageT = age + t
    trajectoire.push({ annee: t, age: ageT, patrimoine })

    const cibleT = cibleAujourdhui * Math.pow(1 + QUICK_HYPOTHESES.inflationAnnuelle, t)

    if (ageIndependance === null && patrimoine >= cibleT) {
      ageIndependance = ageT
    }

    // Préparer l'année suivante : on ajoute l'épargne en début d'année puis
    // on capitalise au rendement annuel composé.
    patrimoine = (patrimoine + epargneAnnuelle) * (1 + QUICK_HYPOTHESES.rendementAnnuel)
  }

  const anneesRestantes = ageIndependance !== null ? ageIndependance - age : null
  // Cible à reporter : à l'âge d'indépendance s'il est atteint, sinon à
  // l'horizon max (donne un repère « il manque combien »).
  const tCible = ageIndependance !== null
    ? ageIndependance - age
    : horizonAnnees
  const patrimoineNecessaire = cibleAujourdhui * Math.pow(1 + QUICK_HYPOTHESES.inflationAnnuelle, tCible)

  return {
    ageIndependance,
    anneesRestantes,
    patrimoineNecessaire,
    epargneMensuelleEstimee: epargneMensuelle,
    tauxEpargnePct:          QUICK_HYPOTHESES.tauxEpargne * 100,
    trajectoire,
  }
}
