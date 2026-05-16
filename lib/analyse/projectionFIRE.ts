/**
 * Simulation de projection FIRE multi-composantes.
 *
 * Combine 4 composantes du patrimoine année par année :
 *   1. Patrimoine financier (DCA + intérêts composés + cashflow immo positif)
 *   2. Biens immo existants (amortissement crédit + appréciation valeur)
 *   3. Acquisitions immo futures (déclenchées à year N : apport + crédit)
 *   4. Cash (composé à 3 %)
 *
 * Pure (pas d'I/O) — utilisable côté serveur ET côté client. Les sliders
 * de l'UI rappellent `projectionGlobale()` à chaque changement pour un
 * recalcul instantané sans appel API.
 *
 * Hypothèses de rendement par classe (annuel, conservateur) :
 *   Actions / ETF monde   → 7 % (paramètre `rendementCentral`)
 *   Immobilier valeur     → +2 %/an (paramètre `appreciationImmoPct`)
 *   Loyers (inflation)    → +1.5 %/an (paramètre `inflationLoyersPct`)
 *   Cash                  → 3 %/an (taux Livret A constant)
 *
 * Scénarios pour le portefeuille financier :
 *   pessimiste = central − 2 %
 *   central    = paramètre fourni
 *   optimiste  = central + 2 %
 */

import type {
  PatrimoineComplet, EnrichedPosition, AnalyseAssetType, BienImmo,
  AcquisitionFuture, AnneeProjection, ProjectionGlobaleResult, ProjectionInputs,
  ProjectionPoint, ProjectionResult,
} from '@/types/analyse'

const RENDEMENT_PAR_CLASSE: Record<AnalyseAssetType, number> = {
  stock:   7,
  etf:     7,
  bond:    3,
  scpi:    5,
  metal:   2,
  crypto:  0,
  unknown: 0,
}
const RENDEMENT_IMMO_DIRECT = 6
const RENDEMENT_CASH        = 3

// ─────────────────────────────────────────────────────────────────
// Rendement central du portefeuille (utilisé pour les sliders init)
// ─────────────────────────────────────────────────────────────────

export function calculerRendementPortefeuille(p: PatrimoineComplet): number {
  let totalPondere = 0
  let denom        = 0
  for (const pos of p.positions) {
    if (pos.asset_type === 'crypto') continue
    totalPondere += pos.current_value * (RENDEMENT_PAR_CLASSE[pos.asset_type] ?? 0)
    denom        += pos.current_value
  }
  if (p.totalImmo > 0) {
    totalPondere += p.totalImmo * RENDEMENT_IMMO_DIRECT
    denom        += p.totalImmo
  }
  if (p.totalCash > 0) {
    totalPondere += p.totalCash * RENDEMENT_CASH
    denom        += p.totalCash
  }
  if (denom === 0) return 0
  return Math.round((totalPondere / denom) * 100) / 100
}

export function calculerRendementDepuisPositions(
  positions: EnrichedPosition[], totalImmo: number, totalCash: number,
): number {
  return calculerRendementPortefeuille({
    positions, totalImmo, totalCash,
  } as unknown as PatrimoineComplet)
}

// ─────────────────────────────────────────────────────────────────
// Simulation par composante
// ─────────────────────────────────────────────────────────────────

/** Snapshot annuel d'un bien (existant ou futur). */
interface BienAnnee {
  valeur:           number
  credit_restant:   number
  mensualite:       number   // €/mois, devient 0 quand crédit soldé
  equity:           number
  loyer_annuel:     number   // brut (déjà × 12)
  charges_annuelles: number  // hors mensualité crédit
  cashflow_annuel:  number   // loyer − charges − mensualité × 12
}

/**
 * Simule l'évolution d'un bien existant sur N années.
 *
 *   - Le crédit s'amortit : capital_restant -= (mensualite × 12 − intérêts).
 *   - La valeur s'apprécie de `appreciationPct` / an.
 *   - Le loyer s'apprécie de `inflationLoyersPct` / an (IRL).
 *   - Les charges suivent l'inflation loyers.
 *
 * Retourne un snapshot par année (année 0 = état actuel inclus).
 */
