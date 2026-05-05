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

  async getQuote(ticker: string): Promise<Quote | null> {
    try {
      const result = await yf.quote(ticker, {}, { validateResult: false })

      if (!result || result.regularMarketPrice === undefined) return null

      return {
        ticker,
        price:     result.regularMarketPrice,
        currency:  toCurrency(result.currency),
        change24h: result.regularMarketChangePercent ?? null,
        marketCap: result.marketCap ?? null,
        source:    'yahoo',
        fetchedAt: new Date(),
        confidence: 'high',
      }
    } catch (e) {
      console.warn(`[yahoo] getQuote(${ticker}) failed:`, e)
      return null
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
