/**
 * Routes positions :
 *   - GET  /api/portfolio/positions               liste
 *   - POST /api/portfolio/positions               création (avec lookup/creation instrument)
 *
 * Body POST :
 *   {
 *     // Instrument : soit instrument_id existant, soit (name + asset_class + ticker?/isin?) → on crée
 *     instrument_id?:   string
 *     instrument?: {
 *       name:         string
 *       asset_class:  AssetClass
 *       ticker?:      string
 *       isin?:        string
 *       currency?:    CurrencyCode
 *       sector?:      string
 *       geography?:   string
 *     }
 *
 *     // Position
 *     quantity:        number
 *     average_price:   number
 *     currency?:       CurrencyCode
 *     envelope_id?:    string
 *     broker?:         string
 *     acquisition_date?: string
 *     notes?:          string
 *   }
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import type { AssetClass, CurrencyCode } from '@/types/database.types'

interface CreateBody {
  instrument_id?:    string
  instrument?: {
    name:        string
    asset_class: AssetClass
    ticker?:     string
    isin?:       string
    currency?:   CurrencyCode
    sector?:     string
    geography?:  string
  }
  quantity:          number
  average_price:     number
  currency?:         CurrencyCode
  envelope_id?:      string
  broker?:           string
  acquisition_date?: string
  notes?:            string
}

export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('positions')
    .select(`
      *,
      instrument:instruments!instrument_id (
        id, name, ticker, isin, asset_class, currency
      ),
      envelope:financial_envelopes!envelope_id (
        id, name, envelope_type
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return ok(data)
})

export const POST = withAuth(async (req: Request, user: User) => {
  const body = await parseBody<CreateBody>(req)
  if (!body) return err('Invalid JSON body')

  if (!body.quantity || body.quantity <= 0) return err('quantity must be > 0')
  if (body.average_price === undefined || body.average_price < 0)
    return err('average_price must be ≥ 0')
  if (!body.instrument_id && !body.instrument) return err('instrument or instrument_id required')

  const supabase = await createServerClient()

  // 1. Résolution / création de l'instrument
  let instrumentId = body.instrument_id
  if (!instrumentId && body.instrument) {
    const i = body.instrument
    if (!i.name || !i.asset_class) return err('instrument.name and asset_class required')

    // Tentative de réconciliation : si ticker/isin déjà existant, on réutilise.
    if (i.ticker || i.isin) {
      const orParts: string[] = []
      if (i.ticker) orParts.push(`ticker.eq.${i.ticker}`)
      if (i.isin)   orParts.push(`isin.eq.${i.isin}`)
      const { data: existing } = await supabase
        .from('instruments')
        .select('id')
        .or(orParts.join(','))
        .limit(1)
      if (existing && existing.length > 0) instrumentId = existing[0]!.id as string
    }

    if (!instrumentId) {
      const { data: created, error: ie } = await supabase
        .from('instruments')
        .insert({
          name:           i.name,
          asset_class:    i.asset_class,
          ticker:         i.ticker  ?? null,
          isin:           i.isin    ?? null,
          currency:       i.currency ?? 'EUR',
          sector:         i.sector  ?? null,
          geography:      i.geography ?? null,
          data_source:    'manual',
        })
        .select('id')
        .single()
      if (ie) return err(`Failed to create instrument: ${ie.message}`, 500)
      instrumentId = created.id as string
    }
  }

  // 2. Création de la position
  const { data, error } = await supabase
    .from('positions')
    .insert({
      user_id:          user.id,
      instrument_id:    instrumentId!,
      envelope_id:      body.envelope_id ?? null,
      quantity:         body.quantity,
      average_price:    body.average_price,
      currency:         body.currency ?? 'EUR',
      broker:           body.broker ?? null,
      acquisition_date: body.acquisition_date ?? null,
      notes:            body.notes ?? null,
      status:           'active',
    })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data, 201)
})