export function simulerBienExistant(
  bien:                BienImmo,
  annees:              number,
  appreciationPct:     number,
  inflationLoyersPct:  number,
): BienAnnee[] {
  const tauxAnnuel = bien.taux_interet_estime / 100
  const tauxMensuel = tauxAnnuel / 12
  const dureeRestanteMois = bien.duree_restante_mois

  let valeur          = bien.valeur
  let creditRestant   = bien.credit_restant
  let loyerMensuel    = bien.loyer_mensuel
  let chargesAnn      = bien.charges_annuelles
  let mensualite      = bien.mensualite_credit
  let moisEcoules     = 0

  const points: BienAnnee[] = []
  for (let y = 0; y <= annees; y++) {
    // Snapshot année y
    const equity        = Math.max(0, valeur - creditRestant)
    const loyerAnnuel   = loyerMensuel * 12
    const cashflowAnnuel = loyerAnnuel - chargesAnn - mensualite * 12
    points.push({
      valeur:            Math.round(valeur),
      credit_restant:    Math.round(creditRestant),
      mensualite,
      equity:            Math.round(equity),
      loyer_annuel:      Math.round(loyerAnnuel),
      charges_annuelles: Math.round(chargesAnn),
      cashflow_annuel:   Math.round(cashflowAnnuel),
    })

    // Avance d'une année : amortit le crédit mois par mois
    for (let m = 0; m < 12; m++) {
      if (creditRestant > 0 && moisEcoules < dureeRestanteMois && mensualite > 0) {
        const interets = creditRestant * tauxMensuel
        const capRemb  = mensualite - interets
        creditRestant  = Math.max(0, creditRestant - capRemb)
        if (creditRestant === 0) mensualite = 0   // crédit soldé
        moisEcoules++
      } else {
        // crédit fini : mensualité = 0 désormais
        if (mensualite > 0) mensualite = 0
      }
    }

    // Appréciation valeur + inflation loyers/charges
    valeur       *= (1 + appreciationPct    / 100)
    loyerMensuel *= (1 + inflationLoyersPct / 100)
    chargesAnn   *= (1 + inflationLoyersPct / 100)
  }
  return points
}

/**
 * Simule une acquisition future : 0 jusqu'à l'année N, puis simulation
 * complète (apport + crédit + appréciation + loyers).
 *
 *   - L'apport est sorti du patrimoine financier à l'année N (géré par
 *     `projectionGlobale`).
 *   - Le crédit démarre à year N avec capital = prix + frais − apport.
 *   - Mensualité calculée par PMT classique.
 */
