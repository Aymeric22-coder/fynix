/**
 * Hook client : acquisitions futures simulees, persistees en DB.
 *
 *   const { acquisitions, loading, saving, add, update, remove } = useFutureAcquisitions()
 *
 * - Fetch initial via `/api/future-acquisitions` (route REST + RLS).
 * - Abonnement realtime Supabase sur la table `future_acquisitions`
 *   filtre par user_id : tout INSERT / UPDATE / DELETE re-synchronise
 *   l'etat local (utile si l'utilisateur a deux onglets ouverts).
 * - Mutations optimistes : on met a jour le state immediatement, puis
 *   on attend la confirmation serveur. En cas d'erreur, on rollback.
 * - `saving` : true tant qu'au moins une mutation est en vol —
 *   permet d'afficher "Sauvegarde…" / "Sauvegarde" dans l'UI.
 *
 * Le type DB est aligne sur le type metier `AcquisitionFuture`
 * (cf. migration 017) — pas de mapping de noms de colonnes.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AcquisitionFuture } from '@/types/analyse'
import type { FutureAcquisitionRow } from '@/types/database.types'

function rowToAcquisition(r: FutureAcquisitionRow): AcquisitionFuture {
  return {
    id:                        r.id,
    nom:                       r.nom,
    dans_combien_annees:       Number(r.dans_combien_annees),
    prix_achat:                Number(r.prix_achat),
    frais_notaire_pct:         Number(r.frais_notaire_pct),
    apport:                    Number(r.apport),
    taux_interet:              Number(r.taux_interet),
    duree_credit_ans:          Number(r.duree_credit_ans),
    type:                      r.type,
    loyer_brut_mensuel:        Number(r.loyer_brut_mensuel),
    taux_vacance_pct:          Number(r.taux_vacance_pct),
    charges_mensuelles:        Number(r.charges_mensuelles),
    appreciation_annuelle_pct: Number(r.appreciation_annuelle_pct),
  }
}

export interface UseFutureAcquisitionsResult {
  acquisitions: AcquisitionFuture[]
  loading:      boolean
  /** true tant qu'au moins une mutation (add/update/remove) est en vol. */
  saving:       boolean
  error:        string | null
  add:    (acq: Omit<AcquisitionFuture, 'id'>) => Promise<void>
  update: (acq: AcquisitionFuture)             => Promise<void>
  remove: (id: string)                          => Promise<void>
}

export function useFutureAcquisitions(): UseFutureAcquisitionsResult {
  const [acquisitions, setAcquisitions] = useState<AcquisitionFuture[]>([])
  const [loading,      setLoading]      = useState(true)
  const [pending,      setPending]      = useState(0)
  const [error,        setError]        = useState<string | null>(null)

  // Cle pour debouncer le refetch realtime (sinon une rafale d'events
  // declenche plusieurs fetch consecutifs)
  const refetchTimerRef = useRef<number | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch('/api/future-acquisitions', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const items = (json.data?.items ?? []) as FutureAcquisitionRow[]
      setAcquisitions(items.map(rowToAcquisition))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) window.clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null
      void fetchAll()
    }, 150)
  }, [fetchAll])

  useEffect(() => {
    void fetchAll()

    // Subscribe realtime sur la table — un seul channel pour tous les events.
    // Le filtre RLS cote DB garantit qu'on ne recoit que nos propres lignes.
    const supabase = createClient()
    const channel = supabase
      .channel('future_acquisitions_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'future_acquisitions' },
        () => scheduleRefetch(),
      )
      .subscribe()

    return () => {
      if (refetchTimerRef.current !== null) window.clearTimeout(refetchTimerRef.current)
      void supabase.removeChannel(channel)
    }
  }, [fetchAll, scheduleRefetch])

  const add = useCallback(async (acq: Omit<AcquisitionFuture, 'id'>) => {
    setPending((p) => p + 1)
    try {
      const res = await fetch('/api/future-acquisitions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(acq),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const row = json.data?.acquisition as FutureAcquisitionRow
      if (row) {
        setAcquisitions((prev) => [...prev, rowToAcquisition(row)])
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setPending((p) => Math.max(0, p - 1))
    }
  }, [])

  const update = useCallback(async (acq: AcquisitionFuture) => {
    // Mise a jour optimiste
    const previous = acquisitions
    setAcquisitions((prev) => prev.map((a) => a.id === acq.id ? acq : a))
    setPending((p) => p + 1)
    try {
      const { id, ...payload } = acq
      const res = await fetch(`/api/future-acquisitions/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const row = json.data?.acquisition as FutureAcquisitionRow
      if (row) {
        setAcquisitions((prev) => prev.map((a) => a.id === row.id ? rowToAcquisition(row) : a))
      }
      setError(null)
    } catch (e) {
      setAcquisitions(previous)   // rollback
      setError((e as Error).message)
      throw e
    } finally {
      setPending((p) => Math.max(0, p - 1))
    }
  }, [acquisitions])

  const remove = useCallback(async (id: string) => {
    const previous = acquisitions
    setAcquisitions((prev) => prev.filter((a) => a.id !== id))
    setPending((p) => p + 1)
    try {
      const res = await fetch(`/api/future-acquisitions/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setError(null)
    } catch (e) {
      setAcquisitions(previous)
      setError((e as Error).message)
      throw e
    } finally {
      setPending((p) => Math.max(0, p - 1))
    }
  }, [acquisitions])

  return {
    acquisitions,
    loading,
    saving: pending > 0,
    error,
    add, update, remove,
  }
}
