/**
 * Simulation de projection FIRE.
 *
 * Pure (pas d'I/O) — utilisable côté serveur ET côté client. Les sliders
 * de l'UI rappellent `simulerProjection()` à chaque changement pour un
 * recalcul instantané sans appel API.
 *
 * Hypothèses de rendement par classe (annuel, conservateur) :
 *   Actions / ETF monde   → 7 %
 *   Immobilier            → 4 % (loyers nets) + 2 % valorisation = 6 %
 *   Crypto                → exclu du calcul (volatilité non modélisable)
 *   Cash                  → 3 %
 *   SCPI / REIT / etc.    → 5 %
 *
 *   rendement_portefeuille = somme(rendement_classe × poids_classe)
 *     en excluant la part crypto du dénominateur (sinon biais bas).
 *
 * Scénarios :
 *   pessimiste = central − 2 %
 *   central    = rendement_portefeuille (calculé)
 *   optimiste  = central + 2 %
 */

import type {
  PatrimoineComplet, EnrichedPosition, ProjectionPoint, ProjectionResult, AnalyseAssetType,
} from '@/types/analyse'

const RENDEMENT_PAR_CLASSE: Record<AnalyseAssetType, number> = {
  stock:   7,
  etf:     7,
  bond:    3,
  scpi:    5,    // SCPI/REIT/SIIC
  metal:   2,   // or & métaux précieux : protection inflation, rendement modeste
  crypto:  0,   // exclu : ne contribue pas au rendement central
  unknown: 0,
}
const RENDEMENT_IMMO_DIRECT = 6
const RENDEMENT_CASH        = 3

/**
 * Calcule le rendement annuel pondéré du portefeuille (en %).
 *
 * Détail : pour les positions en `crypto`, on exclut la position du
 * calcul (numérateur) MAIS aussi du dénominateur, sinon un portefeuille
 * 50 % crypto / 50 % ETF apparaîtrait avec un rendement de 3.5 % au lieu
 * de 7 %. Conséquence : le score de rendement reflète le rendement des
 * actifs investis "stables", la crypto étant traitée comme un wildcard.
 */
export function calculerRendementPortefeuille(p: PatrimoineComplet): number {
  let totalPondere = 0
  let denom        = 0

  // Positions hors crypto
  for (const pos of p.positions) {
    if (pos.asset_type === 'crypto') continue
    totalPondere += pos.current_value * (RENDEMENT_PAR_CLASSE[pos.asset_type] ?? 0)
    denom        += pos.current_value
  }
  // Immobilier
  if (p.totalImmo > 0) {
    totalPondere += p.totalImmo * RENDEMENT_IMMO_DIRECT
    denom        += p.totalImmo
  }
  // Cash
  if (p.totalCash > 0) {
    totalPondere += p.totalCash * RENDEMENT_CASH
    denom        += p.totalCash
  }

  if (denom === 0) return 0
  return Math.round((totalPondere / denom) * 100) / 100
}

/** Pour un slot client qui n'a pas le `PatrimoineComplet` complet. */
export function calculerRendementDepuisPositions(
  positions: EnrichedPosition[], totalImmo: number, totalCash: number,
): number {
  return calculerRendementPortefeuille({
    positions, totalImmo, totalCash,
  } as unknown as PatrimoineComplet)
}

// ─────────────────────────────────────────────────────────────────
// Simulation principale
// ─────────────────────────────────────────────────────────────────

export interface SimulationParams {
  patrimoineActuel:    number
  epargneMensuelle:    number
  rendementCentral:    number    // %, ex 7
  ageActuel:           number
  ageCible:            number
  revenuPassifCible:   number    // €/mois — utilisé pour calculer le patrimoine cible
  /** Optionnel : projection sur N années. Défaut = 35. */
  horizonAnnees?:      number
}

/**
 * Projette année par année (intérêts composés mensuels) sur 3 scénarios.
 *
 * Pour chaque mois :
 *   capital = capital × (1 + r/12) + epargne_mensuelle
 *   où r = rendement annuel / 100
 */
export function simulerProjection(params: SimulationParams): ProjectionResult {
  const horizon = Math.max(5, Math.min(50, params.horizonAnnees ?? 35))
  const cible   = params.revenuPassifCible * 12 * 25

  const points: ProjectionPoint[] = []
  let capP = params.patrimoineActuel  // pessimiste
  let capC = params.patrimoineActuel  // central
  let capO = params.patrimoineActuel  // optimiste

  const rP = (params.rendementCentral - 2) / 100 / 12
  const rC = params.rendementCentral / 100 / 12
  const rO = (params.rendementCentral + 2) / 100 / 12
  const m  = Math.max(0, params.epargneMensuelle)

  // Année 0 (snapshot actuel)
  points.push({
    age:        params.ageActuel,
    pessimiste: Math.round(capP),
    central:    Math.round(capC),
    optimiste:  Math.round(capO),
  })

  let ageInd: number | null = null
  let patrimoineAgeCible = capC

  for (let y = 1; y <= horizon; y++) {
    for (let mo = 0; mo < 12; mo++) {
      capP = capP * (1 + rP) + m
      capC = capC * (1 + rC) + m
      capO = capO * (1 + rO) + m
    }
    const age = params.ageActuel + y
    points.push({
      age,
      pessimiste: Math.round(capP),
      central:    Math.round(capC),
      optimiste:  Math.round(capO),
    })

    if (ageInd === null && capC >= cible) ageInd = age
    if (age === params.ageCible) patrimoineAgeCible = capC
  }

  const ecart = ageInd !== null ? ageInd - params.ageCible : null

  return {
    points,
    ageIndependanceCentral: ageInd,
    ecartObjectif:          ecart,
    patrimoineAgeCible:     Math.round(patrimoineAgeCible),
    rendementUtilise:       params.rendementCentral,
  }
}

/**
 * Compare l'effet d'augmenter / diminuer l'épargne mensuelle.
 * Renvoie le delta en années pour atteindre l'indépendance financière
 * (positif = on gagne du temps, négatif = on en perd).
 */
export function calculerImpactEpargne(
  base:           SimulationParams,
  deltaEpargne:   number,
): number {
  const refAge = simulerProjection(base).ageIndependanceCentral
  const newAge = simulerProjection({
    ...base,
    epargneMensuelle: Math.max(0, base.epargneMensuelle + deltaEpargne),
  }).ageIndependanceCentral
  if (refAge === null || newAge === null) return 0
  return refAge - newAge
}
