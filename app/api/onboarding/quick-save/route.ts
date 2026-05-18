/**
 * POST /api/onboarding/quick-save
 *
 * Sauvegarde silencieuse des 3 inputs de l'onboarding 60s dans `profiles`.
 *
 *  - age              → profiles.age
 *  - revenuMensuelNet → profiles.revenu_mensuel
 *  - patrimoineActuel → stocké dans profiles.onboarding_quick_data (jsonb)
 *    (pas de champ dédié dans le schéma — c'est un "ordre de grandeur"
 *    qui ne se mappe pas sur un actif précis).
 *
 *  - profiles.onboarding_quick_done = true (sentinel)
 *
 * Validation Zod stricte. Pas de calcul ici — c'est juste un upsert.
 */
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { err, ok, parseBody, withAuth } from '@/lib/utils/api'

const QuickSaveSchema = z.object({
  age:              z.number().int().min(18).max(70),
  revenuMensuelNet: z.number().positive(),
  patrimoineActuel: z.number().min(0),
})

export const POST = withAuth(async (req, user) => {
  const raw = await parseBody<unknown>(req)
  const parsed = QuickSaveSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join(' · ')
    return err(`Validation échouée — ${msg}`, 400)
  }

  const { age, revenuMensuelNet, patrimoineActuel } = parsed.data

  const supabase = await createServerClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      age,
      revenu_mensuel:        revenuMensuelNet,
      onboarding_quick_done: true,
      onboarding_quick_data: {
        age,
        revenuMensuelNet,
        patrimoineActuel,
        savedAt: new Date().toISOString(),
      },
    })
    .eq('id', user.id)

  if (error) return err(`Erreur Supabase : ${error.message}`, 500)

  return ok({ ok: true })
})