export function simulerAcquisitionFuture(
  acq:        AcquisitionFuture,
  annees:     number,
  inflationLoyersPct: number,
): BienAnnee[] {
  const debut          = Math.max(0, acq.dans_combien_annees)
  const prixComplet    = acq.prix_achat * (1 + acq.frais_notaire_pct / 100)
  const capitalEmprunt = Math.max(0, prixComplet - acq.apport)
  const tauxAnnuel     = acq.taux_interet / 100
  const tauxMensuel    = tauxAnnuel / 12
  const dureeMois      = acq.duree_credit_ans * 12

  const mensualite = capitalEmprunt > 0 && tauxMensuel > 0 && dureeMois > 0
    ? capitalEmprunt * (tauxMensuel * Math.pow(1 + tauxMensuel, dureeMois)) / (Math.pow(1 + tauxMensuel, dureeMois) - 1)
    : 0

  // Vacance + charges (loyer effectif réduit par vacance)
  const loyerEffectifMensuel = acq.loyer_brut_mensuel * (1 - acq.taux_vacance_pct / 100)

  const points: BienAnnee[] = []

  // Années 0..debut-1 : pas encore acquis → tout à 0
  for (let y = 0; y < debut; y++) {
    points.push({
      valeur: 0, credit_restant: 0, mensualite: 0, equity: 0,
      loyer_annuel: 0, charges_annuelles: 0, cashflow_annuel: 0,
    })
  }

  // À l'achat (année N)
  let valeur          = prixComplet
  let creditRestant   = capitalEmprunt
  let mensualiteCur   = mensualite
  let moisEcoules     = 0
  let loyerMensuelCur = loyerEffectifMensuel
  let chargesAnnCur   = acq.charges_mensuelles * 12

  for (let y = debut; y <= annees; y++) {
    const equity        = Math.max(0, valeur - creditRestant)
    const loyerAnnuel   = loyerMensuelCur * 12
    const cashflowAnnuel = acq.type === 'locatif'
      ? loyerAnnuel - chargesAnnCur - mensualiteCur * 12
      : -mensualiteCur * 12   // RP : coût pur, pas de loyer
    points.push({
      valeur:            Math.round(valeur),
      credit_restant:    Math.round(creditRestant),
      mensualite:        mensualiteCur,
      equity:            Math.round(equity),
      loyer_annuel:      Math.round(loyerAnnuel),
      charges_annuelles: Math.round(chargesAnnCur),
      cashflow_annuel:   Math.round(cashflowAnnuel),
    })

    // Amortit le crédit
    for (let m = 0; m < 12; m++) {
      if (creditRestant > 0 && moisEcoules < dureeMois && mensualiteCur > 0) {
        const interets = creditRestant * tauxMensuel
        const capRemb  = mensualiteCur - interets
        creditRestant  = Math.max(0, creditRestant - capRemb)
        if (creditRestant === 0) mensualiteCur = 0
        moisEcoules++
      } else {
        if (mensualiteCur > 0) mensualiteCur = 0
      }
    }

    // Appréciation + inflation loyers
    valeur          *= (1 + acq.appreciation_annuelle_pct / 100)
    loyerMensuelCur *= (1 + inflationLoyersPct / 100)
    chargesAnnCur   *= (1 + inflationLoyersPct / 100)
  }
  return points
}

/**
 * Simule l'évolution du patrimoine financier année par année.
 * Inclut le cashflow immo annuel (peut être négatif → réduit l'épargne
 * effective) et l'apport éventuel d'une acquisition future à l'année N.
 */
function simulerFinancier(
  patrimoineInitial: number,
  epargneMensuelle: number,
  rendementAnnuelPct: number,
  cashflowImmoAnnuelParAnnee: number[],   // index = année
  apportsParAnnee: number[],              // index = année (montant sorti à cette année)
  horizon: number,
): number[] {
  const r = rendementAnnuelPct / 100 / 12
  const points: number[] = []
  let capital = patrimoineInitial
  points.push(Math.round(capital))

  for (let y = 1; y <= horizon; y++) {
    // Apport sorti à l'année y (acquisition future)
    capital -= apportsParAnnee[y] ?? 0
    capital = Math.max(0, capital)

    // Cashflow immo annuel injecté (positif = renfort, négatif = effort)
    const cfAnn = cryptoSafe(cashflowImmoAnnuelParAnnee[y]) ?? 0
    // Épargne effective mensuelle = DCA + cashflow immo / 12
    const epargneEffectiveMensuelle = epargneMensuelle + cfAnn / 12

    // 12 mois de composition
    for (let m = 0; m < 12; m++) {
      capital = capital * (1 + r) + epargneEffectiveMensuelle
    }
    points.push(Math.round(capital))
  }
  return points
}

const cryptoSafe = <T>(v: T | undefined): T | null => v === undefined ? null : v

function simulerCash(initial: number, horizon: number): number[] {
  const r = RENDEMENT_CASH / 100
  const points: number[] = []
  let c = initial
  points.push(Math.round(c))
  for (let y = 1; y <= horizon; y++) {
    c = c * (1 + r)
    points.push(Math.round(c))
  }
  return points
}

