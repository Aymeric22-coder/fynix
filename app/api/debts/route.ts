import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { DebtInsert } from '@/types/database.types'
import { pmt, round2 } from '@/lib/finance/formulas'

// GET /api/debts
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('start_date', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
})

// POST /api/debts — créer un crédit et précalculer la mensualité
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<Omit<DebtInsert, 'user_id' | 'monthly_payment' | 'capital_remaining'>>(req)
  if (!body) return err('Invalid JSON body')

  const required = ['name', 'initial_amount', 'interest_rate', 'duration_months', 'start_date']
  for (const field of required) {
    if (body[field as keyof typeof body] === undefined) {
      return err(`${field} is required`)
    }
  }

  const deferralMonths = body.deferral_months ?? 0
  const deferralType = body.deferral_type ?? 'none'

  // Durée d'amortissement réelle (après différé)
  // interest_rate et duration_months sont nullable depuis migration 005.
  // Si fournis à la création (via le formulaire qui les requiert), on calcule.
  const monthlyPayment = (body.interest_rate != null && body.duration_months != null)
    ? round2(pmt(body.interest_rate, body.duration_months - deferralMonths, body.initial_amount))
    : null

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('debts')
    .insert({
      ...body,
      user_id: user.id,
      deferral_type: deferralType,
      deferral_months: deferralMonths,
      monthly_payment: monthlyPayment,
      capital_remaining: body.initial_amount,
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})
