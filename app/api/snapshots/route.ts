import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, getPagination } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { confidenceScore, round2 } from '@/lib/finance/formulas'
import { format } from 'date-fns'

// GET /api/snapshots — historique des snapshots
// ?from=2024-01-01&to=2024-12-31
// ?limit=365&page=1
export const GET = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const { from: rangeFrom, to: rangeTo } = getPagination(req.url)
  const supabase = await createServerClient()

  let query = supabase
    .from('patrimony_snapshots')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .range(rangeFrom, rangeTo)

  const dateFrom = searchParams.get('from')
  if (dateFrom) query = query.gte('snapshot_date', dateFrom)

  const dateTo = searchParams.get('to')
  if (dateTo) query = query.lte('snapshot_date', dateTo)

  const { data, error, count } = await query
  if (error) return err(error.message, 500)

  return ok({ items: data, total: count ?? 0 })
})

// POST /api/snapshots — forcer la création d'un snapshot à la date du jour
// Utilisé manuellement ou par les Edge Functions.
export const POST = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // ── 1. Actifs actifs avec leur valeur courante ─────────────────────────────
  const { data: assets, error: assetsErr } = await supabase
    .from('assets')
    .select('id, asset_type, current_value, confidence')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (assetsErr) return err(assetsErr.message, 500)

  // ── 2. Dettes actives ──────────────────────────────────────────────────────
  const { data: debts } = await supabase
    .from('debts')
    .select('capital_remaining')
    .eq('user_id', user.id)
    .eq('status', 'active')

  // ── 3. Cash-flow mensuel estimé (loyers des lots loués - charges mensuelles) ─
  const { data: lots } = await supabase
    .from('real_estate_lots')
    .select('rent_amount, charges_amount, status')
    .eq('user_id', user.id)
    .eq('status', 'rented')

  // ── Calculs ────────────────────────────────────────────────────────────────
  const byType: Record<string, number> = {
    real_estate: 0, scpi: 0, stock: 0, etf: 0, crypto: 0, gold: 0, cash: 0, other: 0,
  }

  for (const a of assets ?? []) {
    const v = a.current_value ?? 0
    const type = a.asset_type as string
    if (type in byType) byType[type]! += v
    else byType['other']! += v
  }

  const financialValue = (byType['stock'] ?? 0) + (byType['etf'] ?? 0) +
                         (byType['crypto'] ?? 0) + (byType['gold'] ?? 0)

  const totalGross = Object.values(byType).reduce((s, v) => s + v, 0)
  const totalDebt = (debts ?? []).reduce((s, d) => s + (d.capital_remaining ?? 0), 0)
  const totalNet = round2(totalGross - totalDebt)

  const monthlyCashFlow = (lots ?? []).reduce(
    (s, l) => s + (l.rent_amount ?? 0) - (l.charges_amount ?? 0),
    0,
  )

  const score = confidenceScore(
    (assets ?? []).map((a) => ({
      value: a.current_value ?? 0,
      confidence: a.confidence as 'high' | 'medium' | 'low',
    })),
  )

  // ── 4. Upsert snapshot ─────────────────────────────────────────────────────
  const { data: snapshot, error: snapErr } = await supabase
    .from('patrimony_snapshots')
    .upsert(
      {
        user_id: user.id,
        snapshot_date: today,
        total_gross_value: round2(totalGross),
        total_debt: round2(totalDebt),
        total_net_value: totalNet,
        real_estate_value: round2(byType['real_estate'] ?? 0),
        scpi_value: round2(byType['scpi'] ?? 0),
        financial_value: round2(financialValue),
        cash_value: round2(byType['cash'] ?? 0),
        other_value: round2(byType['other'] ?? 0),
        monthly_cashflow: round2(monthlyCashFlow),
        confidence_score: round2(score),
      },
      { onConflict: 'user_id,snapshot_date' },
    )
    .select()
    .single()

  if (snapErr) return err(snapErr.message, 500)

  return ok(snapshot, 201)
})
