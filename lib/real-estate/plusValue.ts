/**
 * Calcul de la plus-value immobilière française et impact sur la
 * trajectoire d'indépendance financière — gestion multi-régimes.
 *
 * Régimes supportés :
 *   - particulier / foncier_nu / scpi  → PV des particuliers (art. 150 U du CGI)
 *     Frais 7,5 % + travaux 15 %, abattements IR (19 %) et PS (17,2 %),
 *     surtaxe sur PV nette IR > 50 000 €, exonérations RP / PV ≤ 15 k€ /
 *     1re cession hors RP.
 *
 *   - lmnp / micro_bic  → LMNP loi de finances 2025
 *     Amortissements pratiqués RÉINTÉGRÉS à la PV imposable
 *     (VNC = base d'acquisition corrigée − amortissements cumulés).
 *     Taxation reste au régime des particuliers (mêmes abattements + surtaxe).
 *
 *   - lmp  → professionnel (art. 151 septies CGI)
 *     PV pro = vente − VNC. Décomposée en CT (à hauteur des amortissements,
 *     taxée TMI + 17,2 % cotisations sociales) et LT (12,8 % PFU).
 *     Exonération totale si CA moyen 2 ans < 90 k€, dégressive jusqu'à 126 k€.
 *
 *   - sci_is  → IS au niveau société (15/25 %) puis sortie PFU 30 %
 *     ou remboursement de comptes courants d'associés (CCA) sans imposition.
 *     Pas d'abattement pour durée de détention.
 *
 * Fonction PURE — pas d'I/O, pas de hook React. Réutilise uniquement
 * `PRELEVEMENTS_SOCIAUX_PCT` (lib/analyse/constants) et
 * `calculerQuickProjection` (lib/onboarding) pour estimer l'impact FIRE.
 */

import { PRELEVEMENTS_SOCIAUX_PCT } from '../analyse/constants'
import {
  calculerQuickProjection,
  type QuickProjectionResult,
} from '../onboarding/quickProjection'
import { calculerCRD, calculerIRA, type IraMethode } from './credit'

// ─────────────────────────────────────────────────────────────────
// Constantes fiscales
// ─────────────────────────────────────────────────────────────────

/** Taux IR fixe applicable à la PV immobilière (19 %). */
export const TAUX_IR_PV_IMMO = 19
/** Forme décimale du taux IR (0.19). */
export const TAUX_IR_PV_IMMO_PCT = TAUX_IR_PV_IMMO / 100

/** Taux IS normal (25 %) sous forme décimale. */
export const TAUX_IS_NORMAL_PCT = 0.25
/** Taux IS réduit PME (15 %, bénéfice < 42 500 €). */
export const TAUX_IS_REDUIT_PCT = 0.15

/** PFU global (12,8 % IR + 17,2 % PS = 30 %). */
export const TAUX_PFU_PCT = 0.30
/** Part IR du PFU (12,8 %) — utilisée pour la PV LT en LMP. */
export const TAUX_PFU_IR_PCT = 0.128

/** Taux PS (17,2 %) sous forme décimale. */
const TAUX_PS_PCT = PRELEVEMENTS_SOCIAUX_PCT / 100

/** Forfait frais d'acquisition (7,5 % du prix d'achat). */
export const FORFAIT_FRAIS_ACQUISITION_PCT = 0.075
/** Forfait travaux (15 % du prix d'achat) si détention > 5 ans. */
export const FORFAIT_TRAVAUX_PCT = 0.15
/** Détention minimale (années révolues) pour le forfait travaux. */
export const TRAVAUX_FORFAIT_MIN_ANS = 5

/** Seuil d'exonération applicable à la PV brute (≤ 15 000 €). */
export const SEUIL_EXO_PV_EUR = 15_000
/** Plafond exonération LMP totale (CA moyen sur 2 ans). */
export const PLAFOND_EXO_LMP_TOTAL = 90_000
/** Plafond exonération LMP dégressive (CA moyen sur 2 ans). */
export const PLAFOND_EXO_LMP_PARTIELLE = 126_000

/** Amortissement annuel par défaut quand l'utilisateur ne renseigne rien
 *  (2,5 %/an du prix d'achat × quote-part amortissable). */
export const AMORTISSEMENT_ANNUEL_ESTIME_PCT = 0.025
/** Quote-part amortissable typique (85 % de la valeur = bâti hors terrain). */
export const QUOTE_PART_AMORTISSABLE_PCT = 0.85

// Aliases rétro-compatibles (anciens noms exportés par cette lib).
/** @deprecated Utilisez SEUIL_EXO_PV_EUR. */
export const SEUIL_EXO_PV_FAIBLE_EUR = SEUIL_EXO_PV_EUR
/** @deprecated Utilisez FORFAIT_FRAIS_ACQUISITION_PCT × 100. */
export const FRAIS_ACQ_FORFAIT_PCT = FORFAIT_FRAIS_ACQUISITION_PCT * 100
/** @deprecated Utilisez FORFAIT_TRAVAUX_PCT × 100. */
export const TRAVAUX_FORFAIT_PCT = FORFAIT_TRAVAUX_PCT * 100

// ─────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────

export type TypeUsageBien = 'residence_principale' | 'locatif' | 'secondaire'

export type RegimeFiscalRevente =
  | 'particulier'
  | 'lmnp'
  | 'lmp'
  | 'sci_is'
  | 'foncier_nu'
  | 'scpi'
  | 'micro_bic'

export const REGIME_LABELS: Record<RegimeFiscalRevente, string> = {
  particulier: 'Particulier / Foncier nu / SCI à l\'IR',
  lmnp:        'LMNP réel (loi finances 2025)',
  lmp:         'LMP (loueur meublé professionnel)',
  sci_is:      'SCI à l\'IS',
  foncier_nu:  'Foncier nu',
  scpi:        'SCPI',
  micro_bic:   'Micro-BIC (assimilé particulier)',
}

