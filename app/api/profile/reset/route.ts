/**
 * POST /api/profile/reset
 *
 * Outil dev/debug : remet à zéro toutes les réponses du wizard ET de
 * l'onboarding 60s pour que l'utilisateur puisse les revivre depuis le
 * début. Ne touche QUE la table `profiles` ET la table `life_events`
 * (CS5) — aucune autre table (positions, biens, comptes, snapshots…)
 * n'est impactée.
 *
 * Le payload de wipe vit dans `./payload.ts` (Next.js 15 interdit les
 * exports « non-standard » depuis un `route.ts`).
 *
 * RLS : `profiles` filtre par `id = auth.uid()`, `life_events` par
 * `user_id = auth.uid()`. On applique le `eq` en ceinture-bretelles.
 */
import { createServerClient } from '@/lib/supabase/server'
import { err, ok, withAuth } from '@/lib/utils/api'
import { RESET_WIPE_PAYLOAD } from './payload'

export const POST = withAuth(async (_req, user) => {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('profiles')
    .update(RESET_WIPE_PAYLOAD)
    .eq('id', user.id)
  if (error) return err(`Erreur Supabase profiles : ${error.message}`, 500)

  // CS5 — Wipe les évènements de vie aussi (sinon ils survivent au reset).
  const { error: leErr } = await supabase
    .from('life_events')
    .delete()
    .eq('user_id', user.id)
  if (leErr) return err(`Erreur Supabase life_events : ${leErr.message}`, 500)

  return ok({ ok: true, redirect: '/bienvenue' })
})
