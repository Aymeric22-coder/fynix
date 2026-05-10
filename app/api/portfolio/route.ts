/**
 * GET /api/portfolio — résultat agrégé du portefeuille pour l'utilisateur courant.
 *
 * Inclut : positions valorisées + summary + allocations.
 * Les analytics historiques (TWR, MWR, drawdown) seront ajoutées en Phase 5
 * via des snapshots dédiés.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { buildPortfolioFromDb } from '@/lib/portfolio/build-from-db'

export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  try {
    const result = await buildPortfolioFromDb(supabase, user.id)
    return ok(result)
  } catch (e) {
    console.error('[GET /api/portfolio] failed', e)
    return err('Failed to compute portfolio', 500)
  }
})
