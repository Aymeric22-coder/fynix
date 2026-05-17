/**
 * Centralisation de la logique fiscale immo (Sprint 2 — D10).
 *
 * Avant cette factorisation, 3 fichiers detenaient des heuristiques
 * differentes de detection / normalisation du regime fiscal :
 *   - optimiseurFiscal.ts:692 `isRegime` (case-insensitive + includes)
 *   - aggregateur.ts:108      `FISCAL_TO_TYPE` (mapping vers libelle)
 *   - fiscaliteImmo.ts:107    switch sur l'enum DB
 *
 * Ce module unifie :
 *   - `normalizeFiscalRegime(raw)` — entree libre → enum strict.
 *   - `fiscalRegimeLabel(regime)` — enum → libelle FR.
 *   - `isRegime(bien, list)` — helper de matching utilise par
 *     l'optimiseur (compat retro).
 *   - `detecterRegimeFiscal(bien, profile)` — recommandation du
 *     regime optimal selon TMI et loyers (nouveau, Sprint 2).
 *
 * Aucun calcul d'impot ici — `fiscaliteImmo.ts` reste la source de
 * verite pour ca, c'est juste de la classification.
 */

import type { FiscalRegime } from '@/types/database.types'

// Type "etendu" : inclut les valeurs textuelles utilisateur frequentes
// (rp, locatif, scpi...) qui ne sont PAS dans l'enum DB mais qu'on rencontre
// dans le champ libre `bien.fiscal_regime`.
export type RegimeFiscalImmoExtended =
  | FiscalRegime
  | 'rp'              // Residence principale (pas d'impot foncier)
  | 'scpi'            // SCPI (passe par d'autres regimes selon enveloppe)
  | 'meuble_tourisme' // Meuble de tourisme classe (sous-cas micro-BIC)
  | 'indetermine'

/** Plafond micro-foncier : recettes brutes annuelles. */
export const PLAFOND_MICRO_FONCIER = 15_000

/** Plafond micro-BIC LMNP (location meublee non pro). */
export const PLAFOND_MICRO_BIC = 77_700

/** TMI au-dela de laquelle le regime reel devient generalement avantageux. */
export const TMI_SEUIL_REEL_PCT = 30

// ─────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────

const NORMALIZE_MAP: Record<string, RegimeFiscalImmoExtended> = {
  // Variantes de l'enum DB
  'foncier_micro':   'foncier_micro',
  'foncier_nu':      'foncier_nu',
  'foncier_reel':    'foncier_nu',   // alias historique
  'lmnp_micro':      'lmnp_micro',
  'lmnp_reel':       'lmnp_reel',
  'lmp':             'lmp',
  'sci_ir':          'sci_ir',
  'sci_is':          'sci_is',
  // Variantes utilisateur (champ libre)
  'rp':              'rp',
  'primary':         'rp',
  'rental':          'foncier_nu',
  'lmnp':            'lmnp_micro',   // par defaut, escalade vers reel si recettes >
  'nue':             'foncier_nu',
  'scpi':            'scpi',
  'meuble_tourisme': 'meuble_tourisme',
}

