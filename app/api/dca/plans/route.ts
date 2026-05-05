import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { DcaPlanInsert, DcaPlanUpdate } from '@/types/database.types'
import { addWeeks, addMonths, addQuarters, format, parseISO, isAfter, isBefore, isEqual } from 'date-fns'

// ─── Génération des occurrences à partir d'un plan ────────────────────────────

function generateOccurrences(
  planId: string,
  userId: string,
  startDate: string,
  endDate: string | null,
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly',
  amount: number,
  horizonMonths = 6, // générer 6 mois en avance max
): Array<{
  dca_plan_id: string
  user_id: string
  scheduled_date: string
  planned_amount: number
  status: 'pending'
}> {
  const occurrences = []
  const horizon = endDate
    ? parseISO(endDate)
    : addMonths(new Date(), horizonMonths)

  let current = parseISO(startDate)
  const now = new Date()

  while (
    (isBefore(current, horizon) || isEqual(current, horizon)) &&
    occurrences.length < 200 // garde-fou
  ) {
    // Ne générer que les occurrences futures ou du jour
    if (!isBefore(current, new Date(now.getFullYear(), now.getMonth(), now.getDate()))) {
      occurrences.push({
        dca_plan_id: planId,
        user_id: userId,
        scheduled_date: format(current, 'yyyy-MM-dd'),
        planned_amount: amount,
        status: 'pending' as const,
      })
    }

    switch (frequency) {
      case 'weekly':     current = addWeeks(current, 1);    break
      case 'biweekly':   current = addWeeks(current, 2);    break
      case 'monthly':    current = addMonths(current, 1);   break
      case 'quarterly':  current = addQuarters(current, 1); break
    }
  }

  return occurrences
}

// GET /api/dca/plans
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('dca_plans')
    .select(`
      *,
      asset:assets (id, name, asset_type),
      envelope:financial_envelopes (id, name, envelope_type),
      occurrences:dca_occurrences (
        id, scheduled_date, status, planned_amount, actual_amount
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)

  // Enrichir avec métriques DCA
  const enriched = data.map((plan) => {
    const occ = plan.occurrences ?? []
    const validated = occ.filter((o: { status: string }) => o.status === 'validated')
    const pending = occ.filter((o: { status: string }) => o.status === 'pending')
    const totalInvested = validated.reduce(
      (s: number, o: { actual_amount: number | null; planned_amount: number }) =>
        s + (o.actual_amount ?? o.planned_amount),
      0,
    )

    return {
      ...plan,
      metrics: {
        validated_count: validated.length,
        pending_count: pending.length,
        total_invested: Math.round(totalInvested * 100) / 100,
        next_occurrence: pending[0]?.scheduled_date ?? null,
      },
    }
  })

  return ok(enriched)
})

// POST /api/dca/plans — créer un plan + générer les prochaines occurrences
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Omit<DcaPlanInsert, 'user_id'>>(req)
  if (!body) return err('Invalid JSON body')

  const required = ['name', 'ticker', 'amount_per_period', 'frequency', 'start_date']
  for (const f of required) {
    if (!body[f as keyof typeof body]) return err(`${f} is required`)
  }

  const supabase = await createServerClient()

  // 1. Créer le plan
  const { data: plan, error: planErr } = await supabase
    .from('dca_plans')
    .insert({ ...body, user_id: user.id })
    .select()
    .single()

  if (planErr) return err(planErr.message, 500)

  // 2. Générer les occurrences sur l'horizon
  const occurrences = generateOccurrences(
    plan.id,
    user.id,
    plan.start_date,
    plan.end_date,
    plan.frequency,
    plan.amount_per_period,
  )

  if (occurrences.length > 0) {
    const { error: occErr } = await supabase.from('dca_occurrences').insert(occurrences)
    if (occErr) console.warn('[dca] Failed to generate occurrences:', occErr.message)
  }

  return ok({ plan, occurrences_generated: occurrences.length }, 201)
})

// PUT /api/dca/plans?id=xxx — mise à jour d'un plan (régénère les occurrences pending)
export const PUT = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return err('id query param is required')

  const body = await parseBody<DcaPlanUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const { user_id: _u, id: _i, ...safe } = body as Record<string, unknown>
  const supabase = await createServerClient()

  const { data: plan, error } = await supabase
    .from('dca_plans')
    .update(safe)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  if (!plan) return err('DCA plan not found', 404)

  // Supprimer et régénérer les occurrences pending uniquement
  await supabase
    .from('dca_occurrences')
    .delete()
    .eq('dca_plan_id', id)
    .eq('status', 'pending')

  const occurrences = generateOccurrences(
    plan.id,
    user.id,
    plan.start_date,
    plan.end_date,
    plan.frequency,
    plan.amount_per_period,
  )

  if (occurrences.length > 0) {
    await supabase.from('dca_occurrences').insert(occurrences)
  }

  return ok({ plan, occurrences_regenerated: occurrences.length })
})
