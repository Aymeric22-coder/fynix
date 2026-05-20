/**
 * POST /api/portfolio/dividends — enregistre un dividende encaissé.
 *
 * Crée une ligne dans `transactions(transaction_type='dividend')`.
 * La devise est héritée de la position si non fournie. La date est
 * stockée à 00:00 UTC.
 *
 * Body :
 *   {
 *     position_id:  string  (uuid, validé sur user)
 *     amount:       number  (> 0)
 *     currency?:    CurrencyCode (auto si absent : devise position)
 *     executed_at:  string  (ISO yyyy-mm-dd)
 *     label?:       string  (sinon généré)
 *   }
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { CurrencyCode } from '@/types/database.types'

interface CreateDividendBody {
  position_id:  string
  amount:       number
  currency?:    CurrencyCode
  executed_at:  string
  label?:       string
}

export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreateDividendBody>(req)
  if (!body)                                 return err('Invalid JSON body')
  if (!body.position_id)                     return err('position_id requis')
  if (!body.amount || body.amount <= 0)      return err('amount doit être > 0')
  if (!body.executed_at)                     return err('executed_at requis')

  const parsed = new Date(body.executed_at)
  if (Number.isNaN(parsed.getTime()))        return err('executed_at invalide')

  const supabase = await createServerClient()

  // Vérification de propriété + résolution instrument_id + devise auto.
  const { data: position, error: posErr } = await supabase
    .from('positions')
    .select(`
      id, instrument_id, currency,
      instrument:instruments!instrument_id ( name )
    `)
    .eq('id', body.position_id)
    .eq('user_id', user.id)
    .single()

  if (posErr || !position) return err('Position introuvable', 404)

  type InstrumentLite = { name: string }
  const instrument = (Array.isArray(position.instrument)
    ? position.instrument[0]
    : position.instrument) as InstrumentLite | null

  const currency      = body.currency ?? (position.currency as CurrencyCode)
  const executedAtISO = `${body.executed_at.slice(0, 10)}T00:00:00.000Z`
  const label         = body.label?.trim()
    || `Dividende ${body.amount} ${currency}${instrument?.name ? ` — ${instrument.name}` : ''}`

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id:          user.id,
      position_id:      position.id,
      instrument_id:    position.instrument_id,
      transaction_type: 'dividend',
      amount:           body.amount,
      currency,
      fx_rate_to_ref:   1,
      executed_at:      executedAtISO,
      quantity:         null,
      unit_price:       null,
      fees:             0,
      label,
      data_source:      'manual',
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})
