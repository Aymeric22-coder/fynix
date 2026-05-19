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
  ProjectionPoint, ProjectionResult, JalonFIRE,
} from '@/types/analyse'
import {
  PRELEVEMENTS_SOCIAUX_PCT,
  PFU_PCT,
  AV_LONG_TERME_PCT,
  SWR_STANDARD_PCT,
  swrPctFromFireType,
  calculerCiblePatrimoine,
  RENDEMENT_PAR_CLASSE as RENDEMENT_CLASSE_SHARED,
} from './constants'
import { devWarn } from '../utils/devLog'

// ─────────────────────────────────────────────────────────────────
// Constantes Sprint 3 — paramètres FIRE ajustables
// ─────────────────────────────────────────────────────────────────

/** SWR par défaut (règle des 25× / Trinity Study). */
export const SWR_DEFAUT_PCT = SWR_STANDARD_PCT

/** Inflation générale par défaut (cible BCE). */
export const INFLATION_DEFAUT_PCT = 2

// Helper pour aligner Hero / projection / scores sur la meme grille SWR.
export { swrPctFromFireType }

// Alias locaux pour minimiser les changements ailleurs dans le fichier.
const PFU_CTO_PCT                 = PFU_PCT
const PS_PEA_AV_PCT               = PRELEVEMENTS_SOCIAUX_PCT
const FISCALITE_AV_LONG_TERME_PCT = AV_LONG_TERME_PCT

/**
 * Estime un taux de pression fiscale moyen sur les revenus du PORTEFEUILLE
 * (dividendes + retraits) selon la répartition des enveloppes déclarées
 * par l'utilisateur dans le profil.
 *
 * Heuristique simplifiée : on suppose que les enveloppes pèsent à parts
 * égales si plusieurs sont déclarées, et on prend une moyenne pondérée
 * de leur fiscalité respective.
 *   - PEA (après 5 ans)         : 17,2 % (PS seulement)
 *   - Assurance-vie (8 ans)     : ~24,7 % (PFL + PS)
 *   - CTO                       : 30 % (PFU)
 *   - PER                       : 30 % (au retrait — simplification)
 *   - Livret A / LDDS / LEP     : 0 % (exonérés)
 *
 * Si aucune enveloppe n'est déclarée, on retombe sur le PFU (30 %).
 */
export function estimerTauxFiscalitePortefeuille(enveloppes: ReadonlyArray<string> | null | undefined): number {
  if (!enveloppes || enveloppes.length === 0) return PFU_CTO_PCT

  let total = 0
  let count = 0
  for (const env of enveloppes) {
    const e = env.toLowerCase()
    if (e.includes('pea'))                         { total += PS_PEA_AV_PCT;            count++ }
    else if (e.includes('assurance') || e === 'av'){ total += FISCALITE_AV_LONG_TERME_PCT; count++ }
    else if (e.includes('cto'))                    { total += PFU_CTO_PCT;              count++ }
    else if (e.includes('per'))                    { total += PFU_CTO_PCT;              count++ }
    else if (e.includes('livret') || e.includes('ldds') || e.includes('lep')) {
      total += 0; count++
    }
  }
  if (count === 0) return PFU_CTO_PCT
  return Math.round((total / count) * 10) / 10
}

