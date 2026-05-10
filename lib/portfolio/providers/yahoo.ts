/**
 * Adaptateur Yahoo Finance pour le module Portefeuille.
 *
 * Réutilise le YahooFinanceProvider existant (lib/providers/market-data/yahoo.ts).
 * Couvre : actions, ETF, fonds, REIT, obligations cotées.
 */

import { YahooFinanceProvider } from '@/lib/providers/market-data/yahoo'
import type { AssetClass } from '@/types/database.types'
import type { InstrumentLookup, PortfolioPriceProvider, PriceQuote } from './types'

const SUPPORTED: AssetClass[] = ['equity', 'etf', 'fund', 'reit', 'bond', 'siic']

export class YahooPortfolioProvider implements PortfolioPriceProvider {
  readonly code = 'yahoo'
  private inner = new YahooFinanceProvider()

  supports(assetClass: AssetClass): boolean {
    return SUPPORTED.includes(assetClass)
  }

  async fetchQuote(instrument: InstrumentLookup): Promise<PriceQuote | null> {
    const ticker = instrument.providerId ?? instrument.ticker
    if (!ticker) return null

    // L'ISIN sert de fallback si le ticker brut n'est pas trouvé chez Yahoo
    const q = await this.inner.getQuote(ticker, instrument.isin ?? undefined)
    if (!q) return null

    return {
      query:      ticker,
      price:      q.price,
      currency:   q.currency,
      pricedAt:   q.fetchedAt,
      source:     'yahoo',
      confidence: q.confidence,
    }
  }
}
