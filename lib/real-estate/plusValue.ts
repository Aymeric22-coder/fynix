/**
 * Calcul de la plus-value immobilière française et impact sur la
 * trajectoire d'indépendance financière.
 *
 * Fonction PURE — pas d'I/O, pas de hook React. Réutilise uniquement
 * les constantes communes (PRELEVEMENTS_SOCIAUX_PCT) et la projection
 * d'onboarding pour estimer l'impact FIRE du réinvestissement.
 *
 * Règles fiscales implémentées (France, 2026) :
 *
 *   1. PV brute = Prix vente − Prix acquisition corrigé
 *      Prix acquisition corrigé = Prix achat
 *        + frais d'acquisition (réels OU forfait 7,5 %)
 *        + travaux (réels OU forfait 15 % si détention > 5 ans
 *          ET travaux réels < 15 % du prix d'achat)
 *
 *   2. Abattements pour durée de détention (années révolues) :
 *      IR (taux 19 %)  : 0 %    avant 6 ans,
 *                        +6 %/an du 6e au 21e an,
 *                        +4 % au 22e an → exonération totale au-delà.
 *      PS (taux 17,2 %): 0 %    avant 6 ans,
 *                        +1,65 %/an du 6e au 21e an,
 *                        +1,60 % au 22e an,
 *                        +9 %/an du 23e au 30e an → exo totale au-delà.
 *
 *   3. Surtaxe sur PV nette IR > 50 000 € (paliers 2 / 3 / 4 / 5 / 6 %).
 *
 *   4. Exonérations totales :
 *      - Résidence principale (toujours)
 *      - 1re cession d'une résidence autre que principale par un non
 *        propriétaire de sa RP depuis 4 ans (sous conditions)
 *      - PV nette ≤ 15 000 €
 *
 *   5. Net vendeur = Prix vente − Frais agence − Impôt total.
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from '../analyse/constants'
import {
  calculerQuickProjection,
  type QuickProjectionResult,
} from '../onboarding/quickProjection'

// ─────────────────────────────────────────────────────────────────
// Constantes fiscales spécifiques à la PV immo
// ─────────────────────────────────────────────────────────────────

/** Taux IR fixe applicable à la PV immobilière (19 %). */
export const TAUX_IR_PV_IMMO = 19
/** Forme décimale du taux IR (0.19) — utile pour les multiplications. */
export const TAUX_IR_PV_IMMO_PCT = TAUX_IR_PV_IMMO / 100

/** Taux PS (17,2 %) sous forme décimale. */
const TAUX_PS_PCT = PRELEVEMENTS_SOCIAUX_PCT / 100

/** Forfait frais d'acquisition (7,5 % du prix d'achat). */
export const FRAIS_ACQ_FORFAIT_PCT  = 7.5
/** Forfait travaux (15 % du prix d'achat) si détention > 5 ans. */
export const TRAVAUX_FORFAIT_PCT    = 15
/** Détention minimale (années révolues) pour le forfait travaux. */
export const TRAVAUX_FORFAIT_MIN_ANS = 5

/** Seuil d'exonération applicable à la PV nette (≤ 15 000 €). */
export const SEUIL_EXO_PV_FAIBLE_EUR = 15_000

/** Surtaxe progressive sur PV nette IR > 50 000 €. */
const SURTAXE_PALIERS: ReadonlyArray<{ min: number; max: number; tauxPct: number }> = [
  { min:  50_001, max: 100_000, tauxPct: 2 },
  { min: 100_001, max: 150_000, tauxPct: 3 },
  { min: 150_001, max: 200_000, tauxPct: 4 },
  { min: 200_001, max: 250_000, tauxPct: 5 },
  { min: 250_001, max: Number.POSITIVE_INFINITY, tauxPct: 6 },
]

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export type TypeUsageBien = 'residence_principale' | 'locatif' | 'secondaire'

export interface SimulationReventeInput {
  /** Prix d'achat hors honoraires (€). */
  prixAchat:               number
  /** Date d'achat (sert au calcul de la durée de détention). */
  dateAchat:               Date
  /** Prix de vente envisagé (€). */
  prixVenteEstime:         number
  /** Date de cession envisagée (€). */
  dateCessionEstimee:      Date

  /** Frais d'acquisition réels (€). Si omis → forfait 7,5 % du prix d'achat. */
  fraisAcquisitionReels?:  number
  /** Travaux réels engagés (€). Si omis ET détention > 5 ans, forfait 15 %. */
  travauxReels?:           number
  /** Frais d'agence (€) à déduire du prix de vente pour le net vendeur. */
  fraisAgenceVente?:       number

