import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/dca/plans/[id]/occurrences
// ?status=pending|validated|skipped|cancelled
// ?from=2024-01-01&to=2024-12-31
export const GET = withAuth(async (req: Request, user: User, ctx?: Ctx) => {
  const { id: planId } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const supabase = await createServerClient()

  // Vérifier que le plan appartient à l'utilisateur
  const { data: plan } = await supabase
    .from('dca_plans')
    .select('id, name, ticker, amount_per_period, frequency')
    .eq('id', planId)
    .eq('user_id', user.id)
    .single()

  if (!plan) return err('DCA plan not found', 404)

  let query = supabase
    .from('dca_occurrences')
    .select('*', { count: 'exact' })
    .eq('dca_plan_id', planId)
    .eq('user_id', user.id)
    .order('scheduled_date', { ascending: true })

  const status = searchParams.get('status')
  if (status) query = query.eq('status', status)

  const dateFrom = searchParams.get('from')
  if (dateFrom) query = query.gte('scheduled_date', dateFrom)

  const dateTo = searchParams.get('to')
  if (dateTo) query = query.lte('scheduled_date', dateTo)

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  // Statistiques globales du plan
  const { data: stats } = await supabase
    .from('dca_occurrences')
    .select('status, actual_amount, planned_amount')
    .eq('dca_plan_id', planId)
    .eq('user_id', user.id)

  const totalInvested = (stats ?? [])
    .filter((o) => o.status === 'validated')
    .reduce((s, o) => s + (o.actual_amount ?? o.planned_amount), 0)

  return ok({
    plan,
    items: data,
    total: count ?? 0,
    summary: {
      total_invested: Math.round(totalInvested * 100) / 100,
      validated: (stats ?? []).filter((o) => o.status === 'validated').length,
      pending: (stats ?? []).filter((o) => o.status === 'pending').length,
      skipped: (stats ?? []).filter((o) => o.status === 'skipped').length,
    },
  })
})
