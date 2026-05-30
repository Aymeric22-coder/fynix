/**
 * POST /api/profile/reset
 *
 * Outil dev/debug : remet à zéro toutes les réponses du wizard ET de
 * l'onboarding 60s pour que l'utilisateur puisse les revivre depuis le
 * début. Ne touche QUE la table `profiles` — aucune autre table (positions,
 * biens, comptes, snapshots…) n'est impactée.
 *
 * Le payload de wipe vit dans `./payload.ts` (Next.js 15 interdit les
 * exports « non-standard » depuis un `route.ts`).
 *
 * RLS : la table `profiles` filtre par `id = auth.uid()`. La route applique
 * `eq('id', user.id)` en ceinture-bretelles.
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

  if (error) return err(`Erreur Supabase : ${error.message}`, 500)

  return ok({ ok: true, redirect: '/bienvenue' })
})
