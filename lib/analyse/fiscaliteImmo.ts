/**
 * Estimation rapide de l'impôt foncier annuel sur un bien immobilier.
 *
 * Fonction pure et SIMPLIFIÉE : sert au calcul du cashflow "net après
 * impôts" affiché dans la vue Analyse (KPIs et alertes). Elle ne remplace
 * PAS le moteur fiscal complet de `lib/real-estate/fiscal/` (qui gère
 * carry-forward des déficits, amortissements pluri-annuels, plafonds
 * SSI / déficit foncier, etc.) — c'est une approximation de premier
 * ordre, raisonnable pour donner une idée du cashflow réellement perçu
 * une fois l'impôt acquitté.
 *
 * Conventions :
 *   - Tous les montants sont en euros annuels (sauf indication contraire).
 *   - `tmi_rate` est en POURCENTAGE entier (ex. 30 pour 30 %), aligné sur
 *     le stockage `profiles.tmi_rate`. Défaut 30 si null.
 *   - Le déficit foncier est traité simplement : si la base imposable est
 *     négative, l'impôt est nul (pas d'imputation sur le revenu global).
 *   - Le calcul utilise PRELEVEMENTS_SOCIAUX_PCT (17.2 %) comme dans le
 *     moteur fiscal complet (cf. lib/real-estate/fiscal/common.ts).
 */

import type { FiscalRegime } from '@/types/database.types'
import { PRELEVEMENTS_SOCIAUX_PCT, TMI_FALLBACK_PCT } from './constants'

// Re-export pour conserver la surface d'API publique du module
// (consommateurs qui faisaient `import { PRELEVEMENTS_SOCIAUX_PCT } from '@/lib/analyse/fiscaliteImmo'`).
export { PRELEVEMENTS_SOCIAUX_PCT }

/** Taux marginal d'IS appliqué à la SCI à l'IS (estimation simplifiée). */
export const SCI_IS_RATE_PCT = 25

/** Taux d'amortissement annuel par défaut sur le bâti (LMNP réel). */
export const LMNP_AMORT_DEFAULT_PCT = 2.5

export interface ImpotFoncierInputs {
  /** Loyer brut perçu sur l'année (€). */
  loyer_annuel:         number
  /** Charges déductibles annuelles (€) — taxe foncière, PNO, copro, gestion,
   *  entretien... hors mensualité de crédit. */
  charges_annuelles:    number
  /** Intérêts d'emprunt annuels (€). Pour les régimes réels uniquement. */
  interets_credit_annuels: number
  /** Régime fiscal du bien. null = bien non-locatif (RP, nue-propriété) → 0. */
  fiscal_regime:        FiscalRegime | null
  /** Tranche marginale d'imposition en POINTS DE POURCENTAGE (0/11/30/41/45).
   *  null → défaut 30. */
  tmi_rate:             number | null
  /** Valeur du bâti utilisée pour estimer l'amortissement LMNP réel /
   *  SCI IS (en general purchase_price - terrain). Optionnel : si non
   *  fourni, amortissement = 0 (calcul plus conservateur). */
  valeur_amortissable?: number
}

export interface ImpotFoncierResult {
  /** Impôt annuel estimé (€), ≥ 0. */
  impot_annuel:         number
  /** Base imposable utilisée pour le calcul (€, peut être négative en cas de déficit). */
  base_imposable:       number
  /** Taux global appliqué à la base (TMI + PS ou IS), en POURCENTAGE. */
  taux_effectif_pct:    number
  /** Code régime utilise effectivement (avec normalisation des null). */
  regime_applique:      FiscalRegime | 'aucun'
  /** Notes/explication pour l'UI (info-bulle). */
  notes:                string
}

/**
 * Estime l'impôt annuel sur un bien selon son régime fiscal.
 *
 * Régimes supportés (alignés sur l'enum DB) :
 *   - 'foncier_micro' : abattement 30 % → base = loyer × 70 %, imposée à TMI+PS
 *   - 'foncier_nu'    : base = loyer − charges − intérêts, imposée à TMI+PS
 *   - 'lmnp_micro'    : abattement 50 % → base = loyer × 50 %, imposée à TMI+PS
 *   - 'lmnp_reel'     : base = loyer − charges − intérêts − amortissement,
 *                       imposée à TMI uniquement (pas de PS pour le BIC
 *                       non-pro selon spec utilisateur — simplification)
 *   - 'lmp'           : même base que lmnp_reel, imposée à TMI + SSI (≈ PS)
 *   - 'sci_ir'        : transparent fiscal, mêmes règles que foncier_nu
 *   - 'sci_is'        : base = loyer − charges − intérêts − amortissement,
 *                       imposée à 25 % (IS simplifié)
 */