// ─────────────────────────────────────────────────────────────────
// Projection globale combinée
// ─────────────────────────────────────────────────────────────────

/**
 * Calcule la projection globale du patrimoine sur `horizonAnnees`.
 * Combine portefeuille financier + biens existants + acquisitions futures + cash.
 */
export function projectionGlobale(inputs: ProjectionInputs): ProjectionGlobaleResult {
  const horizon = Math.max(5, Math.min(50, inputs.horizonAnnees ?? 35))
  const warnings: string[] = []

  // 1. Simulation des biens existants
  const trajExistants = inputs.biensExistants.map((b) =>
    simulerBienExistant(b, horizon, inputs.appreciationImmoPct, inputs.inflationLoyersPct),
  )

  // 2. Simulation des acquisitions futures
  const trajFutures = inputs.acquisitionsFutures.map((a) =>
    simulerAcquisitionFuture(a, horizon, inputs.inflationLoyersPct),
  )

  // 3. Cashflow immo annuel total par année (existants + futurs)
  const cashflowImmoParAnnee: number[] = []
  for (let y = 0; y <= horizon; y++) {
    let total = 0
    for (const t of trajExistants) total += t[y]?.cashflow_annuel ?? 0
    for (const t of trajFutures)   total += t[y]?.cashflow_annuel ?? 0
    cashflowImmoParAnnee[y] = total
  }

  // 4. Apports sortis du capital à l'année d'acquisition
  const apportsParAnnee: number[] = []
  for (const acq of inputs.acquisitionsFutures) {
    const y = acq.dans_combien_annees
    apportsParAnnee[y] = (apportsParAnnee[y] ?? 0) + acq.apport
  }

  // 5. Simulation du patrimoine financier
  const trajFinancier = simulerFinancier(
    inputs.patrimoineFinancierActuel,
    inputs.epargneMensuelle,
    inputs.rendementCentral,
    cashflowImmoParAnnee,
    apportsParAnnee,
    horizon,
  )

  // 6. Simulation cash
  const trajCash = simulerCash(inputs.cashActuel, horizon)

  // 7. Warnings : apport > capital financier projeté à l'année N
  for (const acq of inputs.acquisitionsFutures) {
    const y = acq.dans_combien_annees
    const capitalPrevu = trajFinancier[y] ?? 0
    if (acq.apport > capitalPrevu + acq.apport) {  // capital prevu avant apport
      warnings.push(
        `Apport de ${acq.apport.toLocaleString('fr-FR')} € prévu dans ${y} ans pour "${acq.nom}" — votre capital financier projeté sera de ${(capitalPrevu + acq.apport).toLocaleString('fr-FR')} €, vérifiez la faisabilité.`,
      )
    }
  }

  // 8. Construction des points + détection âge indépendance
  const cibleAnnuelle = inputs.revenuPassifCible * 12     // €/an
  let ageInd: number | null = null
  let patrimoineAgeCible    = 0
  let detailsAgeCible       = {
    financier: 0, equityImmoExistant: 0, equityImmoFuture: 0, cash: 0,
    loyersNetsMensuels: 0, mensualitesSortantes: 0, valeurBruteImmo: 0,
  }

  const points: AnneeProjection[] = []
  for (let y = 0; y <= horizon; y++) {
    const fin   = trajFinancier[y] ?? 0
    const cash  = trajCash[y]      ?? 0
    let equityE = 0, equityF = 0, valeurBrute = 0
    let cfTotal = 0, mensuTotal = 0
    for (const t of trajExistants) {
      const pt = t[y]
      if (pt) {
        equityE     += pt.equity
        valeurBrute += pt.valeur
        cfTotal     += pt.cashflow_annuel
        mensuTotal  += pt.mensualite * 12
      }
    }
    for (const t of trajFutures) {
      const pt = t[y]
      if (pt) {
        equityF     += pt.equity
        valeurBrute += pt.valeur
        cfTotal     += pt.cashflow_annuel
        mensuTotal  += pt.mensualite * 12
      }
    }
    const total = fin + equityE + equityF + cash
    const age   = inputs.ageActuel + y

    // Effort mensuel = DCA + mensualités immo (les apports sortent ponctuellement)
    const effortMensuel = inputs.epargneMensuelle + mensuTotal / 12

    points.push({
      age,
      patrimoineFinancier: fin,
      equityImmoExistant:  equityE,
      equityImmoFuture:    equityF,
      cash,
      total,
      loyersNetsAnnuels:   cfTotal,
      effortMensuel,
    })

    // Indépendance : on considère 4 % de retrait sur le patrimoine
    // total + loyers nets directs ≥ cible annuelle.
    const revenuPotentielAnnuel = total * 0.04 + Math.max(0, cfTotal)
    if (ageInd === null && revenuPotentielAnnuel >= cibleAnnuelle) ageInd = age

    // Détail à l'âge cible
    if (age === inputs.ageCible) {
      patrimoineAgeCible = total
      detailsAgeCible = {
        financier:           fin,
        equityImmoExistant:  equityE,
        equityImmoFuture:    equityF,
        cash,
        loyersNetsMensuels:  cfTotal / 12,
        mensualitesSortantes: mensuTotal / 12,
        valeurBruteImmo:     valeurBrute,
      }
    }
  }

  const ecart = ageInd !== null ? ageInd - inputs.ageCible : null

  return {
    points,
    ageIndependanceCentral: ageInd,
    ecartObjectif:          ecart,
    patrimoineAgeCible:     Math.round(patrimoineAgeCible),
    rendementUtilise:       inputs.rendementCentral,
    detailsAgeCible,
    warnings,
  }
}

