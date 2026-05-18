/**
 * Persistance des recommandations marquées « Fait » par l'utilisateur.
 *
 * GET  /api/recos/done            → { recoKeys: string[] } (actives, undone_at IS NULL)
 * POST /api/recos/done            → body { recoKey: string, done: boolean }
 *   - done: true  → upsert avec undone_at = null (re-active si déjà existant)
 *   - done: false → update undone_at = now() (sans supprimer la ligne, pour
 *                   garder une trace historique des recos déjà appliquées un jour)
 *
 * Sécurité : RLS owner-only (cf. migration 030). Aucun check applicatif
 * supplémentaire — Supabase rejette toute tentative cross-user.
 */

import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, parseBody, withAuth } from '@/lib/utils/api'

const PostSchema = z.object({
  recoKey: z.string().min(1).max(100),
  done:    z.boolean(),
})

export const GET = withAuth(async (_req, user) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('recos_done')
    .select('reco_key')
    .eq('user_id', user.id)
    .is('undone_at', null)

  if (error) return err(`Erreur Supabase : ${error.message}`, 500)

  const recoKeys = (data ?? []).map((r) => r.reco_key as string)
  return ok({ recoKeys })
})

export const POST = withAuth(async (req, user) => {
  const raw = await parseBody<unknown>(req)
  const parsed = PostSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join(' · ')
    return err(`Validation échouée — ${msg}`, 400)
  }

  const { recoKey, done } = parsed.data
  const supabase = await createServerClient()

  if (done) {
    // Upsert : si la reco existe déjà (même clé, undone précédent), on
    // ré-active en remettant undone_at à NULL et done_at à maintenant.
    const { error } = await supabase
      .from('recos_done')
      .upsert(
        {
          user_id:   user.id,
          reco_key:  recoKey,
          done_at:   new Date().toISOString(),
          undone_at: null,
        },
        { onConflict: 'user_id,reco_key' },
      )
    if (error) return err(`Erreur Supabase : ${error.message}`, 500)
  } else {
    // Marque comme « plus fait » sans supprimer la ligne (historique conservé).
    const { error } = await supabase
      .from('recos_done')
      .update({ undone_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('reco_key', recoKey)
    if (error) return err(`Erreur Supabase : ${error.message}`, 500)
  }

  return ok({ ok: true })
})
