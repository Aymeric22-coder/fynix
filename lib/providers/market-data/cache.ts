import { createServiceClient } from '@/lib/supabase/server'
import type { Quote } from './types'

const PRICE_TTL_MS = (parseInt(process.env.MARKET_PRICE_TTL_SECONDS ?? '900', 10)) * 1000

// Cache mémoire process (évite les appels DB répétés dans la même instance)
const memCache = new Map<string, { quote: Quote; expiresAt: number }>()

export async function getCachedQuote(ticker: string): Promise<Quote | null> {
  // 1. Cache mémoire
  const mem = memCache.get(ticker)
  if (mem && mem.expiresAt > Date.now()) return mem.quote

  // 2. Cache Supabase (market_price_cache)
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('market_price_cache')
      .select('*')
      .eq('ticker', ticker)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (data) {
      const quote: Quote = {
        ticker: data.ticker,
        price: data.price,
        currency: data.currency,
        change24h: data.change_24h,
        marketCap: data.market_cap,
        source: data.source,
        fetchedAt: new Date(data.fetched_at),
        confidence: 'high',
      }
      memCache.set(ticker, { quote, expiresAt: new Date(data.expires_at).getTime() })
      return quote
    }
  } catch {
    // Cache miss — continuer vers le provider
  }

  return null
}

export async function setCachedQuote(quote: Quote): Promise<void> {
  const expiresAt = new Date(Date.now() + PRICE_TTL_MS)

  // Cache mémoire
  memCache.set(quote.ticker, { quote, expiresAt: expiresAt.getTime() })

  // Persister en DB (upsert sur PK ticker)
  try {
    const supabase = createServiceClient()
    await supabase.from('market_price_cache').upsert({
      ticker: quote.ticker,
      price: quote.price,
      currency: quote.currency,
      change_24h: quote.change24h,
      market_cap: quote.marketCap,
      source: quote.source,
      fetched_at: quote.fetchedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
  } catch (e) {
    console.warn('[cache] Failed to persist quote to DB:', e)
  }
}

export async function getLastKnownPrice(ticker: string): Promise<Quote | null> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('market_price_cache')
      .select('*')
      .eq('ticker', ticker)
      .single()

    if (!data) return null

    return {
      ticker: data.ticker,
      price: data.price,
      currency: data.currency,
      change24h: data.change_24h,
      marketCap: data.market_cap,
      source: data.source,
      fetchedAt: new Date(data.fetched_at),
      confidence: 'low',  // données potentiellement périmées
    }
  } catch {
    return null
  }
}
