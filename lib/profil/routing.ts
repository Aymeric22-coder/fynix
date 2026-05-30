/**
 * CS3 — Moteur de routage du wizard profil.
 *
 * Décide à chaque transition quelle est la prochaine étape selon les
 * réponses déjà saisies. Pas une cascade de `if/else` dans
 * ProfilQuestionnaire.tsx : une abstraction pure, testable, extensible.
 *
 * Principes :
 *  - `SKIP_RULES` est l'UNIQUE point d'extension : Phase 5/6 ajouteront
 *    leurs règles ici sans toucher au moteur.
 *  - Prédicats `shouldSkip` PURS sur `QuestionnaireValues` — 1 test = 1 règle.
 *  - Re-évalué à chaque transition : si l'utilisateur revient en arrière et
 *    modifie une réponse, le parcours actif est recalculé au prochain call.
 *  - Garde-fou anti-faux-positif sur R1/R2 : on exige que `enveloppes` soit
 *    NON-VIDE pour activer le skip (= preuve explicite de non-exposition).
 *    Si l'utilisateur a SAUTÉ l'étape 4 (enveloppes=[]), aucun skip auto :
 *    on garde les quiz crypto/immo accessibles.
 *
 * Périmètre CS3 (MVP) :
 *  - R1. Skip Quiz Crypto (Step 6) si aucune enveloppe crypto.
 *  - R2. Skip Quiz Immo (Step 7) si aucune enveloppe immobilier/SCPI.
 *  - R3 (réinterprété) : retraité = renforcement de la copie R1/R2,
 *    pas un skip indépendant. Géré par `findSkipReason`.
 *  - R4 (coast/barista → revenu_passif_cible optionnel) : sortie du moteur,
 *    patchée dans wizardValidation.missingFields.
 *  - R5 (bouton "Je connais déjà" sur Step 5/6/7) : sortie du moteur, géré
 *    intra-step via quiz_self_declared_domains.
 */

import type { QuestionnaireValues } from '@/components/profil/questionnaire-types'

/** IDs des étapes du wizard. Aligne sur STEPS dans lib/profil/calculs.ts. */
export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export const ALL_STEPS: readonly StepId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

// ────────────────────────────────────────────────────────────────────
// Helpers de prédicats purs (testables individuellement)
// ────────────────────────────────────────────────────────────────────

/**
 * True si l'utilisateur a déclaré au moins une enveloppe crypto à l'étape 4.
 * Pattern de recherche insensible à la casse.
 */
export function hasCryptoEnvelope(v: QuestionnaireValues): boolean {
  return (v.enveloppes ?? []).some((e) => /crypto/i.test(e))
}

/**
 * True si l'utilisateur a déclaré au moins une enveloppe immo/SCPI à l'étape 4.
 */
export function hasImmoEnvelope(v: QuestionnaireValues): boolean {
  return (v.enveloppes ?? []).some((e) => /immo|scpi/i.test(e))
}

/**
 * True si l'étape 4 a été TOUCHÉE (au moins une enveloppe cochée).
 * Garde-fou contre les faux positifs R1/R2 : si l'utilisateur a sauté
 * l'étape 4, on ne déclenche AUCUN skip auto (enveloppes=[] ne prouve rien).
 */
function hasTouchedEnvelopes(v: QuestionnaireValues): boolean {
  return (v.enveloppes ?? []).length > 0
}

/**
 * True si l'utilisateur a déclaré statut_pro = Retraité à l'étape 1.
 * Utilisé pour reformuler la copie skip (R3 réinterprété).
 */
export function isRetraite(v: QuestionnaireValues): boolean {
  return typeof v.statut_pro === 'string' && /retrait/i.test(v.statut_pro)
}

// ────────────────────────────────────────────────────────────────────
// Règles de skip
// ────────────────────────────────────────────────────────────────────

export interface SkipRule {
  /** Étape ciblée par la règle. */
  step:       StepId
  /** Prédicat pur : True si l'étape doit être sautée. */
  shouldSkip: (v: QuestionnaireValues) => boolean
  /** Copie utilisateur affichée dans le message inline « skip transparent ». */
  reason:     (v: QuestionnaireValues) => string
}

/**
 * MVP CS3 — 2 règles à haute valeur.
 *
 * Phase 5/6 viendront pousser leurs propres règles dans ce tableau.
 */
