/**
 * PUT    /api/portfolio/positions/[id]   met à jour quantité, PRU, enveloppe…
 * DELETE /api/portfolio/positions/[id]   suppression définitive (cascade transactions via SET NULL)
 *
 * RLS : positions_owner_all → seul le propriétaire peut update/delete.
 *
 * Side-effect (Étape 5) : si la quantité change, la PUT enregistre
 * automatiquement une transaction implicite ('purchase' ou 'sale') pour
 * conserver un historique cohérent (TWR / MWR / agrégats par enveloppe).
 * L'utilisateur peut désactiver ce comportement avec record_movement=false
 * (ex. ré-import depuis un broker, correction comptable).
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody, type RouteContext } from '@/lib/utils/api'
import { computePositionMovement } from '@/lib/portfolio/movements'
import type { User } from '@supabase/supabase-js'
import type { CurrencyCode, PositionStatus } from '@/types/database.types'

interface UpdateBody {
  quantity?:         number
  average_price?:    number
  currency?:         CurrencyCode
  envelope_id?:      string | null
  broker?:           string | null
  acquisition_date?: string | null
  status?:           PositionStatus
  notes?:            string | null
  /** Prix manuel à ajouter à instrument_prices (n'écrase pas le PUT classique). */
  manual_price?:     number
  /**
   * Si false, le PUT ne génère PAS de transaction implicite même si la
   * quantité change. Défaut true. Utile pour les corrections comptables
   * ou pour ré-importer une position avec quantité corrigée sans gonfler
   * l'historique des transactions.
   */
  record_movement?:  boolean
}

export const PUT = withAuth(async (req: Request, user: User, ctx: RouteContext) => {
  const { id } = await ctx.params
  const body = await parseBody<UpdateBody>(req)
  if (!body) return err('Invalid JSON body')

  if (body.quantity !== undefined && body.quantity < 0) return err('quantity must be ≥ 0')
  if (body.average_price !== undefined && body.average_price < 0) return err('average_price must be ≥ 0')

  const supabase = await createServerClient()

  // 1. Lire l'ancien état pour détecter un mouvement implicite.
  //    On a besoin de quantity / average_price / currency / instrument_id.
  const { data: before, error: beforeErr } = await supabase
    .from('positions')
    .select('id, instrument_id, quantity, average_price, currency')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (beforeErr || !before) return err('Position not found', 404)

  // 2. Update
  const { data, error } = await supabase
    .from('positions')
    .update({
      ...(body.quantity         !== undefined ? { quantity:         body.quantity }         : {}),
      ...(body.average_price    !== undefined ? { average_price:    body.average_price }    : {}),
      ...(body.currency         !== undefined ? { currency:         body.currency }         : {}),
      ...(body.envelope_id      !== undefined ? { envelope_id:      body.envelope_id }      : {}),
      ...(body.broker           !== undefined ? { broker:           body.broker }           : {}),
      ...(body.acquisition_date !== undefined ? { acquisition_date: body.acquisition_date } : {}),
      ...(body.status           !== undefined ? { status:           body.status }           : {}),
      ...(body.notes            !== undefined ? { notes:            body.notes }            : {}),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return err(error.message, 500)

  // 3. Prix manuel optionnel : ajoute une ligne dans instrument_prices
  if (body.manual_price !== undefined && body.manual_price > 0 && data?.instrument_id) {
    await supabase
      .from('instrument_prices')
      .insert({
        instrument_id: data.instrument_id as string,
        price:         body.manual_price,
        currency:      (body.currency ?? data.currency ?? 'EUR') as string,
        priced_at:     new Date().toISOString(),
        source:        'manual',
        confidence:    'medium',
      })
      .then(({ error: priceErr }) => {
        if (priceErr) console.warn('[positions PUT] manual_price insert failed:', priceErr.message)
      })
  }

  // 4. Mouvement implicite (Étape 5) : si la quantité change, on enregistre
  //    une transaction 'purchase' ou 'sale' pour la cohérence historique.
  const recordMovement = body.record_movement !== false  // défaut true
  if (recordMovement && body.quantity !== undefined) {
    // Pour une vente, on a besoin du dernier prix de marché si dispo.
    let lastMarketPrice: number | null = null
    if (body.quantity < Number(before.quantity)) {
      const { data: lastP } = await supabase
        .from('instrument_prices')
        .select('price')
        .eq('instrument_id', before.instrument_id as string)
        .order('priced_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastP?.price !== undefined) lastMarketPrice = Number(lastP.price)
    }

    const movement = computePositionMovement({
      before: {
        quantity:     Number(before.quantity),
        averagePrice: Number(before.average_price),
        currency:     (before.currency ?? 'EUR') as CurrencyCode,
        instrumentId: before.instrument_id as string,
        positionId:   before.id as string,
      },
      after: {
        quantity:     body.quantity,
        averagePrice: body.average_price ?? Number(before.average_price),
        currency:     body.currency,
      },
      lastMarketPrice,
    })

    if (movement) {
      await supabase
        .from('transactions')
        .insert({
          user_id:          user.id,
          position_id:      movement.positionId,
          instrument_id:    movement.instrumentId,
          transaction_type: movement.type,
          amount:           movement.amount,
          currency:         movement.currency,
          fx_rate_to_ref:   1,
          executed_at:      movement.executedAt.toISOString(),
          quantity:         movement.quantity,
          unit_price:       movement.unitPrice,
          fees:             0,
          label:            movement.label,
          data_source:      'manual',
        })
        .then(({ error: txErr }) => {
          if (txErr) console.warn('[positions PUT] movement tx insert failed:', txErr.message)
        })
    }
  }

  return ok(data)
})

export const DELETE = withAuth(async (_req: Request, user: User, ctx: RouteContext) => {
  const { id } = await ctx.params
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('positions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
