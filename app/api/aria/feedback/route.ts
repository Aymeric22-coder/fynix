/**
 * POST /api/aria/feedback — enregistre une note +1/-1 sur un message ARIA.
 *
 * Body attendu :
 *   { message_id: string, rating: 1 | -1, reason?: string }
 *
 * Comportement :
 *   - Verifie que le message appartient bien a l'utilisateur (RLS le ferait
 *     mais on prefere un 404 explicite).
 *   - UPSERT sur (user_id, message_id) : un user peut changer son vote.
 *   - Renvoie { id, rating, reason }.
 *
 * Phase 6 utilisera cette route depuis les boutons 👍/👎 sous chaque
 * message dans le panneau ARIA.
 */

import { createServerClient } from '@/lib/supabase/server'
import { err, ok, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

interface FeedbackBody {
  message_id?: string
  rating?:     number
  reason?:     string | null
}

export const POST = withAuth(async (req: Request, user: User) => {
  let body: FeedbackBody
  try {
    body = await req.json() as FeedbackBody
  } catch {
    return err('Body JSON invalide', 400)
  }

  const messageId = (body.message_id ?? '').trim()
  const rating = body.rating
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

  if (!messageId) return err('message_id est requis', 400)
  if (rating !== 1 && rating !== -1) return err('rating doit etre 1 ou -1', 400)

  const supabase = await createServerClient()

  // 1. Le message existe et appartient au user (anti-spoof) ?
  const { data: msg, error: msgErr } = await supabase
    .from('aria_messages')
    .select('id, role')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (msgErr) return err(`Lecture message: ${msgErr.message}`, 500)
  if (!msg) return err('Message introuvable', 404)
  if (msg.role !== 'assistant') {
    return err('Le feedback ne s\'applique qu\'aux messages assistant', 400)
  }

  // 2. UPSERT (overwrite si vote precedent)
  const { data, error } = await supabase
    .from('aria_feedback')
    .upsert({
      message_id: messageId,
      user_id:    user.id,
      rating,
      reason,
    }, { onConflict: 'user_id,message_id' })
    .select('id, rating, reason')
    .single()

  if (error || !data) return err(`Persistance feedback: ${error?.message ?? 'inconnue'}`, 500)

  return ok({ id: data.id as string, rating: data.rating as number, reason: data.reason as string | null })
})
