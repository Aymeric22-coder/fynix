/**
 * POST /api/portfolio/snapshot — crée / met à jour le snapshot du jour
 * pour l'utilisateur courant. Idempotent (UPSERT).
 *
 * GET /api/portfolio/history?limit=90 — liste les N derniers snapshots
 * (ordre chronologique croissant, prêt pour un graphique).
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { persistPortfolioSnapshot } from '@/lib/portfolio/persist-snapshot'

export const POST = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const result   = await persistPortfolioSnapshot(supabase, user.id, 'manual')
  if (!result) return ok({ inserted: false, reason: 'empty_portfolio' })
  return ok(result, 201)
})

export const GET = withAuth(async (req: Request, user: User) => {
  const supabase = await createServerClient()
  const { searchParams } = new URL(req.url)
  const limit = Math.min(365, Math.max(1, parseInt(searchParams.get('limit') ?? '90', 10)))

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, snapshot_at, total_market_value, total_cost_basis, total_pnl, total_pnl_pct, positions_count, valued_count, source')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(limit)

  if (error) return err(error.message, 500)

  // Reorder chronologique croissant (plus pratique pour un chart)
  const series = (data ?? []).reverse()
  return ok({ series })
})
