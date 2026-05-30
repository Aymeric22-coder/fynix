/**
 * GET /api/profile/life-events — CS5.
 *
 * Récupère la liste d'évènements de vie de l'utilisateur, triés par date
 * croissante. RLS filtre déjà par user_id côté DB.
 *
 * Réponse :
 *   { data: { events: LifeEventDraft[] }, error: null }
 */
import { createServerClient } from '@/lib/supabase/server'
import { err, ok, withAuth } from '@/lib/utils/api'

export const GET = withAuth(async (_req, user) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('life_events')
    .select('id, type, is_active, occurrence_date, montant, label, meta')
    .eq('user_id', user.id)
    .order('occurrence_date', { ascending: true })
  if (error) return err(`Lecture évènements échouée : ${error.message}`, 500)
  return ok({ events: data ?? [] })
})
