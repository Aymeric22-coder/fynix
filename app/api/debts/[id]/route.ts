import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { DebtUpdate } from '@/types/database.types'
import { pmt, round2 } from '@/lib/finance/formulas'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/debts/[id]
export const GET = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) return err('Debt not found', 404)
  return ok(data)
})

// PUT /api/debts/[id] — met à jour le crédit et recalcule la mensualité
export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const body = await parseBody<DebtUpdate>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()

  // Lire le crédit existant pour compléter les champs manquants
  const { data: existing } = await supabase
    .from('debts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) return err('Debt not found', 404)

  const merged = { ...existing, ...body }
  const deferralMonths = merged.deferral_months ?? 0

  // Calcul de la mensualité uniquement si tous les champs requis sont présents.
  // Depuis migration 005, interest_rate / duration_months / start_date sont nullable
  // (saisie step-by-step) — on ne force pas le calcul si le crédit est incomplet.
  let monthlyPayment: number | null = existing.monthly_payment ?? null
  if (
    merged.interest_rate != null &&
    merged.duration_months != null &&
    merged.initial_amount != null
  ) {
    const amortMonths = merged.duration_months - deferralMonths
    monthlyPayment = round2(pmt(merged.interest_rate, amortMonths, merged.initial_amount))
  }

  const { user_id: _u, id: _i, created_at: _c, ...safe } = body as Record<string, unknown>

  const { data, error } = await supabase
    .from('debts')
    .update({ ...safe, monthly_payment: monthlyPayment })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})