export function calculerImpotFoncier(inputs: ImpotFoncierInputs): ImpotFoncierResult {
  const loyer    = Math.max(0, inputs.loyer_annuel)
  const charges  = Math.max(0, inputs.charges_annuelles)
  const interets = Math.max(0, inputs.interets_credit_annuels)
  const tmiPct   = inputs.tmi_rate ?? TMI_FALLBACK_PCT
  const valeurAmort = Math.max(0, inputs.valeur_amortissable ?? 0)
  const amortissement = valeurAmort * (LMNP_AMORT_DEFAULT_PCT / 100)

  // Aucun régime déclaré ou bien non-locatif → pas d'imposition à estimer.
  if (!inputs.fiscal_regime || loyer <= 0) {
    return {
      impot_annuel:      0,
      base_imposable:    0,
      taux_effectif_pct: 0,
      regime_applique:   inputs.fiscal_regime ?? 'aucun',
      notes:             loyer <= 0
        ? 'Bien sans loyer locatif déclaré — aucun impôt foncier estimé.'
        : 'Régime fiscal non renseigné — impôt non estimé.',
    }
  }

  let base = 0
  let tauxPct = 0
  let notes = ''

  switch (inputs.fiscal_regime) {
    case 'foncier_micro':
      base    = loyer * 0.70
      tauxPct = tmiPct + PRELEVEMENTS_SOCIAUX_PCT
      notes   = 'Micro-foncier : abattement forfaitaire 30 %, imposition TMI + 17,2 % PS.'
      break

    case 'foncier_nu':
      base    = loyer - charges - interets
      tauxPct = tmiPct + PRELEVEMENTS_SOCIAUX_PCT
      notes   = 'Foncier réel : loyer − charges − intérêts, imposition TMI + 17,2 % PS.'
      break

    case 'lmnp_micro':
      base    = loyer * 0.50
      tauxPct = tmiPct + PRELEVEMENTS_SOCIAUX_PCT
      notes   = 'LMNP micro-BIC : abattement forfaitaire 50 %, imposition TMI + 17,2 % PS.'
      break

    case 'lmnp_reel':
      // D18 — Audit fix : les prélèvements sociaux (17,2 %) s'appliquent
      // bien au LMNP réel non-pro sur le bénéfice positif (cf. art. L136-6
      // CSS). L'ancienne version `tauxPct = tmiPct` seul minorait le
      // cashflow net d'environ 17 points et gonflait artificiellement
      // l'écart micro-BIC vs réel.
      base    = loyer - charges - interets - amortissement
      tauxPct = tmiPct + PRELEVEMENTS_SOCIAUX_PCT
      notes   = valeurAmort > 0
        ? `LMNP réel : base = loyer − charges − intérêts − amortissement (${LMNP_AMORT_DEFAULT_PCT} % du bâti), imposition TMI + 17,2 % PS sur bénéfice positif.`
        : 'LMNP réel : base = loyer − charges − intérêts, imposition TMI + 17,2 % PS sur bénéfice positif. Amortissement non estimé (renseignez la valeur amortissable).'
      break

    case 'lmp':
      base    = loyer - charges - interets - amortissement
      tauxPct = tmiPct + PRELEVEMENTS_SOCIAUX_PCT
      notes   = 'LMP (loueur en meublé professionnel) : même base que LMNP réel, imposition TMI + cotisations SSI (~17 %).'
      break

    case 'sci_ir':
      base    = loyer - charges - interets
      tauxPct = tmiPct + PRELEVEMENTS_SOCIAUX_PCT
      notes   = 'SCI à l\'IR : transparent fiscal, mêmes règles que le foncier réel.'
      break

    case 'sci_is':
      base    = loyer - charges - interets - amortissement
      tauxPct = SCI_IS_RATE_PCT
      notes   = `SCI à l'IS : imposition à ${SCI_IS_RATE_PCT} % (IS simplifié), TMI personnel non utilisé.`
      break
  }

  // Déficit foncier : pas d'imputation sur le revenu global ici (estimation
  // simple). Si la base est négative, l'impôt est nul.
  const impot = base > 0 ? base * (tauxPct / 100) : 0

  return {
    impot_annuel:      Math.max(0, Math.round(impot)),
    base_imposable:    Math.round(base),
    taux_effectif_pct: Math.round(tauxPct * 10) / 10,
    regime_applique:   inputs.fiscal_regime,
    notes,
  }
}
