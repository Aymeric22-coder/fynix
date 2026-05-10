/**
 * Adaptateur CoinGecko pour les cryptomonnaies.
 *
 * Free tier : pas de clé API requise (rate limit 10-30 req/min).
 * Documentation : https://www.coingecko.com/en/api/documentation
 *
 * Utilisation :
 *   - instrument.providerId = id CoinGecko (ex: "bitcoin", "ethereum")
 *   - fallback : instrument.ticker en lowercase si providerId null
 */

import type { AssetClass, CurrencyCode } from '@/types/database.types'
import type { InstrumentLookup, PortfolioPriceProvider, PriceQuote } from './types'

const BASE_URL = 'https://api.coingecko.com/api/v3'
const SUPPORTED: AssetClass[] = ['crypto', 'defi']

export class CoinGeckoProvider implements PortfolioPriceProvider {
  readonly code = 'coingecko'

  constructor(private apiKey?: string) {}

  supports(assetClass: AssetClass): boolean {
    return SUPPORTED.includes(assetClass)
  }

  async fetchQuote(instrument: InstrumentLookup): Promise<PriceQuote | null> {
    const id = instrument.providerId ?? instrument.ticker?.toLowerCase()
    if (!id) return null

    try {
      const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur,usd&include_last_updated_at=true`
      const res = await fetch(url, {
        headers: this.apiKey
          ? { 'x-cg-demo-api-key': this.apiKey }
          : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      if (!res.ok) return null

      const data = (await res.json()) as Record<
        string,
        { eur?: number; usd?: number; last_updated_at?: number }
      >

      const entry = data[id]
      if (!entry) return null

      // On préfère EUR ; fallback USD
      const eur = entry.eur
      const usd = entry.usd
      if (eur === undefined && usd === undefined) return null

      const price    = (eur ?? usd)!
      const currency: CurrencyCode = eur !== undefined ? 'EUR' : 'USD'
      const pricedAt = entry.last_updated_at
        ? new Date(entry.last_updated_at * 1000)
        : new Date()

      return {
        query:      id,
        price,
        currency,
        pricedAt,
        source:     'coingecko',
        confidence: 'high',
      }
    } catch (e) {
      console.warn(`[coingecko] fetchQuote(${id}) failed:`, e)
      return null
    }
  }
}
