/**
 * POST /api/portfolio/positions/[id]/prices
 *
 * Ajoute une ligne de valorisation manuelle pour l'instrument lié à
 * cette position. Append-only sur `instrument_prices`.
 *
 * Body :
 *   {
 *     price?:        number    // prix unitaire (devise position)
 *     total_value?:  number    // alternative : total / quantity = price
 *     priced_at?:    string    // ISO date, défaut now()
 *     notes?:        string    // libre (stocké dans metadata.notes)
 *   }
 *
 * Au moins l'un de `price` ou `total_value` est requis.
 *
 * Cas d'usage typique : fonds AV mensuel, SCPI trimestrielle, support
 * non coté. L'utilisateur ouvre la fiche position et clique "Ajouter
 * une valeur".
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody, type RouteContext } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { CurrencyCode } from '@/types/database.types'

interface AddPriceBody {
  price?:       number
  total_value?: number
  priced_at?:   string
  notes?:       string
}

export const POST = withAuth(async (req: Request, user: User, ctx: RouteContext) => {
  const { id: positionId } = await ctx.params
  const body = await parseBody<AddPriceBody>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()

  // 1. Récupère la position (vérifie ownership via RLS)
  const { data: pos, error: posErr } = await supabase
    .from('positions')
    .select('id, instrument_id, quantity, currency, user_id')
    .eq('id', positionId)
    .eq('user_id', user.id)
    .single()

  if (posErr || !pos) return err('Position not found', 404)

  const quantity = Number(pos.quantity)
  const currency = (pos.currency as CurrencyCode) ?? 'EUR'

  // 2. Résolution du prix
  let price = body.price
  if ((price === undefined || price <= 0) && body.total_value !== undefined && body.total_value > 0) {
    if (quantity <= 0) return err('Quantité de la position invalide pour déduire le prix unitaire')
    price = body.total_value / quantity
  }
  if (price === undefined || price <= 0) {
    return err('Soit price soit total_value (>0) est requis')
  }

  // 3. Date du prix (défaut : maintenant)
  let pricedAt: Date
  if (body.priced_at) {
    pricedAt = new Date(body.priced_at)
    if (isNaN(pricedAt.getTime())) return err('priced_at invalide')
  } else {
    pricedAt = new Date()
  }
  pricedAt.setSeconds(0, 0)  // tronque pour éviter les collisions de l'index UNIQUE

  // 4. Insert append-only dans instrument_prices
  const { data: inserted, error: insErr } = await supabase
    .from('instrument_prices')
    .insert({
      instrument_id: pos.instrument_id,
      price,
      currency,
      priced_at:     pricedAt.toISOString(),
      source:        'manual',
      confidence:    'medium',
      metadata:      body.notes ? { notes: body.notes } : {},
    })
    .select()
    .single()

  if (insErr) return err(insErr.message, 500)
  return ok(inserted, 201)
})
