/**
 * Hook client pour charger et sauvegarder le profil investisseur.
 *
 * Le profil de base existe toujours en DB (créé par le trigger
 * on_auth_user_created — migration 003). Le hook ne crée jamais de row :
 * il charge l'existant et émet un PUT pour ajouter les colonnes du
 * questionnaire.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '@/types/database.types'
import type { QuestionnaireValues } from '@/components/profil/questionnaire-types'

interface UseUserProfileResult {
  profile:  Profile | null
  loading:  boolean
  error:    string | null
  /** Sauvegarde les réponses du questionnaire et met à jour le state local. */
  save:     (values: QuestionnaireValues) => Promise<{ error?: string }>
  /** Recharge le profil depuis le serveur. */
  reload:   () => Promise<void>
}

export function useUserProfile(): UseUserProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/profile', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) setError(json.error)
      else            setProfile(json.data as Profile)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const save = useCallback(async (values: QuestionnaireValues): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/profile', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      setProfile(json.data as Profile)
      return {}
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [])

  return { profile, loading, error, save, reload }
}
