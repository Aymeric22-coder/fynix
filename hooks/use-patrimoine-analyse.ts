/**
 * Hook client pour le dashboard d'analyse patrimoniale.
 *
 *   const { data, isLoading, error, refresh } = usePatrimoineAnalyse()
 *
 * - Charge GET /api/analyse/patrimoine au montage.
 * - Met le résultat en cache mémoire 5 min côté client (évite un re-fetch
 *   si l'utilisateur navigue entre /analyse et /portefeuille puis revient).
 * - `refresh()` : invalide le cache ISIN serveur (POST /api/analyse/refresh)
 *   PUIS recharge le patrimoine. C'est l'action "Actualiser les prix".
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PatrimoineComplet } from '@/types/analyse'

const CLIENT_CACHE_MS = 5 * 60 * 1000

let memCache: { data: PatrimoineComplet; expiresAt: number } | null = null

interface UsePatrimoineResult {
  data:      PatrimoineComplet | null
  isLoading: boolean
  error:     string | null
  /** Force un refetch + invalide le cache ISIN serveur. */
  refresh:   () => Promise<void>
  /** Indique si refresh() est en cours (UI : bouton désactivé). */
  refreshing: boolean
}

async function fetchPatrimoine(): Promise<PatrimoineComplet> {
  const res  = await fetch('/api/analyse/patrimoine', { cache: 'no-store' })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data as PatrimoineComplet
}

export function usePatrimoineAnalyse(): UsePatrimoineResult {
  const [data,       setData]       = useState<PatrimoineComplet | null>(memCache?.data ?? null)
  const [isLoading,  setIsLoading]  = useState(!memCache)
  const [error,      setError]      = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (force: boolean) => {
    if (!force && memCache && memCache.expiresAt > Date.now()) {
      setData(memCache.data)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const fresh = await fetchPatrimoine()
      memCache = { data: fresh, expiresAt: Date.now() + CLIENT_CACHE_MS }
      setData(fresh)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { load(false) }, [load])

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
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }, [])

  return { data, isLoading, error, refresh, refreshing }
}