// I10 audit : taux centralisés dans lib/analyse/constants.ts (RENDEMENT_PAR_CLASSE).
// Mapping AnalyseAssetType → classe partagée. crypto/metaux gardés à 0 ici car
// le calcul de rendement portefeuille les exclut explicitement plus bas (proxy
// de long terme actions/ETF, plus stable pour le sliders init).
const RENDEMENT_PAR_CLASSE: Record<AnalyseAssetType, number> = {
  stock:   RENDEMENT_CLASSE_SHARED.actions * 100,
  etf:     RENDEMENT_CLASSE_SHARED.etf * 100,
  bond:    RENDEMENT_CLASSE_SHARED.obligataire * 100,
  scpi:    RENDEMENT_CLASSE_SHARED.scpi * 100,
  metal:   RENDEMENT_CLASSE_SHARED.metaux * 100,
  crypto:  0,
  unknown: 0,
}
const RENDEMENT_IMMO_DIRECT = RENDEMENT_CLASSE_SHARED.immo * 100
const RENDEMENT_CASH        = RENDEMENT_CLASSE_SHARED.cash * 100

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
 * Sprint 1 — B6 : si `cashflowNetFiscalAnnuel` est fourni, il est utilise
 * comme cashflow de l'annee 0 et l'on derive un ratio impot/loyer constant
 * applique a chaque annee suivante (le loyer evolue avec l'inflation,
 * l'impot suit proportionnellement). Sans ce parametre, on retombe sur le
 * cashflow brut (avant impot) — c'est l'ancien comportement, conserve pour
 * compat des appelants directs sans donnees fiscales (devWarn emis).
 *
 * Retourne un snapshot par année (année 0 = état actuel inclus).
 */
export function simulerBienExistant(
  bien:                BienImmo,
  annees:              number,
  appreciationPct:     number,
  inflationLoyersPct:  number,
  cashflowNetFiscalAnnuel?: number,
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

  // Derive un ratio impot/loyer constant a partir du cashflow net fiscal de
  // l'annee 0. Plus stable a long terme qu'un montant absolu : quand les
  // loyers s'inflatent et que le credit se solde, l'impot suit en proportion.
  let ratioImpotSurLoyers = 0
  let hasFiscalData = false
  if (cashflowNetFiscalAnnuel !== undefined && Number.isFinite(cashflowNetFiscalAnnuel)) {
    const loyerY0    = bien.loyer_mensuel * 12
    const chargesY0  = bien.charges_annuelles
    const mensY0     = bien.mensualite_credit * 12
    const cfBrutY0   = loyerY0 - chargesY0 - mensY0
    const impotAnnY0 = Math.max(0, cfBrutY0 - cashflowNetFiscalAnnuel)
    ratioImpotSurLoyers = loyerY0 > 0 ? impotAnnY0 / loyerY0 : 0
    hasFiscalData = true
  } else {
    devWarn(`[projectionFIRE] simulerBienExistant("${bien.nom}") sans cashflowNetFiscalAnnuel — fallback cashflow brut (impot non deduit).`)
  }

  const points: BienAnnee[] = []
  for (let y = 0; y <= annees; y++) {
    // Snapshot année y
    const equity        = Math.max(0, valeur - creditRestant)
    const loyerAnnuel   = loyerMensuel * 12
    const cashflowBrut  = loyerAnnuel - chargesAnn - mensualite * 12
    const impotAnnuel   = hasFiscalData ? loyerAnnuel * ratioImpotSurLoyers : 0
    const cashflowAnnuel = cashflowBrut - impotAnnuel
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
 *
 * Sprint 3 Tâche 4 : l'épargne mensuelle croît annuellement de
 * `epargneCroissanceAnnuellePct` pour modéliser les augmentations de
 * salaire (compound : épargne(n) = épargne_base × (1 + g)^n).
 */
function simulerFinancier(
  patrimoineInitial: number,
  epargneMensuelle: number,
  rendementAnnuelPct: number,
  cashflowImmoAnnuelParAnnee: number[],   // index = année
  apportsParAnnee: number[],              // index = année (montant sorti à cette année)
  horizon: number,
  epargneCroissanceAnnuellePct: number = 0,
): number[] {
  const r = rendementAnnuelPct / 100 / 12
  const g = epargneCroissanceAnnuellePct / 100
  const points: number[] = []
  let capital = patrimoineInitial
  points.push(Math.round(capital))

  for (let y = 1; y <= horizon; y++) {
    // Apport sorti à l'année y (acquisition future)
    capital -= apportsParAnnee[y] ?? 0
    capital = Math.max(0, capital)

    // Cashflow immo annuel injecté (positif = renfort, négatif = effort)
    const cfAnn = cryptoSafe(cashflowImmoAnnuelParAnnee[y]) ?? 0
    // Épargne mensuelle ajustée pour la croissance annuelle (carrière).
    // À y=1 : épargne × (1 + g)^1, à y=2 : épargne × (1 + g)^2, etc.
    const epargneAjustee = epargneMensuelle * Math.pow(1 + g, y)
    const epargneEffectiveMensuelle = epargneAjustee + cfAnn / 12

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

  // 1. Validation des biens existants
  //    - valeur manquante / nulle → bien ignoré + warning
  //    - credit_restant null/undefined → traité comme 0
  //    - equity initiale < 1000 € avec crédit > 0 → warning de cohérence
  const biensValides: BienImmo[] = []
  for (const b of inputs.biensExistants) {
    const valeur        = b.valeur
    const creditRestant = b.credit_restant ?? 0
    if (valeur === null || valeur === undefined || valeur <= 0) {
      warnings.push(`Bien "${b.nom}" ignoré : valeur manquante.`)
      continue
    }
    const equityInit = valeur - creditRestant
    if (equityInit < 1000 && creditRestant > 0) {
      warnings.push(
        `Vérifiez les données de "${b.nom}" — equity initiale anormalement basse (${Math.round(equityInit).toLocaleString('fr-FR')} €) pour un crédit de ${Math.round(creditRestant).toLocaleString('fr-FR')} €.`,
      )
    }
    biensValides.push({ ...b, credit_restant: creditRestant })
  }

  // 2. Simulation des biens existants validés
  //    Sprint 1 — B6 : on propage cashflow_net_fiscal (mensuel) × 12 pour
  //    que la projection deduise l'impot foncier annee par annee au lieu
  //    de simuler un cashflow brut.
  const trajExistants = biensValides.map((b) =>
    simulerBienExistant(
      b, horizon, inputs.appreciationImmoPct, inputs.inflationLoyersPct,
      Number.isFinite(b.cashflow_net_fiscal) ? b.cashflow_net_fiscal * 12 : undefined,
    ),
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

  // 5. Simulation du patrimoine financier (avec croissance d'épargne — Tâche 4)
  const trajFinancier = simulerFinancier(
    inputs.patrimoineFinancierActuel,
    inputs.epargneMensuelle,
    inputs.rendementCentral,
    cashflowImmoParAnnee,
    apportsParAnnee,
    horizon,
    inputs.epargneCroissanceAnnuellePct ?? 0,
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

  // 8. Construction des points + détection âge indépendance + jalons
  // La cible est indexée sur l'inflation : à l'année y, la cible mensuelle
  // doit être revenu_passif_cible × (1 + inflation)^y pour préserver le
  // pouvoir d'achat. Le patrimoine FIRE requis suit le SWR utilisateur
  // (Sprint 3 Tâche 3, défaut 4 % = règle des 25×).
  const inflationPct      = inputs.inflationPct ?? INFLATION_DEFAUT_PCT
  const inflationAnnuelle = inflationPct / 100
  const swrPct            = Math.max(0.5, inputs.swrPct ?? SWR_DEFAUT_PCT)
  const swrFraction       = swrPct / 100
  const cibleAnnuelleBase = inputs.revenuPassifCible * 12  // €/an, base aujourd'hui
  let ageInd: number | null = null
  let ageLeanFire: number | null = null
  let patrimoineAgeCible    = 0
  let detailsAgeCible       = {
    financier: 0, equityImmoExistant: 0, equityImmoFuture: 0, cash: 0,
    loyersNetsMensuels: 0, mensualitesSortantes: 0, valeurBruteImmo: 0,
    creditRestantImmo: 0,
  }

  // Jalons patrimoine (1ère année où on franchit chaque seuil)
  const MILESTONES_PATRIMOINE = [100_000, 500_000, 1_000_000]
  const milestonesAtteints = new Set<number>()
  const jalons: JalonFIRE[] = []

  // Pour les jalons crédit : on détecte la 1ère année où credit_restant = 0
  // pour chaque bien (existant ou futur) ayant initialement un crédit.
  const creditsActifsBiens: Array<{ nom: string; index: number; etait_actif: boolean; soldé: boolean }> = []
  inputs.biensExistants.forEach((b, i) => {
    creditsActifsBiens.push({ nom: b.nom, index: i, etait_actif: (b.credit_restant ?? 0) > 0, soldé: false })
  })
  // Acquisitions futures : on traque aussi
  const creditsAcquisitions: Array<{ nom: string; index: number; debut: number; soldé: boolean }> = []
  inputs.acquisitionsFutures.forEach((a, i) => {
    creditsAcquisitions.push({ nom: a.nom, index: i, debut: a.dans_combien_annees, soldé: false })
  })

  const points: AnneeProjection[] = []
  for (let y = 0; y <= horizon; y++) {
    const fin   = trajFinancier[y] ?? 0
    const cash  = trajCash[y]      ?? 0
    let equityE = 0, equityF = 0, valeurBrute = 0, creditRestant = 0
    let cfTotal = 0, mensuTotal = 0
    for (const t of trajExistants) {
      const pt = t[y]
      if (pt) {
        equityE       += pt.equity
        valeurBrute   += pt.valeur
        creditRestant += pt.credit_restant
        cfTotal       += pt.cashflow_annuel
        mensuTotal    += pt.mensualite * 12
      }
    }
    for (const t of trajFutures) {
      const pt = t[y]
      if (pt) {
        equityF       += pt.equity
        valeurBrute   += pt.valeur
        creditRestant += pt.credit_restant
        cfTotal       += pt.cashflow_annuel
        mensuTotal    += pt.mensualite * 12
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

    // Indépendance : on considère le SWR utilisateur sur le patrimoine
    // total + loyers nets directs ≥ cible annuelle indexée à l'année y.
    const cibleAnnuelle    = cibleAnnuelleBase * Math.pow(1 + inflationAnnuelle, y)
    const revenuPotentiel  = total * swrFraction + Math.max(0, cfTotal)
    if (ageInd === null && revenuPotentiel >= cibleAnnuelle) {
      ageInd = age
      jalons.push({ age, label: '🎯 FIRE', type: 'fire', valeur: total })
    }
    // Lean FIRE : 70 % de la cible (mode de vie réduit)
    if (ageLeanFire === null && revenuPotentiel >= cibleAnnuelle * 0.7) {
      ageLeanFire = age
      // N'ajoute pas si FIRE déjà atteint à la même année (évite doublon)
      if (ageInd === null || ageLeanFire < ageInd) {
        jalons.push({ age, label: '🌱 Lean FIRE', type: 'lean_fire', valeur: total })
      }
    }

    // Jalons patrimoine
    for (const seuil of MILESTONES_PATRIMOINE) {
      if (!milestonesAtteints.has(seuil) && total >= seuil) {
        milestonesAtteints.add(seuil)
        const label = seuil >= 1_000_000 ? '💰 1 M€'
                    : seuil >= 500_000   ? '💰 500 k€'
                    : '💰 100 k€'
        jalons.push({ age, label, type: 'milestone', valeur: seuil })
      }
    }

    // Jalons crédit immo soldé (biens existants)
    for (const c of creditsActifsBiens) {
      if (c.soldé || !c.etait_actif) continue
      const pt = trajExistants[c.index]?.[y]
      if (pt && pt.credit_restant === 0 && y > 0) {
        c.soldé = true
        jalons.push({ age, label: `🏠 ${c.nom} soldé`, type: 'debt', valeur: 0 })
      }
    }
    // Jalons crédit acquisitions futures
    for (const c of creditsAcquisitions) {
      if (c.soldé || y <= c.debut) continue
      const pt = trajFutures[c.index]?.[y]
      if (pt && pt.credit_restant === 0 && pt.valeur > 0) {
        c.soldé = true
        jalons.push({ age, label: `🏠 ${c.nom} soldé`, type: 'debt', valeur: 0 })
      }
    }

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
        creditRestantImmo:   creditRestant,
      }
    }
  }

  const ecart = ageInd !== null ? ageInd - inputs.ageCible : null

  // ─── Cible inflation-adjusted à l'âge cible (Tâche 1) ─────────────
  // I9 audit : formule centralisée dans lib/analyse/constants.ts pour
  // éviter la divergence avec aggregateur/scores. Conserve la variable
  // intermédiaire pour le calcul d'effort/cibleRevenu plus bas.
  const anneesJusquAgeCible        = Math.max(0, inputs.ageCible - inputs.ageActuel)
  const cibleRevenuMensuelFuturs   = inputs.revenuPassifCible * Math.pow(1 + inflationAnnuelle, anneesJusquAgeCible)
  const ciblePatrimoineAjustee     = calculerCiblePatrimoine(
    inputs.revenuPassifCible, anneesJusquAgeCible, inflationPct, swrPct,
  )

  // ─── Revenu passif net projeté à l'âge cible (Tâche 2) ────────────
  // Loyers nets : on applique l'impôt foncier réel via calculerImpotFoncier
  // sur chaque bien (existants seulement — les acquisitions futures n'ont
  // pas de fiscal_regime persisté). Approximation conservatrice.
  // Portefeuille : on suppose un retrait au SWR sur le patrimoine financier,
  // imposé au taux estimé depuis les enveloppes (PFU/PEA/AV).
  const tauxFiscalPortefeuille = inputs.tauxFiscalitePortefeuillePct ?? null

  const loyersBrutsAnnuelsCible  = Math.max(0, detailsAgeCible.loyersNetsMensuels * 12)
  let impotLoyersAnnuelEstime    = 0
  if (loyersBrutsAnnuelsCible > 0 && inputs.biensExistants.length > 0) {
    // On estime le taux fiscal moyen sur les biens existants en prenant la
    // moyenne pondérée par loyer initial des taux_effort_fiscal calculés.
    let totalLoyerInitial = 0
    let totalImpotInitial = 0
    for (const b of inputs.biensExistants) {
      const loyer = b.loyer_mensuel * 12
      if (loyer <= 0) continue
      totalLoyerInitial += loyer
      totalImpotInitial += b.impot_mensuel_estime * 12
    }
    const tauxEffectifMoyen = totalLoyerInitial > 0
      ? totalImpotInitial / totalLoyerInitial
      : 0
    impotLoyersAnnuelEstime = loyersBrutsAnnuelsCible * tauxEffectifMoyen
  }

  const revenuPortefeuilleBrutMensuel = (detailsAgeCible.financier * swrFraction) / 12
  const tauxFiscalPortefeuilleFinal   = tauxFiscalPortefeuille !== null
    ? tauxFiscalPortefeuille
    : estimerTauxFiscalitePortefeuille(null)  // fallback PFU
  const impotPortefeuilleMensuel      = revenuPortefeuilleBrutMensuel * (tauxFiscalPortefeuilleFinal / 100)

  const revenuPassifBrutMensuel = Math.max(0, detailsAgeCible.loyersNetsMensuels)
                                + revenuPortefeuilleBrutMensuel
  const revenuPassifNetMensuel  = Math.max(0, detailsAgeCible.loyersNetsMensuels - impotLoyersAnnuelEstime / 12)
                                + (revenuPortefeuilleBrutMensuel - impotPortefeuilleMensuel)
  const tauxPressionFiscale     = revenuPassifBrutMensuel > 0
    ? Math.round((1 - revenuPassifNetMensuel / revenuPassifBrutMensuel) * 1000) / 10
    : 0

  // Tri des jalons par âge
  jalons.sort((a, b) => a.age - b.age)

  return {
    points,
    ageIndependanceCentral: ageInd,
    ecartObjectif:          ecart,
    patrimoineAgeCible:     Math.round(patrimoineAgeCible),
    rendementUtilise:       inputs.rendementCentral,
    detailsAgeCible,
    cibleRevenuMensuelEnEurosFuturs: Math.round(cibleRevenuMensuelFuturs),
    ciblePatrimoineAjusteeInflation: Math.round(ciblePatrimoineAjustee),
    swrUtilise:                      swrPct,
    inflationUtilisee:               inflationPct,
    revenuPassifBrutProjete:         Math.round(revenuPassifBrutMensuel),
    revenuPassifNetProjete:          Math.round(revenuPassifNetMensuel),
    tauxPressionFiscaleEstime:       tauxPressionFiscale,
    jalons,
    warnings,
  }
}


/** Écart de rendement appliqué aux scénarios pessimiste / optimiste vs central. */
export const FIRE_SCENARIO_DELTA_PCT = 1.5

/**
 * Calcule l'âge d'indépendance financière selon 3 scénarios de rendement :
 *   - pessimiste : rendementCentral − 1,5 %
 *   - médian    : rendementCentral (cas de base)
 *   - optimiste : rendementCentral + 1,5 %
 *
 * Retourne aussi le patrimoine projeté à l'âge cible dans le scénario médian.
 * Utile pour afficher un intervalle de confiance ("entre X et Y ans") plutôt
 * qu'un chiffre fixe trompeur.
 */
export function projectionFIREIntervalle(base: ProjectionInputs): {
  age_fire_pessimiste: number | null
  age_fire_median:     number | null
  age_fire_optimiste:  number | null
  patrimoine_age_cible_median: number
  rendement_central_pct: number
} {
  const central = base.rendementCentral
  const pessimist = projectionGlobale({ ...base, rendementCentral: Math.max(0, central - FIRE_SCENARIO_DELTA_PCT) })
  const median    = projectionGlobale({ ...base, rendementCentral: central })
  const optimist  = projectionGlobale({ ...base, rendementCentral: central + FIRE_SCENARIO_DELTA_PCT })
  return {
    age_fire_pessimiste: pessimist.ageIndependanceCentral,
    age_fire_median:     median.ageIndependanceCentral,
    age_fire_optimiste:  optimist.ageIndependanceCentral,
    patrimoine_age_cible_median: median.patrimoineAgeCible,
    rendement_central_pct: central,
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
