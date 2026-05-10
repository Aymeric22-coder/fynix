/* eslint-disable @typescript-eslint/no-explicit-any */
import yahooFinance from 'yahoo-finance2'
import { format } from 'date-fns'
import type { MarketProvider, Quote, OHLCV } from './types'
import type { CurrencyCode } from '@/types/database.types'

// yahoo-finance2 v2 : on caste en `any` pour contourner les écarts de types
// entre l'instance par défaut et les surcharges internes de la lib.
const yf = yahooFinance as any

const KNOWN_CURRENCIES: Set<string> = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'BTC', 'ETH'])

function toCurrency(raw: string | undefined): CurrencyCode {
  const upper = (raw ?? 'USD').toUpperCase()
  return KNOWN_CURRENCIES.has(upper) ? (upper as CurrencyCode) : 'USD'
}

// Suffixes Yahoo Finance pour les places européennes / étrangères courantes.
// Ordre de tentative quand le ticker brut ne renvoie rien.
const FALLBACK_SUFFIXES = ['.PA', '.AS', '.MI', '.DE', '.MC', '.L', '.SW', '.BR', '.LS']

async function tryQuote(ticker: string): Promise<{ ticker: string; raw: any } | null> {
  try {
    const result = await yf.quote(ticker, {}, { validateResult: false })
    if (result && result.regularMarketPrice !== undefined) {
      return { ticker, raw: result }
    }
  } catch {
    /* swallow */
  }
  return null
}

/**
 * Résout un ticker de manière robuste :
 *   1. Tente le ticker tel quel
 *   2. Si pas de point dans le ticker, tente avec les suffixes européens
 *   3. Si un ISIN est fourni, utilise yf.search(isin) pour trouver le bon symbole
 */
async function resolveTicker(
  rawTicker: string,
  isin?: string,
): Promise<{ ticker: string; raw: any } | null> {
  // 1. Tentative directe
  const direct = await tryQuote(rawTicker)
  if (direct) return direct

  // 2. Suffixes européens si le ticker n'a pas déjà de point
  if (!rawTicker.includes('.')) {
    for (const suffix of FALLBACK_SUFFIXES) {
      const tried = await tryQuote(rawTicker + suffix)
      if (tried) return tried
    }
  }

  // 3. Lookup par ISIN via yf.search
  if (isin && isin.length >= 8) {
    try {
      const search = await yf.search(isin, { quotesCount: 5, newsCount: 0 })
      const quotes = (search?.quotes ?? []) as any[]
      for (const q of quotes) {
        if (q.symbol) {
          const tried = await tryQuote(q.symbol)
          if (tried) return tried
        }
      }
    } catch {
      /* swallow */
    }
  }

  return null
}

export class YahooFinanceProvider implements MarketProvider {
  getName() { return 'yahoo' }

  async isAvailable(): Promise<boolean> {
    try {
      await yf.quote('AAPL', {}, { validateResult: false })
      return true
    } catch {
      return false
    }
  }

  /**
   * Récupère une cotation. Tolère les tickers Euronext sans suffixe (NKT4 →
   * essaie NKT4, puis NKT4.PA, puis fallback ISIN si fourni).
   */
  async getQuote(ticker: string, isin?: string): Promise<Quote | null> {
    const resolved = await resolveTicker(ticker, isin)
    if (!resolved) {
      console.warn(`[yahoo] getQuote(${ticker}, isin=${isin ?? '—'}) : aucun symbole résolu`)
      return null
    }

    const result = resolved.raw
    return {
      ticker:     resolved.ticker,    // on remonte le ticker effectivement résolu
      price:      result.regularMarketPrice,
      currency:   toCurrency(result.currency),
      change24h:  result.regularMarketChangePercent ?? null,
      marketCap:  result.marketCap ?? null,
      source:     'yahoo',
      fetchedAt:  new Date(),
      confidence: 'high',
    }
  }

  async getHistory(ticker: string, from: Date, to: Date): Promise<OHLCV[]> {
    try {
      const results = await yf.historical(
        ticker,
        { period1: from, period2: to, interval: '1d' },
        { validateResult: false },
      )

      return (results as any[]).map((r: any) => ({
        date:   format(new Date(r.date), 'yyyy-MM-dd'),
        open:   r.open  ?? r.close,
        high:   r.high  ?? r.close,
        low:    r.low   ?? r.close,
        close:  r.close,
        volume: r.volume ?? null,
      }))
    } catch (e) {
      console.warn(`[yahoo] getHistory(${ticker}) failed:`, e)
      return []
    }
  }
}
