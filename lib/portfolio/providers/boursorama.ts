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
    // Stratégie : on lance directement /recherche/?query=<ISIN ou ticker>.
    // Si Boursorama reconnaît l'identifiant, il redirige vers la fiche
    // canonique (/bourse/trackers/cours/<symbol>/ ou /bourse/action/cours/...).
    // On parse alors le HTML obtenu pour le prix.
    const queries: string[] = []
    if (instrument.providerId) queries.push(instrument.providerId)
    if (instrument.isin && instrument.isin.length >= 10) queries.push(instrument.isin)
    if (instrument.ticker)     queries.push(instrument.ticker)

    for (const q of queries) {
      const result = await this.searchAndParse(q)
      if (result) return result
    }
    return null
  }

  private async searchAndParse(query: string): Promise<PriceQuote | null> {
    try {
      const url = `${BASE}/recherche/?query=${encodeURIComponent(query)}`
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      })
      if (!res.ok) {
        console.warn(`[boursorama] search ${query} HTTP ${res.status}`)
        return null
      }

      const finalUrl = res.url
      const html     = await res.text()

      // L'URL finale doit contenir `/cours/` pour qu'on soit sur une fiche cotation
      const symMatch = finalUrl.match(/\/cours\/([^/?#]+)\/?/)
      if (!symMatch) {
        // On est resté sur la page de résultats — pas de match exact
        return null
      }
      const symbol = symMatch[1]!

      const parsed = this.parsePrice(html)
      if (!parsed) {
        console.warn(`[boursorama] price parse failed for ${query} (resolved=${symbol})`)
        return null
      }

      return {
        query:      symbol,
        price:      parsed.price,
        currency:   parsed.currency,
        pricedAt:   new Date(),
        source:     'boursorama',
        confidence: 'high',
      }
    } catch (e) {
      console.warn(`[boursorama] searchAndParse(${query}) failed:`, e)
      return null
    }
  }

  /**
   * Extrait le prix et la devise depuis le HTML d'une fiche cotation Boursorama.
   *
   * Boursorama 2024+ : le prix est dans <h1>99,0900 EUR</h1> sur la fiche
   * principale. On accepte plusieurs formats au cas où la page change :
   *   - `<h1>99,0900 EUR</h1>` (format actuel)
   *   - `data-ist-last="..."` (ancien format, conservé en fallback)
   */
  private parsePrice(html: string): { price: number; currency: CurrencyCode } | null {
    // Format 1 : <h1>99,0900 EUR</h1> (ETF, fonds, actions Boursorama 2024+)
    const h1Match = html.match(/<h1[^>]*>\s*([0-9][0-9 ]*[.,][0-9]+)\s*([A-Z]{3})\s*<\/h1>/)
    if (h1Match && h1Match[1] && h1Match[2]) {
      const raw   = h1Match[1].replace(/\s/g, '').replace(',', '.')
      const price = parseFloat(raw)
      if (isFinite(price) && price > 0) {
        return { price, currency: toCurrency(h1Match[2]) }
      }
    }

    // Format 2 (legacy) : data-ist-last="21.36" data-ist-currency="EUR"
    const lastMatch = html.match(/data-ist-last="([0-9.,]+)"/)
    if (lastMatch && lastMatch[1]) {
      const price = parseFloat(lastMatch[1].replace(',', '.'))
      if (isFinite(price) && price > 0) {
        const currMatch = html.match(/data-ist-currency="([A-Z]{3})"/)
        return { price, currency: toCurrency(currMatch?.[1]) }
      }
    }

    return null
  }
}
