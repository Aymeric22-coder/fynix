import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { BienvenueClient } from './bienvenue-client'

/**
 * Page /bienvenue — onboarding 60 secondes.
 *
 * Garde de route (Server) :
 *   - Pas d'utilisateur connecté → /login
 *   - Profil déjà complet (wizard terminé OU onboarding rapide déjà fait)
 *     → /dashboard (pas besoin de repasser ici)
 *
 * Le reste de la logique vit dans BienvenueClient (form + résultat).
 */
export default async function BienvenuePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('profile_completed_at, onboarding_quick_done, age, revenu_mensuel, onboarding_quick_data')
    .eq('id', user.id)
    .maybeSingle()

  // Si l'utilisateur a déjà passé la porte d'entrée (wizard fini OU
  // onboarding rapide déjà fait), on l'envoie au dashboard.
  if (profile?.profile_completed_at || profile?.onboarding_quick_done) {
    redirect('/dashboard')
  }

  return <BienvenueClient />
}
