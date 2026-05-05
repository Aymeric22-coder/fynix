import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { CashAccountInsert } from '@/types/database.types'

interface CreateCashBody {
  name: string
  account_type: string
  bank_name?: string
  interest_rate?: number
  balance: number
  balance_date?: string
  currency?: string
  notes?: string
}

// GET /api/cash — comptes d'épargne et courants
export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('cash_accounts')
    .select(`
      *,
      asset:assets!asset_id (id, name, status, notes),
      history:cash_balance_history (
        balance_date, balance
      )
    `)
    .eq('user_id', user.id)
    .order('account_type')

  if (error) return err(error.message, 500)

  const totalCash = (data ?? []).reduce((sum, a) => sum + a.balance, 0)
  return ok({ items: data, total_cash: Math.round(totalCash * 100) / 100 })
})

// POST /api/cash — créer asset + cash_account + premier historique de solde
export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreateCashBody>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.name || !body.account_type || body.balance === undefined) {
    return err('name, account_type and balance are required')
  }

  const supabase = await createServerClient()

  const { data: asset, error: assetErr } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      name: body.name,
      asset_type: 'cash',
      currency: body.currency ?? 'EUR',
      current_value: body.balance,
      notes: body.notes ?? null,
      data_source: 'manual',
      confidence: 'high',
      last_valued_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (assetErr) return err(assetErr.message, 500)

  const { data: cashAccount, error: cashErr } = await supabase
    .from('cash_accounts')
    .insert({
      asset_id: asset.id,
      user_id: user.id,
      account_type: body.account_type,
      bank_name: body.bank_name ?? null,
      interest_rate: body.interest_rate ?? 0,
      balance: body.balance,
      balance_date: body.balance_date ?? new Date().toISOString().split('T')[0],
      currency: body.currency ?? 'EUR',
    })
    .select()
    .single()

  if (cashErr) {
    await supabase.from('assets').delete().eq('id', asset.id)
    return err(cashErr.message, 500)
  }

  // Enregistrer le solde initial dans l'historique
  await supabase.from('cash_balance_history').insert({
    cash_account_id: cashAccount.id,
    user_id: user.id,
    balance_date: body.balance_date ?? new Date().toISOString().split('T')[0]!,
    balance: body.balance,
    source: 'manual',
  })

  return ok({ asset, cash_account: cashAccount }, 201)
})

// PUT /api/cash?id=xxx — mise à jour du solde + historisation
export const PUT = withAuth(async (req: Request, user: User) => {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return err('id query param is required')

  const body = await parseBody<{ balance: number; balance_date?: string; interest_rate?: number }>(req)
  if (!body || body.balance === undefined) return err('balance is required')

  const supabase = await createServerClient()

  const { data: ca } = await supabase
    .from('cash_accounts')
    .select('asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ca) return err('Cash account not found', 404)

  const balanceDate = body.balance_date ?? new Date().toISOString().split('T')[0]!

  // Upsert historique (une seule valeur par jour)
  await supabase.from('cash_balance_history').upsert(
    { cash_account_id: id, user_id: user.id, balance_date: balanceDate, balance: body.balance, source: 'manual' },
    { onConflict: 'cash_account_id,balance_date' },
  )

  // Mettre à jour le solde courant
  await supabase.from('cash_accounts').update({
    balance: body.balance,
    balance_date: balanceDate,
    ...(body.interest_rate !== undefined && { interest_rate: body.interest_rate }),
  }).eq('id', id)

  // Synchroniser current_value dans assets
  await supabase.from('assets').update({
    current_value: body.balance,
    last_valued_at: new Date().toISOString(),
  }).eq('id', ca.asset_id)

  return ok({ id, balance: body.balance, balance_date: balanceDate })
})
