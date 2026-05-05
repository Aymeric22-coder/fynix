import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

// PUT /api/cash/:id — mise à jour complète (solde + métadonnées) + historisation
export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await parseBody<{
    balance:       number
    balance_date?: string
    interest_rate?: number
    name?:          string
    account_type?:  string
    bank_name?:     string | null
    currency?:      string
  }>(req)
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

  await supabase.from('cash_balance_history').upsert(
    {
      cash_account_id: id,
      user_id:         user.id,
      balance_date:    balanceDate,
      balance:         body.balance,
      source:          'manual',
    },
    { onConflict: 'cash_account_id,balance_date' },
  )

  await supabase.from('cash_accounts').update({
    balance:       body.balance,
    balance_date:  balanceDate,
    ...(body.interest_rate !== undefined && { interest_rate: body.interest_rate }),
    ...(body.account_type  !== undefined && { account_type:  body.account_type  }),
    ...(body.bank_name     !== undefined && { bank_name:     body.bank_name     }),
  }).eq('id', id)

  // Mettre à jour le nom de l'asset si fourni
  if (body.name) {
    await supabase.from('assets').update({
      name:           body.name,
      current_value:  body.balance,
      last_valued_at: new Date().toISOString(),
    }).eq('id', ca.asset_id)
  } else {
    await supabase.from('assets').update({
      current_value:  body.balance,
      last_valued_at: new Date().toISOString(),
    }).eq('id', ca.asset_id)
  }

  return ok({ id, balance: body.balance, balance_date: balanceDate })
})

// DELETE /api/cash/:id — désactiver le compte (soft-delete)
export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const supabase = await createServerClient()

  const { data: ca } = await supabase
    .from('cash_accounts')
    .select('asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ca) return err('Cash account not found', 404)

  await supabase.from('assets').update({ status: 'closed' }).eq('id', ca.asset_id)

  return ok({ deleted: id })
})