  /** Type d'usage du bien — détermine les exonérations. */
  typeUsage:               TypeUsageBien
  /** 1re cession d'une résidence autre que principale, vendeur sans RP
   *  depuis 4 ans → exonération (article 150-U II-1° bis du CGI). */
  estPremiereCessionHorsRP?: boolean

  // ── Impact projection (optionnels) ────────────────────────────────
  /** Patrimoine financier actuel (€) — pour l'impact FIRE. */
  patrimoineActuel?:       number
  /** Épargne mensuelle (€/mois). */
  epargneMensuelle?:       number
  /** Revenu mensuel net (€/mois) — utilisé pour estimer la cible FIRE
   *  via calculerQuickProjection. */
  revenuMensuelNet?:       number
  /** Âge actuel — requis pour l'impact FIRE. */
  ageActuel?:              number
}

export interface SimulationReventeImpactFIRE {
  /** Capital net réinvesti après vente (= netVendeur). */
  gainPatrimoineNet:        number
  /** Différence en années sur l'âge d'indépendance financière.
   *  Positive = on avance la date, null si calcul impossible. */
  gainAnneesFIRE:           number | null
  /** Nouvel âge d'indépendance estimé après réinvestissement. */
  nouvelAgeIndependance:    number | null
  /** Âge d'indépendance sans la vente (référence). */
  ageIndependanceSansVente: number | null
}

export interface SimulationReventeResult {
  // Durée
  /** Années révolues entre dateAchat et dateCessionEstimee. */
  anneesDetention:          number

  // PV brute
  fraisAcquisitionRetenus:  number
  travauxRetenus:           number
  prixAcquisitionCorriges:  number
  pvBrute:                  number

  // Abattements
  abattementIRPct:          number
  abattementPSPct:          number
  pvNettePourIR:            number
  pvNettePourPS:            number

  // Impôts
  impotIR:                  number
  impotPS:                  number
  surtaxe:                  number
  impotTotal:               number

  // Net
  netVendeur:               number
  tauxImpositionEffectifPct: number

  // Exonération
  exonere:                  boolean
  raisonExoneration?:       string

