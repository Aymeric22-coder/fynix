/**
 * Hook client pour le dashboard d'analyse patrimoniale.
 *
 *   const { data, isLoading, error, refresh } = usePatrimoineAnalyse()
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
 * Historique : le cache était à 5 min, ce qui causait des bugs perçus
 * comme "l'app n'a pas pris le déploiement". Réduit à 30 s + invalidation
 * automatique au premier mount.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Ref pour distinguer le 1er montage (force=true) des suivants
  const firstMountRef = useRef(true)

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

  useEffect(() => {
    // Au 1er mount du hook dans la session, on force le fetch pour ne
    // jamais servir de la donnée potentiellement issue d'une ancienne
    // version de l'app (cas typique : nouveau déploiement).
    load(firstMountRef.current)
    firstMountRef.current = false
  }, [load])

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
