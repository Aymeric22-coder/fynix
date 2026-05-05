import type { CurrencyCode } from '@/types/database.types'

export interface Quote {
  ticker: string
  price: number
  currency: CurrencyCode
  change24h: number | null
  marketCap: number | null
  source: string
  fetchedAt: Date
  confidence: 'high' | 'medium' | 'low'
}

export interface OHLCV {
  date: string       // yyyy-MM-dd
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface MarketProvider {
  getName(): string
  isAvailable(): Promise<boolean>
  getQuote(ticker: string): Promise<Quote | null>
  getHistory(ticker: string, from: Date, to: Date): Promise<OHLCV[]>
}