/**
 * Calcule la différence en années d'âge d'indépendance entre une
 * projection AVEC une acquisition et SANS elle.
 *
 *   positif = l'acquisition AVANCE le FIRE
 *   négatif = l'acquisition RETARDE le FIRE
 */
export function calculerImpactAcquisition(
  base:        ProjectionInputs,
  acquisition: AcquisitionFuture,
): number {
  const sansAcq = projectionGlobale({
    ...base,
    acquisitionsFutures: base.acquisitionsFutures.filter((a) => a.id !== acquisition.id),
  })
  const avecAcq = projectionGlobale({
    ...base,
    acquisitionsFutures: [
      ...base.acquisitionsFutures.filter((a) => a.id !== acquisition.id),
      acquisition,
    ],
  })
  if (sansAcq.ageIndependanceCentral === null || avecAcq.ageIndependanceCentral === null) return 0
  return sansAcq.ageIndependanceCentral - avecAcq.ageIndependanceCentral
}

// ─────────────────────────────────────────────────────────────────
// LEGACY — Conserve simulerProjection() (3 scénarios pessimist/central/
// optimist) pour compatibilité avec l'UI actuelle ProjectionFIRE.tsx.
// Sera remplacé par projectionGlobale() en Phase 9 UI.
// ─────────────────────────────────────────────────────────────────

export interface SimulationParams {
  patrimoineActuel:    number
  epargneMensuelle:    number
  rendementCentral:    number
  ageActuel:           number
  ageCible:            number
  revenuPassifCible:   number
  horizonAnnees?:      number
}

export function simulerProjection(params: SimulationParams): ProjectionResult {
  const horizon = Math.max(5, Math.min(50, params.horizonAnnees ?? 35))
  const cible   = params.revenuPassifCible * 12 * 25

  const points: ProjectionPoint[] = []
  let capP = params.patrimoineActuel
  let capC = params.patrimoineActuel
  let capO = params.patrimoineActuel

  const rP = (params.rendementCentral - 2) / 100 / 12
  const rC = params.rendementCentral / 100 / 12
  const rO = (params.rendementCentral + 2) / 100 / 12
  const m  = Math.max(0, params.epargneMensuelle)

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
