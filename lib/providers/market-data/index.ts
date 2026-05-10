// Point d'entrée unique pour les données de marché.
// Chaîne de résolution : Cache → Yahoo Finance → Dernier prix connu en DB.

import { YahooFinanceProvider } from './yahoo'
import { getCachedQuote, setCachedQuote, getLastKnownPrice } from './cache'
import type { Quote, OHLCV, MarketProvider } from './types'

// Providers actifs — ajouter Alpha Vantage, Polygon ici en Phase 2
const PRIMARY: MarketProvider = new YahooFinanceProvider()

export async function getQuote(ticker: string, isin?: string): Promise<Quote | null> {
  // 1. Cache (mémoire + DB)
  const cached = await getCachedQuote(ticker)
  if (cached) return cached

  // 2. Provider primaire (avec fallback ISIN si fourni)
  const quote = await PRIMARY.getQuote(ticker, isin)
  if (quote) {
    await setCachedQuote(quote)
    return quote
  }

  // 3. Fallback : dernière valeur connue en DB (confidence: low)
  const fallback = await getLastKnownPrice(ticker)
  if (fallback) {
    console.warn(`[market] Using stale price for ${ticker} (fallback)`)
    return fallback
  }

  return null
}

export async function getHistory(
  ticker: string,
  from: Date,
  to: Date,
): Promise<OHLCV[]> {
  const result = await PRIMARY.getHistory(ticker, from, to)
  return result
}

export type { Quote, OHLCV, MarketProvider }
