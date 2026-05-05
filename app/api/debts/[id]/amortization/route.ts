import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { generateAmortizationSchedule } from '@/lib/finance/amortization'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/debts/[id]/amortization
// Génère le tableau à la volée ou le retourne depuis la DB si déjà calculé.
// ?force=true force le recalcul et la persistance en DB.
export const GET = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const forceRecalc = searchParams.get('force') === 'true'
  const supabase = await createServerClient()

  // Vérifier l'existence du crédit et l'appartenance
  const { data: debt } = await supabase
    .from('debts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!debt) return err('Debt not found', 404)

  // Si le tableau existe déjà et qu'on ne force pas le recalcul
  if (!forceRecalc) {
    const { data: existing, error: existErr } = await supabase
      .from('debt_amortization')
      .select('*')
      .eq('debt_id', id)
      .order('period_number', { ascending: true })

    if (!existErr && existing && existing.length > 0) {
      return ok(existing)
    }
  }

  // Calcul du tableau d'amortissement
  const schedule = generateAmortizationSchedule(debt)

  // Persister en DB (upsert pour permettre le recalcul)
  const rows = schedule.map((row) => ({
    ...row,
    debt_id: id,
    user_id: user.id,
  }))

  // Supprimer l'ancien tableau avant de réinsérer
  await supabase.from('debt_amortization').delete().eq('debt_id', id)
  const { error: insertErr } = await supabase.from('debt_amortization').insert(rows)

  if (insertErr) {
    console.warn('[amortization] Failed to persist schedule:', insertErr.message)
  }

  // Mettre à jour le capital restant dû dans debts
  const lastRow = schedule[schedule.length - 1]
  if (lastRow) {
    const currentRow = schedule.find(
      (r) => r.payment_date >= new Date().toISOString().split('T')[0]!,
    )
    if (currentRow) {
      await supabase
        .from('debts')
        .update({ capital_remaining: currentRow.capital_remaining })
        .eq('id', id)
    }
  }

  return ok(schedule)
})
