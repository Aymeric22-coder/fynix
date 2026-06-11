/**
 * Simulateur What-if — fonctions pures pour estimer l'impact de
 * décisions hypothétiques sur la trajectoire FIRE.
 *
 * 3 scénarios :
 *   1. Augmenter l'épargne mensuelle de +X €
 *   2. Acquérir un nouveau bien immobilier
 *   3. Modifier l'allocation cible par classe d'actif
 *
 * 100 % calculé côté client (pas d'I/O). Utilisé par
 * `components/analyse/WhatIfSimulator.tsx` qui rafraîchit en temps réel
 * sur chaque mouvement de slider.
 */

import { calculerCiblePatrimoine, swrPctFromFireType } from './constants'
import { INFLATION_DEFAUT_PCT } from './projectionFIRE'

// ─────────────────────────────────────────────────────────────────
// 1. Delta épargne mensuelle
// ─────────────────────────────────────────────────────────────────

export interface EpargneDeltaParams {
  patrimoineActuel:    number    // €
  epargneMensuelle:    number    // €/mois actuelle
  /** Delta a appliquer (peut etre negatif). */
  deltaEpargneMensuel: number    // €/mois
  rendementCentral:    number    // % annuel (ex: 7 = 7 %)
  ageActuel:           number
  ageCible:            number
  revenuPassifCible:   number    // €/mois (cible FIRE)
  /** Type FIRE (lean/standard/fat) → SWR. Optionnel : défaut standard (4 %). */
  fireType?:           string | null
}

export interface EpargneDeltaResult {
  /** Âge auquel le patrimoine atteint la cible avec l'épargne actuelle. */
  age_fire_avant:  number | null
  /** Âge avec l'épargne ajustée (actuel + delta). */
  age_fire_apres:  number | null
  /** Nombre de mois GAGNES (positif) ou perdus (négatif). Null si
   *  l'objectif est inatteignable dans l'horizon (50 ans). */
  mois_gagnes:     number | null
  /** Cible patrimoine en € (révèle l'objectif au composant UI). */
  cible_capital:   number
}

const HORIZON_MAX_ANS = 50

/**
 * Simule l'âge d'indépendance financière avec une épargne donnée, en
 * intérêts composés à `rendementAnnuel`. Retourne null si la cible n'est
 * pas atteinte dans l'horizon max (50 ans).
 */
function ageFireAvecEpargne(
  patrimoineInit:   number,
  epargneMensuelle: number,
  rendementPct:     number,
  cibleCapital:     number,
  ageActuel:        number,
): number | null {
  if (cibleCapital <= 0)        return ageActuel  // déjà atteint
  if (patrimoineInit >= cibleCapital) return ageActuel
  if (epargneMensuelle <= 0)    return null

  const r = (rendementPct / 100) / 12
  let cap   = patrimoineInit
  let mois  = 0
  const maxMois = HORIZON_MAX_ANS * 12

  while (cap < cibleCapital && mois < maxMois) {
    cap = cap * (1 + r) + epargneMensuelle
    mois++
  }
  if (cap < cibleCapital) return null
  return ageActuel + mois / 12
}