export interface SimulationReventeInput {
  /** Prix d'achat hors honoraires (€). */
  prixAchat:               number
  /** Date d'achat. */
  dateAchat:               Date
  /** Prix de vente envisagé (€). */
  prixVenteEstime:         number
  /** Date de cession envisagée. */
  dateCessionEstimee:      Date

  /** Régime fiscal d'exploitation du bien.
   *  Défaut 'particulier' pour rétro-compat des appels existants. */
  regimeFiscal?:           RegimeFiscalRevente

  /** Amortissements cumulés (€) — utilisés pour LMNP / LMP / SCI IS.
   *  Si omis et régime amortissable : estimation 2,5 %/an × 85 %. */
  amortissementsCumules?:  number
  /** Comptes courants d'associés (SCI IS uniquement) — remboursables hors PFU. */
  comptesCourantsAssocies?: number
  /** Taux IS (% entier). Défaut 25. PME : 15. */
  tauxIS?:                 number
  /** CA moyen sur 2 ans (LMP) — sert au calcul d'exonération art. 151 septies. */
  caLmpMoyenSur2Ans?:      number
  /** TMI en % (LMP uniquement). Défaut 30. */
  tmiLmp?:                 number

  /** Frais d'acquisition réels (€). Si omis → forfait 7,5 %. */
  fraisAcquisitionReels?:  number
  /** Travaux réels (€). Si omis ET détention > 5 ans → forfait 15 %. */
  travauxReels?:           number
  /** Frais d'agence (€) à déduire du prix de vente. */
  fraisAgenceVente?:       number

  /** Type d'usage — détermine les exonérations RP. */
  typeUsage:               TypeUsageBien
  /** 1re cession hors RP, vendeur sans RP depuis 4 ans. */
  estPremiereCessionHorsRP?: boolean

  // ── Crédit immobilier (CRD + IRA déduits du net vendeur) ──────────
  /** Capital emprunté à l'origine (€). */
  creditCapitalInitial?:   number
  /** Taux annuel nominal du prêt (% — ex. 2.5 pour 2,5 %). */
  creditTauxAnnuelPct?:    number
  /** Durée totale du crédit en mois. */
  creditDureeMois?:        number
  /** Date du premier prélèvement / mise en place du prêt. */
  creditDateDebut?:        Date
  /** Alternative : CRD déjà calculé à aujourd'hui (priorité aux 4 champs
   *  bruts si fournis, sinon ce CRD pré-calculé est utilisé tel quel). */
  creditCapitalRestantDu?: number
  /** Cas d'exonération légale ou contractuelle des IRA. */
  iraExonere?:             boolean

  /** Patrimoine financier actuel (€) — impact FIRE. */
  patrimoineActuel?:       number
  /** Épargne mensuelle (€/mois). */
  epargneMensuelle?:       number
  /** Revenu mensuel net (€/mois). */
  revenuMensuelNet?:       number
  /** Âge actuel. */
  ageActuel?:              number
}

/** Détail spécifique SCI IS. */
export interface SciIsDetail {
  /** Net SCI après IS (avant distribution). */
  netApresIS:                       number
  /** Net pour l'associé après distribution en dividendes (PFU 30 %). */
  netApresDistributionDividendes:   number
  /** Net pour l'associé après remboursement CCA prioritaire (PFU 30 % sur le solde). */
  netApresRemboursementCCA:         number
  /** Montant effectivement remboursable du CCA (≤ net après IS). */
  montantCCARemboursable:           number
  /** Taux IS appliqué. */
  tauxISPct:                        number
}

/** Détail spécifique LMP. */
export interface LmpDetail {
  /** PV court terme = min(PV totale, amortissements cumulés). */
  pvCourtTerme:             number
  /** PV long terme = PV totale − PV CT. */
  pvLongTerme:              number
  /** Impôt CT (TMI sur PV CT après éventuelle exo). */
  impotCourtTerme:          number
  /** Cotisations sociales sur PV CT (17,2 %). */
  cotisationsSocialesLMP:   number
  /** Impôt LT (PFU IR 12,8 %). */
  impotLongTerme:           number
  /** Exonération applicable (art. 151 septies). */
  exonerationApplicable:    boolean
  /** Taux d'exonération en %, 100 = totale. */
  tauxExonerationPct:       number
  /** Raison exo si applicable. */
  raisonExoneration?:       string
}

/** Détail du remboursement bancaire (CRD + IRA) lors de la cession. */
export interface CreditDetail {
  /** CRD estimé à la date de cession (€). */
  crdADateCession:          number
  /** Mensualités restantes jusqu'à la fin du prêt. */
  mensualitesRestantes:     number
  /** true si le crédit est déjà soldé à la date de cession. */
  creditSolde:              boolean
  /** Indemnités de remboursement anticipé retenues (€). */
  ira:                      number
  /** Méthode de calcul IRA retenue. */
  methodeIRA:               IraMethode
  /** Libellé pédagogique de la méthode IRA retenue. */
  detailIRA:                string
  /** Total à rembourser à la banque = CRD + IRA. */
  totalRemboursementBanque: number
  /** Net vendeur AVANT déduction CRD + IRA (impôts et frais déjà déduits). */
  netVendeurAvantCredit:    number
}

/** Comparaison rapide avec les autres régimes. */
export interface ComparaisonRegime {
  regime:          RegimeFiscalRevente
  regimeLabel:     string
  impotTotal:      number
  netVendeur:      number
  estRegimeActuel: boolean
}

export interface SimulationReventeImpactFIRE {
  gainPatrimoineNet:        number
  gainAnneesFIRE:           number | null
  nouvelAgeIndependance:    number | null
  ageIndependanceSansVente: number | null
}

export interface SimulationReventeResult {
  /** Régime utilisé pour ce calcul. */
  regime:                   RegimeFiscalRevente
  regimeLabel:              string

  /** Prix de vente envisagé (input, propagé pour l'UI / waterfall). */
  prixVenteEstime:          number
  /** Frais d'agence (input, propagé pour l'UI / waterfall). */
  fraisAgenceVente:         number

