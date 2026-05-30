/**
 * POST /api/profile/life-events/sync — CS5.
 *
 * Wholesale replace : remplace toute la liste d'évènements de vie de
 * l'utilisateur par celle fournie dans le body. Pattern le plus simple
 * pour un MVP, cohérent avec les enveloppes (TEXT[] entièrement remplacé
 * via PUT /api/profile).
 *
 * Body shape :
 *   { events: LifeEventDraft[] }
 *
 * où LifeEventDraft = { id?, type, is_active, occurrence_date, montant, label, meta }.
 *
 * Transactionnel best-effort : DELETE * + INSERT bulk. Si l'INSERT échoue,
 * l'utilisateur peut perdre ses anciens events — c'est un trade-off accepté
 * pour rester simple. Le wizard reprend l'utilisateur à Step10 au reload
 * en cas de crash.
 *
 * RLS : la table life_events filtre par user_id = auth.uid(). On force
 * `eq('user_id', user.id)` en ceinture-bretelles.
 */
import { createServerClient } from '@/lib/supabase/server'
import { err, ok, withAuth } from '@/lib/utils/api'
import { LIFE_EVENT_TYPES } from '@/lib/profil/lifeEventsConstants'

interface DraftBody {
  events: Array<{
    id?:             string
    type:            string
    is_active?:      boolean
    occurrence_date: string
    montant?:        number | null
    label?:          string | null
    meta?:           Record<string, unknown>
  }>
}

const VALID_TYPES = new Set<string>(LIFE_EVENT_TYPES)

export const POST = withAuth(async (req, user) => {
  let body: DraftBody
  try {
    body = await req.json()
  } catch {
    return err('Corps JSON invalide', 400)
  }
  if (!Array.isArray(body.events)) return err('Champ `events` manquant ou invalide', 400)

  // Validation minimale
  const sanitized: Array<{
    user_id:         string
    type:            string
    is_active:       boolean
    occurrence_date: string
    montant:         number | null
    label:           string | null
    meta:            Record<string, unknown>
  }> = []
  for (const e of body.events) {
    if (!VALID_TYPES.has(e.type)) return err(`Type d'évènement invalide : ${e.type}`, 400)
    if (typeof e.occurrence_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.occurrence_date)) {
      return err(`Date invalide : ${e.occurrence_date}`, 400)
    }
    sanitized.push({
      user_id:         user.id,
      type:            e.type,
      is_active:       e.is_active ?? true,
      occurrence_date: e.occurrence_date,
      montant:         e.montant ?? null,
      label:           e.label ?? null,
      meta:            e.meta ?? {},
    })
  }

  const supabase = await createServerClient()

  // 1. DELETE * existing (RLS scopes to current user, on rajoute eq par sécurité)
  const { error: delErr } = await supabase
    .from('life_events')
    .delete()
    .eq('user_id', user.id)
  if (delErr) return err(`Suppression échouée : ${delErr.message}`, 500)

  // 2. INSERT bulk (skip si vide)
  if (sanitized.length > 0) {
    const { error: insErr } = await supabase
      .from('life_events')
      .insert(sanitized)
    if (insErr) return err(`Insertion échouée : ${insErr.message}`, 500)
  }

  return ok({ ok: true, count: sanitized.length })
})
