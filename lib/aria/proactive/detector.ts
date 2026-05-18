/**
 * Detection des nudges proactifs ARIA. Logique pure : prend un
 * `ProactiveState` + la liste des regles, retourne le 1er nudge
 * applicable (ou null).
 *
 * Pas d'I/O, pas d'effet de bord. Le hook React (cf.
 * `hooks/use-aria-proactive.ts`) gere le state, le timer et l'envoi
 * d'evenements ; ce module n'a que la regle de selection.
 */

import type { ProactiveRule, ProactiveState } from './rules'

export interface ActiveNudge {
  rule_id:          string
  message:          string
  suggested_prompt: string
}

/**
 * Indique si l'utilisateur a mute les nudges (cf. dismissNudge dans le hook).
 */
function isMuted(state: ProactiveState, nowMs: number): boolean {
  return state.mutedUntilMs !== null
      && state.mutedUntilMs !== undefined
      && state.mutedUntilMs > nowMs
}

/**
 * Pour event-based : un event est considere "frais" pendant 30 secondes.
 * Au-dela, on n'affiche plus le nudge meme s'il n'a pas ete vu (sinon
 * il pop-up plus tard pour rien).
 */
const EVENT_FRESHNESS_MS = 30_000

function ruleMatches(rule: ProactiveRule, state: ProactiveState, nowMs: number): boolean {
  // Filtre section
  if (rule.section !== null && rule.section !== undefined) {
    if (state.section !== rule.section) return false
  }

  if (rule.trigger === 'idle') {
    const requiredIdle = rule.idleSeconds ?? 60
    const maxInter     = rule.maxInteractions ?? 0
    if (state.idleSeconds < requiredIdle) return false
    if (state.interactionsCount > maxInter) return false
    return true
  }

  if (rule.trigger === 'event') {
    const evt = state.lastEvent
    if (!evt) return false
    if (rule.eventType && evt.type !== rule.eventType) return false
    if (nowMs - evt.at > EVENT_FRESHNESS_MS) return false
    return true
  }

  return false
}

/**
 * Selectionne le premier nudge applicable parmi `rules`. Retourne null
 * si aucun ne match ou si l'utilisateur a mute.
 *
 * Ordre = ordre du tableau de regles (priorite implicite). Si on veut
 * un autre ordre, trier `rules` avant l'appel.
 */
export function selectNudge(
  state: ProactiveState,
  rules: ReadonlyArray<ProactiveRule>,
  nowMs: number = Date.now(),
): ActiveNudge | null {
  if (isMuted(state, nowMs)) return null

  for (const rule of rules) {
    if (ruleMatches(rule, state, nowMs)) {
      return {
        rule_id:          rule.id,
        message:          rule.message,
        suggested_prompt: rule.suggested_prompt,
      }
    }
  }
  return null
}

/**
 * Helper : duree par defaut de mute apres dismiss (24h).
 * Exporte pour pouvoir l'override dans les tests.
 */
export const DEFAULT_MUTE_DURATION_MS = 24 * 3600 * 1000
