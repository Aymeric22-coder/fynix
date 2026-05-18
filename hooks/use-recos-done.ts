/**
 * Hook de persistance des recommandations marquées « Fait ».
 *
 * Charge GET /api/recos/done au montage, expose un Set<string> des clés
 * actives + une fonction `toggle(recoKey, done)` avec optimistic update
 * et rollback en cas d'erreur réseau.
 *
 * Utilisé par components/analyse/Recommandations.tsx pour faire passer
 * les recos de « à faire » à « complétées » de manière persistante.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { devWarn } from '@/lib/utils/devLog'

interface DoneResponse {
  data:  { recoKeys: string[] } | null
  error: string | null
}

interface ToggleResponse {
  data:  { ok: true } | null
  error: string | null
}

export interface UseRecosDoneResult {
  /** Clés des recos actuellement marquées « Fait ». */
  doneKeys: ReadonlySet<string>
  /** Toggle optimistic : MAJ locale immédiate, rollback si fetch échoue. */
  toggle:   (key: string, done: boolean) => Promise<void>
  /** True pendant le chargement initial. */
  loading:  boolean
  /** Erreur réseau lors du chargement initial (null si OK). */
  error:    string | null
}

export function useRecosDone(): UseRecosDoneResult {
  const [doneKeys, setDoneKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  // Miroir synchrone du state pour snapshotter avant un toggle optimistic.
  // L'updater de useState peut être appelé plusieurs fois en dev (StrictMode),
  // donc on ne peut pas capturer `previous` via la closure du setter.
  const doneKeysRef = useRef<ReadonlySet<string>>(doneKeys)
  useEffect(() => { doneKeysRef.current = doneKeys }, [doneKeys])

  useEffect(() => {
    let cancelled = false
    fetch('/api/recos/done', { cache: 'no-store' })
      .then((r) => r.json() as Promise<DoneResponse>)
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setError(res.error)
          setLoading(false)
          return
        }
        setDoneKeys(new Set(res.data?.recoKeys ?? []))
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const toggle = useCallback(async (key: string, done: boolean) => {
    // Snapshot du state actuel via ref (fiable même si l'updater de setDoneKeys
    // est invoqué plusieurs fois par React en dev/strict mode).
    const previous = doneKeysRef.current

    const optimistic = new Set(previous)
    if (done) optimistic.add(key)
    else      optimistic.delete(key)
    setDoneKeys(optimistic)

    try {
      const res = await fetch('/api/recos/done', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recoKey: key, done }),
      })
      const body = (await res.json().catch(() => ({}))) as ToggleResponse
      if (!res.ok || body.error) {
        // Rollback
        setDoneKeys(previous)
        devWarn(`[useRecosDone] toggle ${key} échec : ${body.error ?? `HTTP ${res.status}`}`)
      }
    } catch (e: unknown) {
      // Rollback
      setDoneKeys(previous)
      devWarn(`[useRecosDone] toggle ${key} erreur réseau : ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  return { doneKeys, toggle, loading, error }
}