  // Impact projection (optionnel)
  impactFIRE?:              SimulationReventeImpactFIRE
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Années révolues entre deux dates (jour près). 1er → 2e date :
 *  diff calendaire en années, moins 1 si la date d'anniversaire n'est
 *  pas encore atteinte. Ne peut pas être négatif. */
export function anneesRevolues(dateDebut: Date, dateFin: Date): number {
  let years = dateFin.getUTCFullYear() - dateDebut.getUTCFullYear()
  const m = dateFin.getUTCMonth() - dateDebut.getUTCMonth()
  if (m < 0 || (m === 0 && dateFin.getUTCDate() < dateDebut.getUTCDate())) {
    years -= 1
  }
  return Math.max(0, years)
}

/** Taux d'abattement IR sur la PV (%) en fonction des années révolues. */
export function abattementIRPct(annees: number): number {
  if (annees < 6)  return 0
  if (annees >= 22) return 100
  // 6e au 21e an : 6 %/an cumulé (palier annuel)
  // 22e an : +4 %
  const pal6a21 = Math.min(annees - 5, 16) * 6  // 6, 12, … 96 % à 21 ans
  if (annees <= 21) return pal6a21
  // annees === 21+ géré au-dessus; cas annees === 22 (entre exo et palier 21)
  return pal6a21 + 4  // 96 + 4 = 100 → exo
}

/** Taux d'abattement PS sur la PV (%) en fonction des années révolues. */
export function abattementPSPct(annees: number): number {
  if (annees < 6)   return 0
  if (annees >= 30) return 100
  // 6e au 21e an : 1,65 %/an
  const pal6a21 = Math.min(annees - 5, 16) * 1.65
  if (annees <= 21) return pal6a21
  // 22e an : +1,60
  if (annees === 22) return pal6a21 + 1.60
  // 23e au 30e an : 9 %/an (cumul à partir du 23e)
  const palAfter22 = (annees - 22) * 9
  // pal6a21 ici = 16 × 1,65 = 26,4 ; +1,60 = 28 ; + 9/an = 100 à 30 ans
  return pal6a21 + 1.60 + palAfter22
}

/** Calcule la surtaxe sur la PV nette IR (€). Renvoie 0 si ≤ 50 000 €. */
export function calculerSurtaxe(pvNetteIR: number): number {
  if (pvNetteIR <= 50_000) return 0
  const palier = SURTAXE_PALIERS.find((p) => pvNetteIR >= p.min && pvNetteIR <= p.max)
  if (!palier) return 0
  return Math.round(pvNetteIR * (palier.tauxPct / 100))
}

// ─────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────

export function calculerPlusValue(input: SimulationReventeInput): SimulationReventeResult {
  const {
    prixAchat, dateAchat, prixVenteEstime, dateCessionEstimee,
    fraisAcquisitionReels, travauxReels, fraisAgenceVente = 0,
    typeUsage, estPremiereCessionHorsRP,
  } = input

  const anneesDetention = anneesRevolues(dateAchat, dateCessionEstimee)

  // ── Résidence principale → exonération totale ───────────────────────
  if (typeUsage === 'residence_principale') {
    return buildExonereResult({
      input, anneesDetention,
      raisonExoneration: 'Résidence principale — exonération totale (art. 150 U II-1° du CGI).',
    })
  }

  // ── Calcul du prix d'acquisition corrigé ────────────────────────────
  const fraisAcquisitionRetenus = fraisAcquisitionReels !== undefined && fraisAcquisitionReels > 0
    ? fraisAcquisitionReels
    : Math.round(prixAchat * (FRAIS_ACQ_FORFAIT_PCT / 100))

  // Forfait travaux : applicable si détention > 5 ans ET travaux réels <
  // 15 % du prix d'achat (ou pas de travaux réels saisis).
  const travauxForfait = Math.round(prixAchat * (TRAVAUX_FORFAIT_PCT / 100))
  const seuilTravauxReels = travauxForfait
  let travauxRetenus = 0
  if (travauxReels !== undefined && travauxReels >= seuilTravauxReels) {
    travauxRetenus = travauxReels
  } else if (anneesDetention > TRAVAUX_FORFAIT_MIN_ANS) {
    // Détention > 5 ans → forfait 15 % automatique (même si pas de travaux saisis)
    travauxRetenus = travauxForfait
  } else if (travauxReels !== undefined && travauxReels > 0) {
    // Détention < 5 ans : on prend les réels (forfait pas autorisé)
    travauxRetenus = travauxReels
  }

  const prixAcquisitionCorriges = prixAchat + fraisAcquisitionRetenus + travauxRetenus
  const pvBrute = Math.max(0, prixVenteEstime - prixAcquisitionCorriges)

  // ── Pas de plus-value → exonération automatique ─────────────────────
  if (pvBrute <= 0) {
    return buildExonereResult({
      input, anneesDetention,
      raisonExoneration: 'Pas de plus-value (prix de vente ≤ prix d\'acquisition corrigé).',
      fraisAcquisitionRetenus, travauxRetenus, prixAcquisitionCorriges,
    })
  }

  // ── Abattements ─────────────────────────────────────────────────────
  const aIRPct = abattementIRPct(anneesDetention)
  const aPSPct = abattementPSPct(anneesDetention)
  const pvNettePourIR = Math.max(0, pvBrute * (1 - aIRPct / 100))
  const pvNettePourPS = Math.max(0, pvBrute * (1 - aPSPct / 100))

  // ── Exonérations totales pour PV nette faible ───────────────────────
  // S'applique sur la PV brute (régime simplifié 150 U II-6° du CGI).
  if (pvBrute <= SEUIL_EXO_PV_FAIBLE_EUR) {
    return buildExonereResult({
      input, anneesDetention,
      raisonExoneration: `Plus-value brute ≤ ${SEUIL_EXO_PV_FAIBLE_EUR.toLocaleString('fr-FR')} € — exonérée.`,
      fraisAcquisitionRetenus, travauxRetenus, prixAcquisitionCorriges,
      pvBrute, abattementIRPct: aIRPct, abattementPSPct: aPSPct,
      pvNettePourIR, pvNettePourPS,
    })
  }

  // ── 1re cession hors RP avec vendeur non propriétaire RP depuis 4 ans
  if (estPremiereCessionHorsRP) {
    return buildExonereResult({
      input, anneesDetention,
      raisonExoneration: '1re cession d\'un bien autre que la RP, vendeur sans RP depuis 4 ans — exonérée (art. 150 U II-1° bis).',
      fraisAcquisitionRetenus, travauxRetenus, prixAcquisitionCorriges,
      pvBrute, abattementIRPct: aIRPct, abattementPSPct: aPSPct,
      pvNettePourIR, pvNettePourPS,
    })
  }

  // ── Impôts ──────────────────────────────────────────────────────────
  const impotIR  = Math.round(pvNettePourIR * TAUX_IR_PV_IMMO_PCT)
  const impotPS  = Math.round(pvNettePourPS * TAUX_PS_PCT)
  const surtaxe  = calculerSurtaxe(pvNettePourIR)
  const impotTotal = impotIR + impotPS + surtaxe

  // ── Net vendeur ─────────────────────────────────────────────────────
  const netVendeur = prixVenteEstime - fraisAgenceVente - impotTotal
  const tauxImpositionEffectifPct = pvBrute > 0
    ? Math.round((impotTotal / pvBrute) * 1000) / 10
    : 0

  const result: SimulationReventeResult = {
    anneesDetention,
    fraisAcquisitionRetenus,
    travauxRetenus,
    prixAcquisitionCorriges,
    pvBrute,
    abattementIRPct: aIRPct,
    abattementPSPct: aPSPct,
    pvNettePourIR,
    pvNettePourPS,
    impotIR,
    impotPS,
    surtaxe,
    impotTotal,
    netVendeur,
    tauxImpositionEffectifPct,
    exonere: false,
  }

  // ── Impact FIRE (optionnel) ─────────────────────────────────────────
  const impactFIRE = computeImpactFIRE(input, netVendeur)
  if (impactFIRE) result.impactFIRE = impactFIRE

  return result
}

// ─────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────

interface ExoBuildOpts {
  input:                    SimulationReventeInput
  anneesDetention:          number
  raisonExoneration:        string
  fraisAcquisitionRetenus?: number
  travauxRetenus?:          number
  prixAcquisitionCorriges?: number
  pvBrute?:                 number
  abattementIRPct?:         number
  abattementPSPct?:         number
  pvNettePourIR?:           number
  pvNettePourPS?:           number
}

function buildExonereResult(opts: ExoBuildOpts): SimulationReventeResult {
  const { input } = opts
  const fraisAgence = input.fraisAgenceVente ?? 0
  const netVendeur = input.prixVenteEstime - fraisAgence

  const result: SimulationReventeResult = {
    anneesDetention:          opts.anneesDetention,
    fraisAcquisitionRetenus:  opts.fraisAcquisitionRetenus ?? 0,
    travauxRetenus:           opts.travauxRetenus ?? 0,
    prixAcquisitionCorriges:  opts.prixAcquisitionCorriges ?? input.prixAchat,
    pvBrute:                  opts.pvBrute ?? 0,
    abattementIRPct:          opts.abattementIRPct ?? 0,
    abattementPSPct:          opts.abattementPSPct ?? 0,
    pvNettePourIR:            opts.pvNettePourIR ?? 0,
    pvNettePourPS:            opts.pvNettePourPS ?? 0,
    impotIR:                  0,
    impotPS:                  0,
    surtaxe:                  0,
    impotTotal:               0,
    netVendeur,
    tauxImpositionEffectifPct: 0,
    exonere:                  true,
    raisonExoneration:        opts.raisonExoneration,
  }

  const impactFIRE = computeImpactFIRE(input, netVendeur)
  if (impactFIRE) result.impactFIRE = impactFIRE
  return result
}

function computeImpactFIRE(
  input: SimulationReventeInput,
  netVendeur: number,
): SimulationReventeImpactFIRE | undefined {
  // Tous les inputs FIRE requis : sinon on n'estime pas l'impact.
  if (
    input.patrimoineActuel === undefined
    || input.epargneMensuelle === undefined
    || input.revenuMensuelNet === undefined
    || input.ageActuel === undefined
  ) return undefined

  const baseline: QuickProjectionResult = calculerQuickProjection({
    age:              input.ageActuel,
    patrimoineActuel: input.patrimoineActuel,
    revenuMensuelNet: input.revenuMensuelNet,
  })

  const avecVente: QuickProjectionResult = calculerQuickProjection({
    age:              input.ageActuel,
    patrimoineActuel: input.patrimoineActuel + Math.max(0, netVendeur),
    revenuMensuelNet: input.revenuMensuelNet,
  })

  let gainAnnees: number | null = null
  if (baseline.ageIndependance !== null && avecVente.ageIndependance !== null) {
    gainAnnees = baseline.ageIndependance - avecVente.ageIndependance
  }

  return {
    gainPatrimoineNet:        Math.max(0, netVendeur),
    gainAnneesFIRE:           gainAnnees,
    nouvelAgeIndependance:    avecVente.ageIndependance,
    ageIndependanceSansVente: baseline.ageIndependance,
  }
}
