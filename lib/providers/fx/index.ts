import { createServiceClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import type { CurrencyCode } from '@/types/database.types'

const FX_TTL_MS = (parseInt(process.env.FX_RATE_TTL_SECONDS ?? '3600', 10)) * 1000
const FRANKFURTER_BASE = 'https://api.frankfurter.app'

// Cache mémoire pour les taux du jour
const memFxCache = new Map<string, { rate: number; expiresAt: number }>()

function cacheKey(base: CurrencyCode, quote: CurrencyCode, date: string) {
  return `${base}/${quote}/${date}`
}

/**
 * Taux de change base → quote à une date donnée (ou aujourd'hui).
 * Chaîne : cache mémoire → DB → API Frankfurter.
 */
export async function getFxRate(
  base: CurrencyCode,
  quote: CurrencyCode,
  date?: Date,
): Promise<number> {
  if (base === quote) return 1

  const dateStr = date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  const key = cacheKey(base, quote, dateStr)

  // 1. Cache mémoire
  const mem = memFxCache.get(key)
  if (mem && mem.expiresAt > Date.now()) return mem.rate

  // 2. Cache DB
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('fx_rates')
      .select('rate')
      .eq('base_currency', base)
      .eq('quote_currency', quote)
      .eq('rate_date', dateStr)
      .single()

    if (data) {
      memFxCache.set(key, { rate: data.rate, expiresAt: Date.now() + FX_TTL_MS })
      return data.rate
    }
  } catch {
    // Miss DB
  }

  // 3. API Frankfurter
  try {
    const url = `${FRANKFURTER_BASE}/${dateStr}?from=${base}&to=${quote}`
    const res = await fetch(url, { next: { revalidate: 3600 } })

    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`)

    const json = (await res.json()) as { rates: Record<string, number> }
    const rate = json.rates[quote]

    if (rate === undefined) throw new Error(`No rate for ${quote}`)

    // Persister en DB
    const supabase = createServiceClient()
    await supabase.from('fx_rates').upsert({
      base_currency: base,
      quote_currency: quote,
      rate_date: dateStr,
      rate,
      source: 'frankfurter',
    })

    memFxCache.set(key, { rate, expiresAt: Date.now() + FX_TTL_MS })
    return rate
  } catch (e) {
    console.error(`[fx] Failed to fetch ${base}/${quote} for ${dateStr}:`, e)
    // Dernier recours : chercher la valeur la plus récente disponible en DB
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('fx_rates')
      .select('rate')
      .eq('base_currency', base)
      .eq('quote_currency', quote)
      .lte('rate_date', dateStr)
      .order('rate_date', { ascending: false })
      .limit(1)
      .single()

    if (data) return data.rate
    throw new Error(`No FX rate available for ${base}/${quote}`)
  }
}

/**
 * Convertit un montant d'une devise vers EUR (devise de référence).
 */
export async function toEur(amount: number, from: CurrencyCode, date?: Date): Promise<number> {
  if (from === 'EUR') return amount
  const rate = await getFxRate(from, 'EUR', date)
  return amount * rate
}