  /** Années révolues entre dateAchat et dateCessionEstimee. */
  anneesDetention:          number

  // Reconstitution du prix d'acquisition
  fraisAcquisitionRetenus:  number
  travauxRetenus:           number
  prixAcquisitionCorriges:  number

  // Amortissements (régimes assimilés BIC / IS)
  vnc?:                       number
  amortissementsCumulesUtilises: number
  amortissementsEstimes:        boolean

  // Plus-value brute (avant fiscalité)
  pvBrute:                  number
  pvImposable:              number

  // ── Champs régime particulier / LMNP (rétro-compat) ─────────────
  /** % d'abattement IR appliqué. 0 hors régime particulier/LMNP. */
  abattementIRPct:          number
  /** % d'abattement PS appliqué. 0 hors régime particulier/LMNP. */
  abattementPSPct:          number
  /** PV nette après abattement IR (€). 0 hors régime particulier/LMNP. */
  pvNettePourIR:            number
  /** PV nette après abattement PS (€). 0 hors régime particulier/LMNP. */
  pvNettePourPS:            number
  /** Impôt IR (régime particulier/LMNP) ou impôt principal du régime. */
  impotIR:                  number
  /** Impôt PS (régime particulier/LMNP). */
  impotPS:                  number
  /** Surtaxe (régime particulier/LMNP). */
  surtaxe:                  number

  // Totaux
  impotTotal:               number
  netVendeur:               number
  tauxImpositionEffectifPct: number

  // Exonération
  exonere:                  boolean
  raisonExoneration?:       string

  // Détails par régime (présents seulement si pertinents)
  sciIsDetail?:             SciIsDetail
  lmpDetail?:               LmpDetail

  // Crédit immobilier (présent uniquement si données du prêt fournies)
  creditDetail?:            CreditDetail

  // Pédagogie + conseils
  avertissements:           string[]
  comparaisonRegimes?:      ComparaisonRegime[]
  conseilAttente?: {
    dateOptimale: Date
    gainEstime:   number
    explication:  string
  }

  // Impact projection
  impactFIRE?:              SimulationReventeImpactFIRE
}

// ─────────────────────────────────────────────────────────────────
// Helpers exportés (rétro-compat tests existants)
// ─────────────────────────────────────────────────────────────────

/** Années révolues entre deux dates (jour près). */
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
  const pal6a21 = Math.min(annees - 5, 16) * 6  // 6 à 96 % de l'année 6 à l'année 21
  if (annees <= 21) return pal6a21
  return pal6a21 + 4  // année 22 → 96 + 4 = 100 (capturé par >= 22 ci-dessus)
}

/** Taux d'abattement PS sur la PV (%). */
export function abattementPSPct(annees: number): number {
  if (annees < 6)   return 0
  if (annees >= 30) return 100
  const pal6a21 = Math.min(annees - 5, 16) * 1.65
  if (annees <= 21) return pal6a21
  if (annees === 22) return pal6a21 + 1.60
  const palAfter22 = (annees - 22) * 9
  return pal6a21 + 1.60 + palAfter22
}

/** Surtaxe progressive sur la PV nette IR (€). */
export function calculerSurtaxe(pvNetteIR: number): number {
  if (pvNetteIR <= 50_000)  return 0
  if (pvNetteIR <= 100_000) return Math.round(pvNetteIR * 0.02)
  if (pvNetteIR <= 150_000) return Math.round(pvNetteIR * 0.03)
  if (pvNetteIR <= 200_000) return Math.round(pvNetteIR * 0.04)
  if (pvNetteIR <= 250_000) return Math.round(pvNetteIR * 0.05)
  return Math.round(pvNetteIR * 0.06)
}

