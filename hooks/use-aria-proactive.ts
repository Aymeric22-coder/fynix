/**
 * Hook React pour la detection proactive de nudges ARIA.
 *
 *   const {
 *     activeNudge, acceptNudge, dismissNudge, fireEvent, registerInteraction,
 *   } = useAriaProactive({ section: 'fire' })
 *
 * Comportement :
 *   - Maintient un compteur d'idle seconds + un compteur d'interactions
 *     sur la section active.
 *   - Sur changement de section, le compteur d'idle redemarre a 0.
 *   - `registerInteraction()` doit etre appele a chaque move/click/scroll
 *     pertinent par le composant qui consomme ce hook (idealement attache
 *     a `document`).
 *   - `fireEvent(type)` declenche un nudge event-based si une regle match.
 *   - `dismissNudge()` mute les nudges pendant 24h (stocke en localStorage).
 *   - `acceptNudge()` ferme le nudge actif sans muter (laisse Phase 6 UI
 *     declencher sendMessage avec le suggested_prompt).
 *
 * Phase 6 utilisera ce hook avec un composant `AriaProactiveNudge`.
 */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ARIA_PROACTIVE_RULES,
  type ProactiveEventType,
  type ProactiveState,
} from '@/lib/aria/proactive/rules'
import {
  DEFAULT_MUTE_DURATION_MS,
  selectNudge,
  type ActiveNudge,
} from '@/lib/aria/proactive/detector'

const MUTE_STORAGE_KEY = 'aria.proactive.muted_until_ms'
const TICK_MS = 5_000                                // re-evalue toutes les 5s

export interface UseAriaProactiveOptions {
  section?: string | null
  /** Override la liste de regles (utile pour tests). */
  rules?:   typeof ARIA_PROACTIVE_RULES
  /** Override duree mute (defaut 24h). */
  muteDurationMs?: number
}

export interface UseAriaProactiveResult {
  activeNudge:         ActiveNudge | null
  /** Marque le nudge comme accepte (ferme la bulle, ne mute pas). */
  acceptNudge:         () => void
  /** Mute les nudges 24h (stocke en localStorage). */
  dismissNudge:        () => void
  /** A appeler sur chaque interaction utilisateur pertinente. */
  registerInteraction: () => void
  /** Declenche un nudge event-based. */
  fireEvent:           (type: ProactiveEventType) => void
}

function readMutedUntil(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(MUTE_STORAGE_KEY)
  if (!raw) return null
  const n = Number(raw)
  return isFinite(n) && n > 0 ? n : null
}

export function useAriaProactive(options: UseAriaProactiveOptions = {}): UseAriaProactiveResult {
  const rules = options.rules ?? ARIA_PROACTIVE_RULES
  const muteMs = options.muteDurationMs ?? DEFAULT_MUTE_DURATION_MS
  const section = options.section ?? null

  const [activeNudge, setActiveNudge] = useState<ActiveNudge | null>(null)
  const [tick, setTick] = useState(0)                            // force re-eval periodique

  // Refs pour stocker l'etat mutable sans re-render.
  const sectionEnteredAtRef = useRef<number>(Date.now())
  const lastInteractionAtRef = useRef<number>(Date.now())
  const interactionsCountRef = useRef<number>(0)
  const lastEventRef = useRef<{ type: ProactiveEventType; at: number } | null>(null)
  const mutedUntilRef = useRef<number | null>(readMutedUntil())
  const acceptedNudgeIdsRef = useRef<Set<string>>(new Set())

  // Reset au changement de section
  useEffect(() => {
    sectionEnteredAtRef.current = Date.now()
    lastInteractionAtRef.current = Date.now()
    interactionsCountRef.current = 0
    setActiveNudge(null)
  }, [section])

  // Tick toutes les 5s pour reevaluer
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  // Reevalue a chaque tick ou changement d'inputs
  useEffect(() => {
    const now = Date.now()
    const idleSeconds = Math.floor((now - lastInteractionAtRef.current) / 1000)
    const state: ProactiveState = {
      section,
      idleSeconds,
      interactionsCount: interactionsCountRef.current,
      lastEvent:         lastEventRef.current,
      mutedUntilMs:      mutedUntilRef.current,
    }

    const candidate = selectNudge(state, rules, now)
    if (!candidate) {
      setActiveNudge(null)
      return
    }
    // Si l'utilisateur a deja accepte ce nudge dans cette session, on le n'affiche pas a nouveau
    if (acceptedNudgeIdsRef.current.has(candidate.rule_id)) {
      setActiveNudge(null)
      return
    }
    setActiveNudge((prev) => (prev?.rule_id === candidate.rule_id ? prev : candidate))
  }, [tick, section, rules])

  const acceptNudge = useCallback(() => {
    setActiveNudge((cur) => {
      if (cur) acceptedNudgeIdsRef.current.add(cur.rule_id)
      return null
    })
  }, [])

  const dismissNudge = useCallback(() => {
    const until = Date.now() + muteMs
    mutedUntilRef.current = until
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(MUTE_STORAGE_KEY, String(until)) } catch { /* ignore */ }
    }
    setActiveNudge(null)
  }, [muteMs])

  const registerInteraction = useCallback(() => {
    lastInteractionAtRef.current = Date.now()
    interactionsCountRef.current += 1
  }, [])

  const fireEvent = useCallback((type: ProactiveEventType) => {
    lastEventRef.current = { type, at: Date.now() }
    setTick((t) => t + 1)               // force une reevaluation immediate
  }, [])

  // Memoize result identity pour eviter re-renders en chaine
  return useMemo(
    () => ({ activeNudge, acceptNudge, dismissNudge, registerInteraction, fireEvent }),
    [activeNudge, acceptNudge, dismissNudge, registerInteraction, fireEvent],
  )
}
