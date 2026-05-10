/**
 * Provider Boursorama — couvre les actifs Euronext / fonds français
 * que Yahoo ne référence pas correctement (notamment ETF Amundi PEA).
 *
 * Stratégie :
 *   1. Si on a déjà résolu un symbole interne Boursorama (`provider_id` sur
 *      l'instrument), on l'utilise directement → fetch /cours/<symbol>/
 *   2. Sinon, recherche par ISIN sur l'endpoint search → suit la redirection
 *      vers /cours/<symbol>/ → mémoriser le symbole pour les prochains
 *      refresh (TODO Phase 5 : update instrument.provider_id)
 *   3. Sinon, recherche par ticker brut.
 *
 * Parse HTML : le prix vit dans `data-ist-last="21.36"` sur l'élément
 * `<span class="c-instrument c-instrument--last">`. Selecteur stable
 * depuis plusieurs années. Si Boursorama change leur DOM, le provider
 * renvoie null et la chaîne de fallback (Yahoo, manual) prend le relais.
 *
 * Pas de clé API requise. Rate limit prudent : on cible 1-2 req/seconde max.
 */

import type { AssetClass, CurrencyCode } from '@/types/database.types'
import type { InstrumentLookup, PortfolioPriceProvider, PriceQuote } from './types'

const BASE        = 'https://www.boursorama.com'
const USER_AGENT  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const SUPPORTED: AssetClass[] = [
  'equity', 'etf', 'fund', 'reit', 'siic', 'opci', 'bond',
]

const KNOWN_CURRENCIES: Set<string> = new Set(['EUR','USD','GBP','CHF','JPY'])

function toCurrency(raw: string | null | undefined): CurrencyCode {
  const upper = (raw ?? 'EUR').toUpperCase()
  return KNOWN_CURRENCIES.has(upper) ? (upper as CurrencyCode) : 'EUR'
}

export class BoursoramaProvider implements PortfolioPriceProvider {
  readonly code = 'boursorama'

  supports(c: AssetClass): boolean {
    return SUPPORTED.includes(c)
  }

  async fetchQuote(instrument: InstrumentLookup): Promise<PriceQuote | null> {
    const symbol = await this.resolveSymbol(instrument)
    if (!symbol) return null

    return this.fetchQuoteBySymbol(symbol)
  }

  /**
   * Trouve le symbole interne Boursorama (ex: "1rTNKE") à partir d'un
   * provider_id déjà résolu, d'un ISIN, ou d'un ticker brut.
   */
  private async resolveSymbol(instrument: InstrumentLookup): Promise<string | null> {
    if (instrument.providerId) return instrument.providerId

    // Search par ISIN (le plus fiable pour les ETF européens)
    if (instrument.isin && instrument.isin.length >= 10) {
      const sym = await this.searchByQuery(instrument.isin)
      if (sym) return sym
    }

    // Fallback ticker
    if (instrument.ticker) {
      const sym = await this.searchByQuery(instrument.ticker)
      if (sym) return sym
    }

    return null
  }

  private async searchByQuery(query: string): Promise<string | null> {
    try {
      const url = `${BASE}/recherche/_instrument/?query=${encodeURIComponent(query)}`
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
        // Suit les redirections : pour un ISIN connu, Boursorama redirige
        // directement vers /cours/<symbol>/
      })
      if (!res.ok) return null

      // 1. Si Boursorama a redirigé vers /cours/<symbol>/, l'URL finale le contient
      const finalUrl = res.url
      const directMatch = finalUrl.match(/\/cours\/([^/?#]+)\/?/)
      if (directMatch && directMatch[1]) return directMatch[1]

      // 2. Sinon, on parse la page de résultats HTML pour le premier lien /cours/
      const html = await res.text()
      const linkMatch = html.match(/href="\/cours\/([^/"?#]+)\/?"/)
      if (linkMatch && linkMatch[1]) return linkMatch[1]

      return null
    } catch (e) {
      console.warn('[boursorama] searchByQuery failed:', e)
      return null
    }
  }

  private async fetchQuoteBySymbol(symbol: string): Promise<PriceQuote | null> {
    try {
      const res = await fetch(`${BASE}/cours/${encodeURIComponent(symbol)}/`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      })
      if (!res.ok) return null
      const html = await res.text()

      // Extraction du prix : Boursorama embarque le dernier cours dans
      // `data-ist-last="21.36"` (élément c-instrument--last).
      const priceMatch = html.match(/data-ist-last="([0-9.,]+)"/)
      if (!priceMatch || !priceMatch[1]) return null

      const price = parseFloat(priceMatch[1].replace(',', '.'))
      if (!isFinite(price) || price <= 0) return null

      // Devise : data-ist-currency="EUR"
      const currencyMatch = html.match(/data-ist-currency="([A-Z]{3})"/)
      const currency      = toCurrency(currencyMatch?.[1])

      return {
        query:      symbol,
        price,
        currency,
        pricedAt:   new Date(),
        source:     'boursorama',
        confidence: 'high',
      }
    } catch (e) {
      console.warn(`[boursorama] fetchQuoteBySymbol(${symbol}) failed:`, e)
      return null
    }
  }
}