/** Estimation d'amortissements quand l'utilisateur ne saisit rien. */
export function estimerAmortissements(prixAchat: number, annees: number): number {
  return Math.round(
    prixAchat * QUOTE_PART_AMORTISSABLE_PCT * AMORTISSEMENT_ANNUEL_ESTIME_PCT * annees,
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────

function calculerFraisEtTravaux(input: SimulationReventeInput, annees: number): {
  fraisAcquisitionRetenus: number
  travauxRetenus:          number
} {
  const { prixAchat, fraisAcquisitionReels, travauxReels } = input

  const fraisAcquisitionRetenus = fraisAcquisitionReels !== undefined && fraisAcquisitionReels > 0
    ? fraisAcquisitionReels
    : Math.round(prixAchat * FORFAIT_FRAIS_ACQUISITION_PCT)

  const forfaitTravaux = Math.round(prixAchat * FORFAIT_TRAVAUX_PCT)
  let travauxRetenus = 0
  if (travauxReels !== undefined && travauxReels >= forfaitTravaux) {
    travauxRetenus = travauxReels
  } else if (annees > TRAVAUX_FORFAIT_MIN_ANS) {
    travauxRetenus = forfaitTravaux
  } else if (travauxReels !== undefined && travauxReels > 0) {
    travauxRetenus = travauxReels
  }

  return { fraisAcquisitionRetenus, travauxRetenus }
}

/**
 * Construit le `CreditDetail` à partir des inputs crédit du bien.
 * Renvoie `undefined` si aucune donnée de crédit n'est fournie.
 * `netVendeurAvantCredit` doit être le net vendeur **après** impôts et
 * frais d'agence, mais **avant** déduction CRD/IRA.
 */
function buildCreditDetail(
  input:                 SimulationReventeInput,
  netVendeurAvantCredit: number,
): CreditDetail | undefined {
  // Mode 1 : données brutes du prêt (calcul d'amortissement complet)
  if (
    input.creditCapitalInitial !== undefined && input.creditCapitalInitial > 0
    && input.creditTauxAnnuelPct !== undefined
    && input.creditDureeMois !== undefined && input.creditDureeMois > 0
    && input.creditDateDebut !== undefined
  ) {
    const crdR = calculerCRD(
      input.creditCapitalInitial,
      input.creditTauxAnnuelPct,
      input.creditDureeMois,
      input.creditDateDebut,
      input.dateCessionEstimee,
    )
    const iraR = calculerIRA(crdR.crd, input.creditTauxAnnuelPct, input.iraExonere)
    return {
      crdADateCession:          crdR.crd,
      mensualitesRestantes:     crdR.mensualitesRestantes,
      creditSolde:              crdR.creditSolde,
      ira:                      iraR.ira,
      methodeIRA:               iraR.methode,
      detailIRA:                iraR.detail,
      totalRemboursementBanque: crdR.crd + iraR.ira,
      netVendeurAvantCredit,
    }
  }

  // Mode 2 : CRD pré-calculé par l'app (cache `debts.capital_remaining`)
  if (input.creditCapitalRestantDu !== undefined && input.creditCapitalRestantDu > 0) {
    const crd = Math.round(input.creditCapitalRestantDu)
    const iraR = calculerIRA(crd, input.creditTauxAnnuelPct ?? 0, input.iraExonere)
    return {
      crdADateCession:          crd,
      mensualitesRestantes:     0,
      creditSolde:              false,
      ira:                      iraR.ira,
      methodeIRA:               iraR.methode,
      detailIRA:                iraR.detail,
      totalRemboursementBanque: crd + iraR.ira,
      netVendeurAvantCredit,
    }
  }

  return undefined
}

/**
 * Applique le remboursement bancaire (CRD + IRA) au résultat :
 *   - écrit `creditDetail` (si crédit fourni)
 *   - met à jour `netVendeur = netVendeur − CRD − IRA`
 *
 * Sans crédit fourni, le résultat est inchangé (rétro-compat 100 %).
 */
function applyCreditToResult(
  result: SimulationReventeResult,
  input:  SimulationReventeInput,
): void {
  const detail = buildCreditDetail(input, result.netVendeur)
  if (!detail) return
  result.creditDetail = detail
  result.netVendeur = result.netVendeur - detail.totalRemboursementBanque
}

function computeImpactFIRE(
  input: SimulationReventeInput,
  netVendeur: number,
): SimulationReventeImpactFIRE | undefined {
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

function calculerConseilAttente(
  input:              SimulationReventeInput,
  anneesActuelles:    number,
  abattIRActuel:      number,
  abattPSActuel:      number,
  pvBrute:            number,
): SimulationReventeResult['conseilAttente'] | undefined {
  if (anneesActuelles >= 30) return undefined

  for (let anneesTest = anneesActuelles + 1; anneesTest <= 30; anneesTest++) {
    const abattIRTest = abattementIRPct(anneesTest)
    const abattPSTest = abattementPSPct(anneesTest)
    const gainAbattIR = abattIRTest - abattIRActuel
    if (gainAbattIR < 6) continue

    const pvNetteIRActuel = pvBrute * (1 - abattIRActuel / 100)
    const pvNetteIRTest   = pvBrute * (1 - abattIRTest   / 100)
    const economieIR = (pvNetteIRActuel - pvNetteIRTest) * TAUX_IR_PV_IMMO_PCT

    const pvNettePSActuel = pvBrute * (1 - abattPSActuel / 100)
    const pvNettePSTest   = pvBrute * (1 - abattPSTest   / 100)
    const economiePS = (pvNettePSActuel - pvNettePSTest) * TAUX_PS_PCT

    const gainEstime = Math.round(economieIR + economiePS)
    if (gainEstime < 500) continue

    const dateOptimale = new Date(input.dateAchat.getTime())
    dateOptimale.setUTCFullYear(dateOptimale.getUTCFullYear() + anneesTest + 1)

    return {
      dateOptimale,
      gainEstime,
      explication:
        `En attendant ${dateOptimale.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}, `
        + `tu gagnes +${gainAbattIR} points d'abattement IR, soit ~${gainEstime.toLocaleString('fr-FR')} € d'impôts économisés.`,
    }
  }
  return undefined
}

interface CalcOptions {
  /** Si true → ne calcule ni `comparaisonRegimes` ni `conseilAttente`
   *  ni `impactFIRE` (évite la récursion infinie côté comparaison). */
  pourComparaison?: boolean
}

// ─────────────────────────────────────────────────────────────────
// Calculateur — régime particulier / foncier_nu / scpi / micro_bic
// ─────────────────────────────────────────────────────────────────

function calculerPVParticulier(
  input: SimulationReventeInput,
  opts:  CalcOptions = {},
): SimulationReventeResult {
  const regime = input.regimeFiscal ?? 'particulier'
  const annees = anneesRevolues(input.dateAchat, input.dateCessionEstimee)
  const fraisAgence = input.fraisAgenceVente ?? 0
  const avertissements: string[] = []

  const { fraisAcquisitionRetenus, travauxRetenus } = calculerFraisEtTravaux(input, annees)
  const prixAcquisitionCorriges = input.prixAchat + fraisAcquisitionRetenus + travauxRetenus
  const pvBrute = Math.max(0, input.prixVenteEstime - prixAcquisitionCorriges)

  // ── Exonération RP ────────────────────────────────────────────────
  if (input.typeUsage === 'residence_principale') {
    return baseExonere(input, regime, annees, prixAcquisitionCorriges,
      fraisAcquisitionRetenus, travauxRetenus,
      'Résidence principale — exonération totale (art. 150 U II-1° du CGI).',
      pvBrute, avertissements)
  }

  // ── Moins-value ───────────────────────────────────────────────────
  if (pvBrute <= 0) {
    return baseExonere(input, regime, annees, prixAcquisitionCorriges,
      fraisAcquisitionRetenus, travauxRetenus,
      'Pas de plus-value (prix de vente ≤ prix d\'acquisition corrigé).',
      pvBrute, avertissements)
  }

  // Abattements (calculés ici pour pouvoir les exposer même en cas d'exonération PV faible)
  const abattIR = abattementIRPct(annees)
  const abattPS = abattementPSPct(annees)
  const pvNettePourIR = Math.max(0, pvBrute * (1 - abattIR / 100))
  const pvNettePourPS = Math.max(0, pvBrute * (1 - abattPS / 100))

  // ── Exonération PV ≤ 15 000 € ─────────────────────────────────────
  if (pvBrute <= SEUIL_EXO_PV_EUR) {
    const r = baseExonere(input, regime, annees, prixAcquisitionCorriges,
      fraisAcquisitionRetenus, travauxRetenus,
      `Plus-value brute ≤ ${SEUIL_EXO_PV_EUR.toLocaleString('fr-FR')} € — exonérée.`,
      pvBrute, avertissements)
    r.abattementIRPct = abattIR
    r.abattementPSPct = abattPS
    r.pvNettePourIR = pvNettePourIR
    r.pvNettePourPS = pvNettePourPS
    return r
  }

  // ── 1re cession hors RP ───────────────────────────────────────────
  if (input.estPremiereCessionHorsRP) {
    const r = baseExonere(input, regime, annees, prixAcquisitionCorriges,
      fraisAcquisitionRetenus, travauxRetenus,
      '1re cession d\'un bien autre que la RP, vendeur sans RP depuis 4 ans — exonérée (art. 150 U II-1° bis).',
      pvBrute, avertissements)
    r.abattementIRPct = abattIR
    r.abattementPSPct = abattPS
    r.pvNettePourIR = pvNettePourIR
    r.pvNettePourPS = pvNettePourPS
    return r
  }

  // ── Calcul impôt standard ─────────────────────────────────────────
  const impotIR = Math.round(pvNettePourIR * TAUX_IR_PV_IMMO_PCT)
  const impotPS = Math.round(pvNettePourPS * TAUX_PS_PCT)
  const surtaxe = calculerSurtaxe(pvNettePourIR)
  const impotTotal = impotIR + impotPS + surtaxe

  const netVendeur = input.prixVenteEstime - fraisAgence - impotTotal
  const tauxImpositionEffectifPct = pvBrute > 0
    ? Math.round((impotTotal / pvBrute) * 1000) / 10
    : 0

  const result: SimulationReventeResult = {
    regime,
    regimeLabel: REGIME_LABELS[regime],
    prixVenteEstime: input.prixVenteEstime,
    fraisAgenceVente: fraisAgence,
    anneesDetention: annees,
    fraisAcquisitionRetenus,
    travauxRetenus,
    prixAcquisitionCorriges,
    amortissementsCumulesUtilises: 0,
    amortissementsEstimes: false,
    pvBrute,
    pvImposable: pvBrute,
    abattementIRPct: abattIR,
    abattementPSPct: abattPS,
    pvNettePourIR,
    pvNettePourPS,
    impotIR,
    impotPS,
    surtaxe,
    impotTotal,
    netVendeur,
    tauxImpositionEffectifPct,
    exonere: false,
    avertissements,
  }

  applyCreditToResult(result, input)

  if (!opts.pourComparaison) {
    const conseil = calculerConseilAttente(input, annees, abattIR, abattPS, pvBrute)
    if (conseil) result.conseilAttente = conseil
    const impactFIRE = computeImpactFIRE(input, result.netVendeur)
    if (impactFIRE) result.impactFIRE = impactFIRE
  }
  return result
}

// ─────────────────────────────────────────────────────────────────
// Calculateur — LMNP réel (loi finances 2025)
// ─────────────────────────────────────────────────────────────────

function calculerPVLmnp(
  input: SimulationReventeInput,
  opts:  CalcOptions = {},
): SimulationReventeResult {
  const regime = input.regimeFiscal ?? 'lmnp'
  const annees = anneesRevolues(input.dateAchat, input.dateCessionEstimee)
  const fraisAgence = input.fraisAgenceVente ?? 0
  const avertissements: string[] = []

  const { fraisAcquisitionRetenus, travauxRetenus } = calculerFraisEtTravaux(input, annees)
  const baseCorrigee = input.prixAchat + fraisAcquisitionRetenus + travauxRetenus

  let amortissementsCumules = input.amortissementsCumules
  let amortissementsEstimes = false
  if (amortissementsCumules === undefined) {
    amortissementsCumules = estimerAmortissements(input.prixAchat, annees)
    amortissementsEstimes = true
    avertissements.push(
      `Amortissements estimés à ${(AMORTISSEMENT_ANNUEL_ESTIME_PCT * 100).toFixed(1)} %/an `
      + `× ${(QUOTE_PART_AMORTISSABLE_PCT * 100).toFixed(0)} % amortissable, soit `
      + `${amortissementsCumules.toLocaleString('fr-FR')} € sur ${annees} an${annees > 1 ? 's' : ''}. `
      + 'Renseigne le montant comptable réel pour plus de précision.',
    )
  }

  avertissements.push(
    'Loi de finances 2025 : les amortissements pratiqués en LMNP réel sont '
    + 'désormais réintégrés au calcul de la plus-value imposable. La taxation '
    + 'reste au régime des particuliers (abattements pour durée applicables).',
  )

  // VNC LMNP = base corrigée − amortissements cumulés
  const vnc = Math.max(0, baseCorrigee - amortissementsCumules)
  const pvBrute = Math.max(0, input.prixVenteEstime - vnc)

  // ── Exonération RP ────────────────────────────────────────────────
  if (input.typeUsage === 'residence_principale') {
    const r = baseExonere(input, regime, annees, vnc,
      fraisAcquisitionRetenus, travauxRetenus,
      'Résidence principale — exonération totale.',
      pvBrute, avertissements)
    r.vnc = vnc
    r.amortissementsCumulesUtilises = amortissementsCumules
    r.amortissementsEstimes = amortissementsEstimes
    return r
  }

  if (pvBrute <= 0) {
    const r = baseExonere(input, regime, annees, vnc,
      fraisAcquisitionRetenus, travauxRetenus,
      'Pas de plus-value (vente ≤ VNC).',
      pvBrute, avertissements)
    r.vnc = vnc
    r.amortissementsCumulesUtilises = amortissementsCumules
    r.amortissementsEstimes = amortissementsEstimes
    return r
  }

  const abattIR = abattementIRPct(annees)
  const abattPS = abattementPSPct(annees)
  const pvNettePourIR = Math.max(0, pvBrute * (1 - abattIR / 100))
  const pvNettePourPS = Math.max(0, pvBrute * (1 - abattPS / 100))

  if (pvBrute <= SEUIL_EXO_PV_EUR) {
    const r = baseExonere(input, regime, annees, vnc,
      fraisAcquisitionRetenus, travauxRetenus,
      `Plus-value brute ≤ ${SEUIL_EXO_PV_EUR.toLocaleString('fr-FR')} € — exonérée.`,
      pvBrute, avertissements)
    r.vnc = vnc
    r.amortissementsCumulesUtilises = amortissementsCumules
    r.amortissementsEstimes = amortissementsEstimes
    r.abattementIRPct = abattIR
    r.abattementPSPct = abattPS
    r.pvNettePourIR = pvNettePourIR
    r.pvNettePourPS = pvNettePourPS
    return r
  }

  const impotIR = Math.round(pvNettePourIR * TAUX_IR_PV_IMMO_PCT)
  const impotPS = Math.round(pvNettePourPS * TAUX_PS_PCT)
  const surtaxe = calculerSurtaxe(pvNettePourIR)
  const impotTotal = impotIR + impotPS + surtaxe

  const netVendeur = input.prixVenteEstime - fraisAgence - impotTotal
  const tauxImpositionEffectifPct = pvBrute > 0
    ? Math.round((impotTotal / pvBrute) * 1000) / 10
    : 0

  const result: SimulationReventeResult = {
    regime,
    regimeLabel: REGIME_LABELS[regime],
    prixVenteEstime: input.prixVenteEstime,
    fraisAgenceVente: fraisAgence,
    anneesDetention: annees,
    fraisAcquisitionRetenus,
    travauxRetenus,
    prixAcquisitionCorriges: vnc,
    vnc,
    amortissementsCumulesUtilises: amortissementsCumules,
    amortissementsEstimes,
    pvBrute,
    pvImposable: pvBrute,
    abattementIRPct: abattIR,
    abattementPSPct: abattPS,
    pvNettePourIR,
    pvNettePourPS,
    impotIR,
    impotPS,
    surtaxe,
    impotTotal,
    netVendeur,
    tauxImpositionEffectifPct,
    exonere: false,
    avertissements,
  }

  applyCreditToResult(result, input)

  if (!opts.pourComparaison) {
    const conseil = calculerConseilAttente(input, annees, abattIR, abattPS, pvBrute)
    if (conseil) result.conseilAttente = conseil
    const impactFIRE = computeImpactFIRE(input, result.netVendeur)
    if (impactFIRE) result.impactFIRE = impactFIRE
  }
  return result
}

// ─────────────────────────────────────────────────────────────────
// Calculateur — LMP (loueur meublé professionnel)
// ─────────────────────────────────────────────────────────────────

function calculerPVLmp(
  input: SimulationReventeInput,
  opts:  CalcOptions = {},
): SimulationReventeResult {
  const regime: RegimeFiscalRevente = 'lmp'
  const annees = anneesRevolues(input.dateAchat, input.dateCessionEstimee)
  const fraisAgence = input.fraisAgenceVente ?? 0
  const avertissements: string[] = []
  const tmi = (input.tmiLmp ?? 30) / 100

  // Amortissements
  let amortissementsCumules = input.amortissementsCumules
  let amortissementsEstimes = false
  if (amortissementsCumules === undefined) {
    amortissementsCumules = estimerAmortissements(input.prixAchat, annees)
    amortissementsEstimes = true
    avertissements.push(
      `Amortissements estimés à ${amortissementsCumules.toLocaleString('fr-FR')} €. `
      + 'Renseigne le montant comptable réel.',
    )
  }

  avertissements.push(
    'En LMP, la PV court terme (à hauteur des amortissements) est taxée à votre '
    + 'TMI + 17,2 % de cotisations sociales. La PV long terme est taxée à 12,8 % '
    + '(PFU IR). Pas d\'abattement pour durée de détention.',
  )

  const vnc = Math.max(0, input.prixAchat - amortissementsCumules)
  const pvTotale = Math.max(0, input.prixVenteEstime - vnc)
  const pvBrute = input.prixVenteEstime - input.prixAchat  // PV "marché" (info)

  // Exonération art. 151 septies — basée sur CA moyen sur 2 ans
  const ca = input.caLmpMoyenSur2Ans ?? 0
  let exonerationApplicable = false
  let tauxExonerationPct = 0
  let raisonExo: string | undefined
  if (ca > 0 && ca < PLAFOND_EXO_LMP_TOTAL) {
    exonerationApplicable = true
    tauxExonerationPct = 100
    raisonExo = `CA < ${PLAFOND_EXO_LMP_TOTAL.toLocaleString('fr-FR')} € — exonération totale (art. 151 septies CGI).`
  } else if (ca >= PLAFOND_EXO_LMP_TOTAL && ca <= PLAFOND_EXO_LMP_PARTIELLE) {
    exonerationApplicable = true
    tauxExonerationPct = ((PLAFOND_EXO_LMP_PARTIELLE - ca) / 36_000) * 100
    raisonExo = `CA ${ca.toLocaleString('fr-FR')} € entre 90 k et 126 k — exonération dégressive (${tauxExonerationPct.toFixed(0)} %).`
  }

  if (input.typeUsage === 'residence_principale') {
    return baseExonere(input, regime, annees, vnc, 0, 0,
      'Résidence principale — exonération totale.', pvBrute, avertissements)
  }

  if (pvTotale <= 0) {
    return baseExonere(input, regime, annees, vnc, 0, 0,
      'Pas de plus-value (vente ≤ VNC).', pvBrute, avertissements)
  }

  // PV court terme = min(PV totale, amortissements pratiqués)
  const pvCourtTerme = Math.min(pvTotale, amortissementsCumules)
  const pvLongTerme  = Math.max(0, pvTotale - pvCourtTerme)

  // Application de l'exonération (réduit les bases CT et LT proportionnellement)
  const facteurExo = exonerationApplicable ? (1 - tauxExonerationPct / 100) : 1
  const pvCTImposable = pvCourtTerme * facteurExo
  const pvLTImposable = pvLongTerme  * facteurExo

  const impotCT = Math.round(pvCTImposable * tmi)
  const cotisationsSocialesLMP = Math.round(pvCTImposable * TAUX_PS_PCT)
  const impotLT = Math.round(pvLTImposable * TAUX_PFU_IR_PCT)
  const impotTotal = impotCT + cotisationsSocialesLMP + impotLT
  const netVendeur = input.prixVenteEstime - fraisAgence - impotTotal

  const lmpDetail: LmpDetail = {
    pvCourtTerme,
    pvLongTerme,
    impotCourtTerme: impotCT,
    cotisationsSocialesLMP,
    impotLongTerme: impotLT,
    exonerationApplicable,
    tauxExonerationPct,
    raisonExoneration: raisonExo,
  }

  const result: SimulationReventeResult = {
    regime,
    regimeLabel: REGIME_LABELS[regime],
    prixVenteEstime: input.prixVenteEstime,
    fraisAgenceVente: fraisAgence,
    anneesDetention: annees,
    fraisAcquisitionRetenus: 0,
    travauxRetenus: 0,
    prixAcquisitionCorriges: vnc,
    vnc,
    amortissementsCumulesUtilises: amortissementsCumules,
    amortissementsEstimes,
    pvBrute,
    pvImposable: pvCTImposable + pvLTImposable,
    abattementIRPct: 0,
    abattementPSPct: 0,
    pvNettePourIR: 0,
    pvNettePourPS: 0,
    impotIR: impotCT + impotLT,
    impotPS: cotisationsSocialesLMP,
    surtaxe: 0,
    impotTotal,
    netVendeur,
    tauxImpositionEffectifPct: pvTotale > 0
      ? Math.round((impotTotal / pvTotale) * 1000) / 10 : 0,
    exonere: exonerationApplicable && tauxExonerationPct === 100,
    raisonExoneration: exonerationApplicable && tauxExonerationPct === 100 ? raisonExo : undefined,
    lmpDetail,
    avertissements,
  }

  applyCreditToResult(result, input)

  if (!opts.pourComparaison) {
    const impactFIRE = computeImpactFIRE(input, result.netVendeur)
    if (impactFIRE) result.impactFIRE = impactFIRE
  }
  return result
}

// ─────────────────────────────────────────────────────────────────
// Calculateur — SCI à l'IS
// ─────────────────────────────────────────────────────────────────

function calculerPVSciIs(
  input: SimulationReventeInput,
  opts:  CalcOptions = {},
): SimulationReventeResult {
  const regime: RegimeFiscalRevente = 'sci_is'
  const annees = anneesRevolues(input.dateAchat, input.dateCessionEstimee)
  const fraisAgence = input.fraisAgenceVente ?? 0
  const avertissements: string[] = []
  const tauxIS = (input.tauxIS ?? 25) / 100
  const cca = input.comptesCourantsAssocies ?? 0

  // Amortissements
  let amortissementsCumules = input.amortissementsCumules
  let amortissementsEstimes = false
  if (amortissementsCumules === undefined) {
    amortissementsCumules = estimerAmortissements(input.prixAchat, annees)
    amortissementsEstimes = true
    avertissements.push(
      `Amortissements estimés à ${amortissementsCumules.toLocaleString('fr-FR')} €. `
      + 'Renseigne le montant comptable réel pour plus de précision.',
    )
  }

  avertissements.push(
    'En SCI à l\'IS, pas d\'abattement pour durée de détention. La VNC (prix '
    + 'd\'achat − amortissements) est la base de calcul. La PV est taxée à '
    + 'l\'IS au niveau de la société puis au PFU (30 %) en cas de distribution. '
    + 'Le remboursement des comptes courants d\'associés (CCA) se fait sans imposition.',
  )

  const vnc = Math.max(0, input.prixAchat - amortissementsCumules)
  const pvImposableIS = Math.max(0, input.prixVenteEstime - vnc)
  const pvBrute = input.prixVenteEstime - input.prixAchat

  if (input.typeUsage === 'residence_principale') {
    return baseExonere(input, regime, annees, vnc, 0, 0,
      'Résidence principale — exonération totale.', pvBrute, avertissements)
  }

  const impotIS = Math.round(pvImposableIS * tauxIS)
  const netApresIS = input.prixVenteEstime - fraisAgence - impotIS

  // Scénario A : distribution dividendes (PFU 30 % sur tout le net après IS)
  const netApresDistributionDividendes = Math.round(netApresIS * (1 - TAUX_PFU_PCT))

  // Scénario B : remboursement CCA prioritaire (sans imposition), PFU sur le solde
  const ccaRemboursable = Math.min(cca, Math.max(0, netApresIS))
  const soldeApresCCA = Math.max(0, netApresIS - ccaRemboursable)
  const netApresRemboursementCCA = Math.round(ccaRemboursable + soldeApresCCA * (1 - TAUX_PFU_PCT))

  // netVendeur de référence : si CCA fourni > 0, on prend le scénario CCA (meilleur).
  const netVendeur = cca > 0 ? netApresRemboursementCCA : netApresDistributionDividendes

  const sciIsDetail: SciIsDetail = {
    netApresIS,
    netApresDistributionDividendes,
    netApresRemboursementCCA,
    montantCCARemboursable: ccaRemboursable,
    tauxISPct: tauxIS * 100,
  }

  // Impôt total côté associé = écart entre prix de vente − frais agence et net en poche
  const impotTotal = (input.prixVenteEstime - fraisAgence) - netVendeur

  const result: SimulationReventeResult = {
    regime,
    regimeLabel: REGIME_LABELS[regime],
    prixVenteEstime: input.prixVenteEstime,
    fraisAgenceVente: fraisAgence,
    anneesDetention: annees,
    fraisAcquisitionRetenus: 0,
    travauxRetenus: 0,
    prixAcquisitionCorriges: vnc,
    vnc,
    amortissementsCumulesUtilises: amortissementsCumules,
    amortissementsEstimes,
    pvBrute,
    pvImposable: pvImposableIS,
    abattementIRPct: 0,
    abattementPSPct: 0,
    pvNettePourIR: 0,
    pvNettePourPS: 0,
    impotIR: impotIS,                                  // « IR » au sens largo = impôt principal (ici IS)
    impotPS: Math.max(0, impotTotal - impotIS),        // reste = PFU effectif
    surtaxe: 0,
    impotTotal,
    netVendeur,
    tauxImpositionEffectifPct: pvBrute > 0
      ? Math.round((impotTotal / Math.max(pvBrute, 1)) * 1000) / 10 : 0,
    exonere: false,
    sciIsDetail,
    avertissements,
  }

  applyCreditToResult(result, input)

  if (!opts.pourComparaison) {
    const impactFIRE = computeImpactFIRE(input, result.netVendeur)
    if (impactFIRE) result.impactFIRE = impactFIRE
  }
  return result
}

// ─────────────────────────────────────────────────────────────────
// Helper exonération générique
// ─────────────────────────────────────────────────────────────────

function baseExonere(
  input:                    SimulationReventeInput,
  regime:                   RegimeFiscalRevente,
  annees:                   number,
  prixAcquisitionCorriges:  number,
  fraisAcquisitionRetenus:  number,
  travauxRetenus:           number,
  raisonExoneration:        string,
  pvBrute:                  number,
  avertissements:           string[],
): SimulationReventeResult {
  const fraisAgence = input.fraisAgenceVente ?? 0
  const netVendeur = input.prixVenteEstime - fraisAgence
  const result: SimulationReventeResult = {
    regime,
    regimeLabel: REGIME_LABELS[regime],
    prixVenteEstime: input.prixVenteEstime,
    fraisAgenceVente: fraisAgence,
    anneesDetention: annees,
    fraisAcquisitionRetenus,
    travauxRetenus,
    prixAcquisitionCorriges,
    amortissementsCumulesUtilises: 0,
    amortissementsEstimes: false,
    pvBrute,
    pvImposable: 0,
    abattementIRPct: 0,
    abattementPSPct: 0,
    pvNettePourIR: 0,
    pvNettePourPS: 0,
    impotIR: 0,
    impotPS: 0,
    surtaxe: 0,
    impotTotal: 0,
    netVendeur,
    tauxImpositionEffectifPct: 0,
    exonere: true,
    raisonExoneration,
    avertissements,
  }
  applyCreditToResult(result, input)
  const impactFIRE = computeImpactFIRE(input, result.netVendeur)
  if (impactFIRE) result.impactFIRE = impactFIRE
  return result
}

// ─────────────────────────────────────────────────────────────────
// Comparaison inter-régimes
// ─────────────────────────────────────────────────────────────────

/** Calcule la PV pour chaque régime applicable avec les mêmes inputs
 *  (utile pour montrer à l'utilisateur l'impact du choix de régime). */
export function calculerComparaisonRegimes(
  input: SimulationReventeInput,
): ComparaisonRegime[] {
  const regimeActuel = input.regimeFiscal ?? 'particulier'
  const regimes: RegimeFiscalRevente[] = ['particulier', 'lmnp', 'lmp', 'sci_is']

  return regimes
    .map((regime) => {
      const result = dispatchCalc({ ...input, regimeFiscal: regime }, { pourComparaison: true })
      return {
        regime,
        regimeLabel:     REGIME_LABELS[regime],
        impotTotal:      result.impotTotal,
        netVendeur:      result.netVendeur,
        estRegimeActuel: regime === regimeActuel,
      }
    })
    .sort((a, b) => b.netVendeur - a.netVendeur)
}

/** Dispatch interne — ne calcule pas la comparaison croisée pour éviter
 *  toute récursion infinie. */
function dispatchCalc(
  input: SimulationReventeInput,
  opts:  CalcOptions = {},
): SimulationReventeResult {
  const regime = input.regimeFiscal ?? 'particulier'
  switch (regime) {
    case 'lmnp':
    case 'micro_bic':
      return calculerPVLmnp(input, opts)
    case 'lmp':
      return calculerPVLmp(input, opts)
    case 'sci_is':
      return calculerPVSciIs(input, opts)
    case 'particulier':
    case 'foncier_nu':
    case 'scpi':
    default:
      return calculerPVParticulier(input, opts)
  }
}

// ─────────────────────────────────────────────────────────────────
// API publique principale
// ─────────────────────────────────────────────────────────────────

export function calculerPlusValue(input: SimulationReventeInput): SimulationReventeResult {
  const result = dispatchCalc(input)
  // Comparaison inter-régimes (toujours, sauf si déjà calculée pour comparaison)
  result.comparaisonRegimes = calculerComparaisonRegimes(input)
  return result
}

// ─────────────────────────────────────────────────────────────────
// Helper de mapping DB → régime de revente
// ─────────────────────────────────────────────────────────────────

/** Mappe un `fiscal_regime` stocké en DB (cf. types/database.types.ts
 *  FiscalRegime) vers le régime de revente correspondant.
 *  Défaut → 'particulier'. */
export function mapFiscalRegimeToRevente(fiscalRegime: string | null | undefined): RegimeFiscalRevente {
  if (!fiscalRegime) return 'particulier'
  switch (fiscalRegime) {
    case 'lmnp_reel':     return 'lmnp'
    case 'lmnp_micro':    return 'micro_bic'
    case 'lmp':           return 'lmp'
    case 'sci_is':        return 'sci_is'
    case 'sci_ir':        return 'particulier'
    case 'foncier_nu':    return 'foncier_nu'
    case 'foncier_micro': return 'particulier'
    default:              return 'particulier'
  }
}