export function simulerEpargneDelta(p: EpargneDeltaParams): EpargneDeltaResult {
  // P1 — cible unifiée avec la projection FIRE (années réelles + inflation
  // + SWR du fire_type), au lieu de l'ancien × 25 figé.
  const cibleCapital = Math.max(0, calculerCiblePatrimoine(
    p.revenuPassifCible,
    Math.max(0, p.ageCible - p.ageActuel),
    INFLATION_DEFAUT_PCT,
    swrPctFromFireType(p.fireType ?? null),
  ))

  const ageAvant = ageFireAvecEpargne(
    p.patrimoineActuel, p.epargneMensuelle,
    p.rendementCentral, cibleCapital, p.ageActuel,
  )
  const ageApres = ageFireAvecEpargne(
    p.patrimoineActuel,
    Math.max(0, p.epargneMensuelle + p.deltaEpargneMensuel),
    p.rendementCentral, cibleCapital, p.ageActuel,
  )

  let moisGagnes: number | null = null
  if (ageAvant !== null && ageApres !== null) {
    moisGagnes = Math.round((ageAvant - ageApres) * 12)
  }

  return {
    age_fire_avant: ageAvant,
    age_fire_apres: ageApres,
    mois_gagnes:    moisGagnes,
    cible_capital:  cibleCapital,
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. Nouvelle acquisition immobilière
// ─────────────────────────────────────────────────────────────────

export interface NouvelleAcquisitionParams {
  patrimoineActuel:    number    // € (financier + cash, hors apport)
  epargneMensuelle:    number    // €/mois (réinvestie après acquisition)
  rendementCentral:    number    // % annuel sur le portefeuille
  ageActuel:           number
  ageCible:            number
  revenuPassifCible:   number    // €/mois (cible FIRE)
  /** Type FIRE (lean/standard/fat) → SWR. Optionnel : défaut standard (4 %). */
  fireType?:           string | null

  /** Paramètres du bien à simuler. */
  prix_bien:           number    // €
  loyer_mensuel:       number    // €/mois
  charges_mensuelles:  number    // €/mois (TF, PNO, copro, gestion…)
  apport:              number    // € (sort du patrimoine actuel)
  taux_credit_pct:     number    // % annuel
  duree_credit_ans:    number    // années
}

export interface NouvelleAcquisitionResult {
  /** Mensualité de crédit calculée (PMT classique). */
  mensualite_credit:    number
  /** Cashflow mensuel : loyer - mensualité - charges (peut être négatif). */
  impact_cashflow_mensuel: number
  /** Equity (valeur - capital_restant) à 5 ans en supposant 2 %/an
   *  d'appréciation. */
  impact_patrimoine_5ans: number
  /** Différence d'âge FIRE en mois : positif = bien fait avancer FIRE.
   *  Null si la cible n'est pas atteignable dans l'horizon. */
  impact_age_fire_mois:  number | null
  /** Erreur de validation : "apport supérieur au prix", "loyer 0"... */
  warning?:              string
}

const APPRECIATION_DEFAUT_PCT = 2

/** Mensualité PMT : M = K × t / (1 - (1+t)^-n), avec K capital, t taux mensuel,
 *  n durée en mois. Renvoie 0 si capital ou durée ≤ 0. */
function mensualitePMT(capital: number, tauxAnnuelPct: number, dureeMois: number): number {
  if (capital <= 0 || dureeMois <= 0) return 0
  const t = (tauxAnnuelPct / 100) / 12
  if (t === 0) return capital / dureeMois
  return capital * t / (1 - Math.pow(1 + t, -dureeMois))
}

/** Capital restant dû après N mois d'amortissement. */
function crdApresMois(capital: number, tauxAnnuelPct: number, mensualite: number, mois: number): number {
  if (capital <= 0 || mois <= 0) return capital
  const t = (tauxAnnuelPct / 100) / 12
  let crd = capital
  for (let i = 0; i < mois && crd > 0; i++) {
    const interets = crd * t
    const amort    = mensualite - interets
    crd = Math.max(0, crd - amort)
  }
  return crd
}

export function simulerNouvelleAcquisition(p: NouvelleAcquisitionParams): NouvelleAcquisitionResult {
  // Validation soft : on calcule quand même, mais on remonte un warning
  let warning: string | undefined
  if (p.apport > p.prix_bien) warning = 'Apport supérieur au prix du bien'

  const capitalEmprunte = Math.max(0, p.prix_bien - p.apport)
  const dureeMois       = Math.max(0, p.duree_credit_ans * 12)
  const mensualite      = mensualitePMT(capitalEmprunte, p.taux_credit_pct, dureeMois)
  const cashflow        = p.loyer_mensuel - mensualite - p.charges_mensuelles

  // Patrimoine à 5 ans :
  // - équity sur le bien = valeur appréciée - crd à 60 mois
  // - financier = (patrimoine - apport) × (1 + r)^5 + (épargne + max(0,cf)) × somme géométrique
  const valeur5  = p.prix_bien * Math.pow(1 + APPRECIATION_DEFAUT_PCT / 100, 5)
  const crd5     = crdApresMois(capitalEmprunte, p.taux_credit_pct, mensualite, 60)
  const equity5  = Math.max(0, valeur5 - crd5)

  // Cible FIRE — P1 : unifiée avec la projection (années réelles + inflation
  // + SWR du fire_type), au lieu de l'ancien × 25 figé.
  const cibleCapital = Math.max(0, calculerCiblePatrimoine(
    p.revenuPassifCible,
    Math.max(0, p.ageCible - p.ageActuel),
    INFLATION_DEFAUT_PCT,
    swrPctFromFireType(p.fireType ?? null),
  ))

  // Scénario AVANT : épargne normale, pas de bien.
  const ageAvant = ageFireAvecEpargne(
    p.patrimoineActuel, p.epargneMensuelle,
    p.rendementCentral, cibleCapital, p.ageActuel,
  )

  // Scénario APRÈS : on retire l'apport du patrimoine, et on ajoute le
  // cashflow (positif ou négatif) à l'épargne mensuelle. L'équity du bien
  // n'entre pas dans le portefeuille financier capitalisé — on le compte
  // séparément comme un bonus de patrimoine net (cf. impact_patrimoine_5ans).
  // Pour l'âge FIRE, on suppose que l'utilisateur cherche à atteindre la
  // cible via son patrimoine FINANCIER (cohérent avec scores.ts qui
  // soustrait les loyers nets de la cible — ici on les ajoute à l'épargne).
  const patrimoineApres = Math.max(0, p.patrimoineActuel - p.apport)
  const epargneApres    = Math.max(0, p.epargneMensuelle + cashflow)
  const ageApres = ageFireAvecEpargne(
    patrimoineApres, epargneApres,
    p.rendementCentral, cibleCapital, p.ageActuel,
  )

  let impactMois: number | null = null
  if (ageAvant !== null && ageApres !== null) {
    impactMois = Math.round((ageAvant - ageApres) * 12)
  }

  return {
    mensualite_credit:       Math.round(mensualite * 100) / 100,
    impact_cashflow_mensuel: Math.round(cashflow * 100) / 100,
    impact_patrimoine_5ans:  Math.round(equity5),
    impact_age_fire_mois:    impactMois,
    warning,
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. Changement de rendement par classe (allocation cible)
// ─────────────────────────────────────────────────────────────────

export interface AllocationClasse {
  /** Label libre (Actions, ETF, Crypto, Immo, Cash, Obligataire...). */
  label:       string
  /** Pourcentage cible (0-100). La somme normalisée fait 100. */
  pourcentage: number
  /** Rendement annuel attendu sur cette classe (%). */
  rendement_pct: number
}

export interface ChangementRendementParams {
  patrimoineActuel:    number
  allocationActuelle:  ReadonlyArray<AllocationClasse>
  allocationCible:     ReadonlyArray<AllocationClasse>
  /** Épargne mensuelle reinvestie au rendement moyen pondéré. */
  epargneMensuelle?:   number
  /** Horizons à projeter (en années). Défaut [5, 10, 20]. */
  horizons?:           ReadonlyArray<number>
}

export interface PointProjection {
  annees: number
  /** Patrimoine projeté avec l'allocation ACTUELLE. */
  avant:  number
  /** Patrimoine projeté avec l'allocation CIBLE. */
  apres:  number
  /** Différence (apres - avant). */
  gain:   number
}

export interface ChangementRendementResult {
  /** Rendement annuel pondéré actuel (%). */
  rendement_pondere_avant: number
  /** Rendement annuel pondéré simulé (%). */
  rendement_pondere_apres: number
  /** Points de projection. */
  points: PointProjection[]
}

/** Moyenne pondérée des rendements par classe selon les poids. */
function rendementPondere(alloc: ReadonlyArray<AllocationClasse>): number {
  const totalPct = alloc.reduce((s, a) => s + Math.max(0, a.pourcentage), 0)
  if (totalPct <= 0) return 0
  return alloc.reduce(
    (s, a) => s + (Math.max(0, a.pourcentage) / totalPct) * a.rendement_pct,
    0,
  )
}

/** Patrimoine après `annees` avec rendement composé annuel + épargne mensuelle. */
function projeter(
  patrimoine:      number,
  rendementPct:    number,
  annees:          number,
  epargneMensuelle: number,
): number {
  const r  = (rendementPct / 100) / 12
  const n  = annees * 12
  if (n <= 0) return patrimoine
  if (r === 0) return patrimoine + epargneMensuelle * n
  // Future value des intérêts composés + future value d'une annuité (DCA)
  const fvCapital = patrimoine * Math.pow(1 + r, n)
  const fvAnnuite = epargneMensuelle * ((Math.pow(1 + r, n) - 1) / r)
  return fvCapital + fvAnnuite
}

export function simulerChangementRendement(p: ChangementRendementParams): ChangementRendementResult {
  const horizons = p.horizons ?? [5, 10, 20]
  const epargne  = p.epargneMensuelle ?? 0
  const rAvant   = rendementPondere(p.allocationActuelle)
  const rApres   = rendementPondere(p.allocationCible)

  const points: PointProjection[] = horizons.map((ans) => {
    const avant = projeter(p.patrimoineActuel, rAvant, ans, epargne)
    const apres = projeter(p.patrimoineActuel, rApres, ans, epargne)
    return {
      annees: ans,
      avant:  Math.round(avant),
      apres:  Math.round(apres),
      gain:   Math.round(apres - avant),
    }
  })

  return {
    rendement_pondere_avant: Math.round(rAvant * 100) / 100,
    rendement_pondere_apres: Math.round(rApres * 100) / 100,
    points,
  }
}
