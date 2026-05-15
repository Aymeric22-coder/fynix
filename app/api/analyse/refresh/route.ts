/**
 * POST /api/analyse/refresh
 *
 * Invalide le cache `isin_cache` pour les ISIN détenus par l'utilisateur,
 * forçant un re-fetch OpenFIGI + Yahoo Finance au prochain appel
 * /api/analyse/patrimoine.
 *
 * On ne supprime pas les rows : on met juste `cache_expires_at = NOW()`.
 * Avantage : on garde l'historique `cached_at` pour les analytics.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

export const POST = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  // 1. Liste des ISIN détenus par le user
  const { data: pos } = await supabase
    .from('positions')
    .select('instrument:instruments!instrument_id(isin)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const isins = Array.from(new Set(
    ((pos ?? []) as Array<{ instrument: { isin: string | null } | { isin: string | null }[] | null }>)
      .map((r) => Array.isArray(r.instrument) ? r.instrument[0]?.isin : r.instrument?.isin)
      .filter((x): x is string => !!x)
  ))

  if (isins.length === 0) return ok({ invalidated: 0 })

  // 2. Invalidation : passe cache_expires_at à NOW
  const { error } = await supabase
    .from('isin_cache')
    .update({ cache_expires_at: new Date().toISOString() })
    .in('isin', isins)

  if (error) return err(error.message, 500)
  return ok({ invalidated: isins.length })
})
