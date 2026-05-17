/**
 * Hook client pour le dashboard d'analyse patrimoniale.
 *
 *   const { data, isLoading, error, refresh, refreshing, lastUpdatedAt } = usePatrimoineAnalyse()
 *
 * - Charge GET /api/analyse/patrimoine au montage.
 * - Cache mémoire client : 30 secondes seulement. Évite un re-fetch
 *   immédiat si l'utilisateur navigue entre /analyse et /portefeuille,
 *   sans servir de la donnée stale plus longtemps. La vraie couche de
 *   cache (24 h) est côté serveur sur `isin_cache`.
 * - Le 1er montage de /analyse (jamais visité dans la session)
 *   contourne le cache : `force=true`. Garantit que tout nouveau déploiement
 *   est immédiatement visible.
 * - `refresh()` : invalide le cache ISIN serveur + memCache + recharge.
 *
 * Realtime (depuis migration 017) : s'abonne aux tables sources qui
 * alimentent la projection FIRE (positions, real_estate_properties,
 * cash_accounts, debts). Tout changement re-déclenche un fetch léger
 * (sans toucher au cache ISIN serveur) → la projection reste à jour
 * en direct sans devoir cliquer sur "Actualiser".
 *
 * Historique : le cache était à 5 min, ce qui causait des bugs perçus
 * comme "l'app n'a pas pris le déploiement". Réduit à 30 s + invalidation
 * automatique au premier mount.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PatrimoineComplet } from '@/types/analyse'

const CLIENT_CACHE_MS = 30 * 1000

let memCache: { data: PatrimoineComplet; expiresAt: number } | null = null

interface UsePatrimoineResult {
  data:      PatrimoineComplet | null
  isLoading: boolean
  error:     string | null
  /** Force un refetch + invalide le cache ISIN serveur. */
  refresh:   () => Promise<void>
  /** Indique si refresh() est en cours (UI : bouton désactivé). */
  refreshing: boolean
  /** Horodatage du dernier fetch reussi (epoch ms) — null si jamais. */
  lastUpdatedAt: number | null
}

async function fetchPatrimoine(): Promise<PatrimoineComplet> {
  const res  = await fetch('/api/analyse/patrimoine', { cache: 'no-store' })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data as PatrimoineComplet
}

// Tables sources de la projection FIRE — abonnement realtime
const REALTIME_TABLES = ['positions', 'real_estate_properties', 'cash_accounts', 'debts'] as const

export function usePatrimoineAnalyse(): UsePatrimoineResult {
  const [data,          setData]          = useState<PatrimoineComplet | null>(memCache?.data ?? null)
  const [isLoading,     setIsLoading]     = useState(!memCache)
  const [error,         setError]         = useState<string | null>(null)
  const [refreshing,    setRefreshing]    = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(memCache ? Date.now() : null)

  // Ref pour distinguer le 1er montage (force=true) des suivants
  const firstMountRef = useRef(true)
  // Debounce realtime : agrege une rafale d'events en un seul fetch
  const refetchTimerRef = useRef<number | null>(null)

  const load = useCallback(async (force: boolean) => {
    if (!force && memCache && memCache.expiresAt > Date.now()) {
      setData(memCache.data)
      setIsLoading(false)
      setLastUpdatedAt(Date.now())
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const fresh = await fetchPatrimoine()
      memCache = { data: fresh, expiresAt: Date.now() + CLIENT_CACHE_MS }
      setData(fresh)
      setLastUpdatedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refetch sans loader visible (utilise par les subscriptions realtime).
  // Vide le memCache pour eviter de re-servir la version stale.
  const silentRefetch = useCallback(async () => {
    try {
      memCache = null
      const fresh = await fetchPatrimoine()
      memCache = { data: fresh, expiresAt: Date.now() + CLIENT_CACHE_MS }
      setData(fresh)
      setLastUpdatedAt(Date.now())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const scheduleRealtimeRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) window.clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null
      void silentRefetch()
    }, 250)
  }, [silentRefetch])

  useEffect(() => {
    // Au 1er mount du hook dans la session, on force le fetch pour ne
    // jamais servir de la donnée potentiellement issue d'une ancienne
    // version de l'app (cas typique : nouveau déploiement).
    load(firstMountRef.current)
    firstMountRef.current = false
  }, [load])

  // Abonnement realtime aux tables sources (positions, immo, cash, dettes)
  useEffect(() => {
    const supabase = createClient()
    const channels = REALTIME_TABLES.map((table) =>
      supabase
        .channel(`${table}_patrimoine_sync`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => scheduleRealtimeRefetch(),
        )
        .subscribe(),
    )
    return () => {
      if (refetchTimerRef.current !== null) window.clearTimeout(refetchTimerRef.current)
      channels.forEach((c) => { void supabase.removeChannel(c) })
    }
  }, [scheduleRealtimeRefetch])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      // 1. Invalide le cache ISIN serveur
      await fetch('/api/analyse/refresh', { method: 'POST' })
      // 2. Vide le cache client
      memCache = null
      // 3. Recharge
      const fresh = await fetchPatrimoine()
      memCache = { data: fresh, expiresAt: Date.now() + CLIENT_CACHE_MS }
      setData(fresh)
      setLastUpdatedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  return { data, isLoading, error, refresh, refreshing, lastUpdatedAt }
}