/** Normalise une chaine libre en `RegimeFiscalImmoExtended`. */
export function normalizeFiscalRegime(input: string | null | undefined): RegimeFiscalImmoExtended | null {
  if (!input) return null
  const key = input.trim().toLowerCase()
  if (key.length === 0) return null
  if (NORMALIZE_MAP[key]) return NORMALIZE_MAP[key]
  // Match partiel (ex: "lmnp_reel_2024" → lmnp_reel)
  for (const k of Object.keys(NORMALIZE_MAP)) {
    if (key.includes(k)) return NORMALIZE_MAP[k]!
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Mapping vers libelle FR
// ─────────────────────────────────────────────────────────────────

const LABEL_BY_REGIME: Record<RegimeFiscalImmoExtended, string> = {
  rp:              'Résidence principale',
  foncier_micro:   'Foncier micro (nu)',
  foncier_nu:      'Foncier réel (nu)',
  lmnp_micro:      'LMNP micro-BIC',
  lmnp_reel:       'LMNP réel',
  lmp:             'LMP',
  sci_ir:          'SCI à l\'IR',
  sci_is:          'SCI à l\'IS',
  scpi:            'SCPI',
  meuble_tourisme: 'Meublé de tourisme (micro-BIC)',
  indetermine:     'Non renseigné',
}
export function fiscalRegimeLabel(regime: RegimeFiscalImmoExtended | null | undefined): string {
  if (!regime) return LABEL_BY_REGIME.indetermine
  return LABEL_BY_REGIME[regime] ?? LABEL_BY_REGIME.indetermine
}

// ─────────────────────────────────────────────────────────────────
// Helper isRegime (compat optimiseurFiscal)
// ─────────────────────────────────────────────────────────────────

interface BienAvecRegime {
  fiscal_regime?: string | null
}

/**
 * True si le regime du bien correspond a au moins une entree de la liste
 * (case-insensitive + match via normalizeFiscalRegime).
 */
export function isRegime(
  bien:    BienAvecRegime,
  regimes: ReadonlyArray<RegimeFiscalImmoExtended | string>,
): boolean {
  const norm = normalizeFiscalRegime(bien.fiscal_regime)
  if (!norm) return false
  for (const r of regimes) {
    const target = typeof r === 'string' ? normalizeFiscalRegime(r) : r
    if (target === norm) return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────
// Recommandation de regime optimal (Sprint 2 D10)
// ─────────────────────────────────────────────────────────────────

export interface DetecterRegimeInputs {
  /** Type de location : 'meuble' (LMNP/LMP) vs 'nu' (foncier). */
  type_location?: 'meuble' | 'nu' | 'tourisme'
  /** Recettes brutes annuelles attendues (loyers). */
  recettes_annuelles: number
  /** TMI utilisateur (0..45, %). null = inconnu. */
  tmi_pct?: number | null
}

export interface DetecterRegimeResult {
  recommande:        RegimeFiscalImmoExtended
  justification:     string
}

/**
 * Recommande le regime fiscal optimal pour un bien locatif.
 *
 * Heuristiques :
 *   - Recettes = 0 → indetermine (pas de loyer).
 *   - Meuble de tourisme → micro-BIC specifique.
 *   - Meuble :
 *       recettes < plafond micro (77 700 €) → micro-BIC
 *       recettes >= plafond                 → reel obligatoire
 *   - Nu :
 *       recettes >= plafond foncier (15 000 €) → reel obligatoire
 *       TMI > 30 %                              → reel recommande
 *       TMI <= 30 % et recettes < plafond       → micro-foncier
 */
export function detecterRegimeFiscal(input: DetecterRegimeInputs): DetecterRegimeResult {
  const recettes = Math.max(0, input.recettes_annuelles)
  const tmi      = input.tmi_pct ?? null
  const type     = input.type_location ?? 'nu'

  if (recettes === 0) {
    return {
      recommande:    'indetermine',
      justification: 'Aucun loyer declare — pas de recommandation possible.',
    }
  }

  if (type === 'tourisme') {
    return {
      recommande:    'meuble_tourisme',
      justification: 'Meuble de tourisme : micro-BIC dedie (abattement 30 % ou 71 % si classe).',
    }
  }

  if (type === 'meuble') {
    if (recettes >= PLAFOND_MICRO_BIC) {
      return {
        recommande:    'lmnp_reel',
        justification: `Recettes ${recettes.toLocaleString('fr-FR')} € >= ${PLAFOND_MICRO_BIC.toLocaleString('fr-FR')} € : regime reel obligatoire.`,
      }
    }
    return {
      recommande:    'lmnp_micro',
      justification: `Recettes < plafond micro-BIC (${PLAFOND_MICRO_BIC.toLocaleString('fr-FR')} €) : abattement 50 % suffit dans la majorite des cas.`,
    }
  }

  // type === 'nu'
  if (recettes >= PLAFOND_MICRO_FONCIER) {
    return {
      recommande:    'foncier_nu',
      justification: `Recettes ${recettes.toLocaleString('fr-FR')} € >= ${PLAFOND_MICRO_FONCIER.toLocaleString('fr-FR')} € : regime reel obligatoire.`,
    }
  }
  if (tmi !== null && tmi > TMI_SEUIL_REEL_PCT) {
    return {
      recommande:    'foncier_nu',
      justification: `TMI ${tmi} % > ${TMI_SEUIL_REEL_PCT} % : le reel permet d'imputer charges + interets + amortissement.`,
    }
  }
  return {
    recommande:    'foncier_micro',
    justification: 'Recettes faibles + TMI moderee : abattement forfaitaire 30 % suffit.',
  }
}