export const SKIP_RULES: readonly SkipRule[] = [
  // R1 — Quiz Crypto
  {
    step: 6,
    shouldSkip: (v) => hasTouchedEnvelopes(v) && !hasCryptoEnvelope(v),
    reason: (v) =>
      isRetraite(v)
        ? "Tu es retraité et n'as pas déclaré d'enveloppe crypto à l'étape 4."
        : "Tu n'as pas déclaré d'enveloppe crypto à l'étape 4.",
  },
  // R2 — Quiz Immo
  {
    step: 7,
    shouldSkip: (v) => hasTouchedEnvelopes(v) && !hasImmoEnvelope(v),
    reason: (v) =>
      isRetraite(v)
        ? "Tu es retraité et n'as pas déclaré d'immobilier (chip Immobilier / SCPI) à l'étape 4."
        : "Tu n'as pas déclaré d'immobilier (chip Immobilier / SCPI) à l'étape 4.",
  },
]

// ────────────────────────────────────────────────────────────────────
// API publique du moteur
// ────────────────────────────────────────────────────────────────────

/**
 * Sentinelle retournée par `getNextStep` / `getPrevStep` quand on est en
 * bout de chaîne.
 */
export const END = 'END' as const
export type StepCursor = StepId | typeof END

/**
 * Calcule la séquence d'étapes ACTIVE pour cet utilisateur, en évaluant
 * toutes les SKIP_RULES sur le state courant.
 *
 * Les `overrides` sont des étapes que l'utilisateur a explicitement choisi
 * de visiter via le bouton « Je veux quand même y répondre » du skip
 * transparent. Elles sont session-locales (non persistées) et neutralisent
 * la règle de skip pour cette session.
 */
export function computeActivePath(
  v:         QuestionnaireValues,
  overrides: ReadonlySet<StepId> = new Set(),
): readonly StepId[] {
  return ALL_STEPS.filter((s) => {
    if (overrides.has(s)) return true
    return !SKIP_RULES.some((r) => r.step === s && r.shouldSkip(v))
  })
}

/**
 * Étape suivante dans le parcours actif. Retourne END si on est sur la
 * dernière étape du parcours.
 */
export function getNextStep(
  current:   StepId,
  v:         QuestionnaireValues,
  overrides: ReadonlySet<StepId> = new Set(),
): StepCursor {
  const path = computeActivePath(v, overrides)
  const idx  = path.indexOf(current)
  if (idx < 0) {
    // Étape courante absente du parcours actif (ex : règle activée
    // dynamiquement par un changement de réponse). On retombe sur la
    // première étape du path qui suit l'étape courante en ID absolu.
    const next = path.find((s) => s > current)
    return next ?? END
  }
  if (idx === path.length - 1) return END
  return path[idx + 1]!
}

/**
 * Étape précédente dans le parcours actif. Retourne null si on est sur la
 * première étape.
 *
 * ⚠️ POINT CRITIQUE (cf. cadrage §7 point 2) : ProfilQuestionnaire DOIT
 * utiliser cette fonction et NON `setStep(s => s - 1)`. Sinon l'utilisateur
 * revient sur une étape sautée → confusion.
 */
export function getPrevStep(
  current:   StepId,
  v:         QuestionnaireValues,
  overrides: ReadonlySet<StepId> = new Set(),
): StepId | null {
  const path = computeActivePath(v, overrides)
  const idx  = path.indexOf(current)
  if (idx < 0) {
    // Étape absente du path : prendre la dernière qui précède en ID absolu.
    const prev = [...path].reverse().find((s) => s < current)
    return prev ?? null
  }
  if (idx === 0) return null
  return path[idx - 1]!
}

/**
 * Retourne la raison de skip pour une étape donnée si elle EST sautée,
 * sinon null. Utilisé par le message inline en bas de l'étape précédente.
 */
export function findSkipReason(
  step:      StepId,
  v:         QuestionnaireValues,
  overrides: ReadonlySet<StepId> = new Set(),
): string | null {
  if (overrides.has(step)) return null
  const rule = SKIP_RULES.find((r) => r.step === step && r.shouldSkip(v))
  return rule ? rule.reason(v) : null
}

/**
 * Vérifie si une étape donnée serait skippée par le moteur (au cas où
 * un consommateur a besoin du verdict sans avoir le path complet).
 */
export function isStepSkipped(
  step:      StepId,
  v:         QuestionnaireValues,
  overrides: ReadonlySet<StepId> = new Set(),
): boolean {
  if (overrides.has(step)) return false
  return SKIP_RULES.some((r) => r.step === step && r.shouldSkip(v))
}
