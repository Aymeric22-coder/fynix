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

  private parsePrice(html: string): { price: number; currency: CurrencyCode } | null {
    return parseBoursoramaHtml(html)
  }
}

/**
 * Extrait le prix et la devise depuis le HTML d'une fiche cotation Boursorama.
 * Exposé en top-level pour pouvoir être unit-testé.
 *
 * Format Boursorama 2024 (vérifié en prod) :
 *   <span class="c-instrument c-instrument--last" data-ist-last>99,09</span>
 *   <span class="c-instrument c-instrument--currency">EUR</span>
 *
 * Note : `data-ist-last` est présent SANS valeur (attribut vide), le contenu
 * du span lui-même porte le prix. La virgule française est convertie en
 * point pour parseFloat. Espaces (séparateurs de milliers) supprimés.
 */
export function parseBoursoramaHtml(html: string): { price: number; currency: CurrencyCode } | null {
  // Plusieurs patterns testés dans l'ordre, premier match gagne :

  // 1. Pattern principal : class contenant c-instrument--last
  let priceMatch = html.match(
    /class="[^"]*c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9   ]*[.,][0-9]+)/,
  )

  // 2. Fallback : ordre des classes inversé (Boursorama varie parfois)
  if (!priceMatch) {
    priceMatch = html.match(
      /class="c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9   ]*[.,][0-9]+)/,
    )
  }

  // 3. Fallback : data-ist-last avec valeur (ancien format)
  if (!priceMatch) {
    priceMatch = html.match(/data-ist-last="([0-9][0-9.,   ]*)"/)
  }

  // 4. Fallback ultime : regex avec PRIX suivi de "EUR" (peut faire un faux positif sur graphes)
  if (!priceMatch) {
    priceMatch = html.match(/>\s*([0-9][0-9   ]*[.,][0-9]{2,4})\s*<\/?\w*[^>]*>\s*EUR/)
  }

  if (!priceMatch || !priceMatch[1]) return null

  const raw   = priceMatch[1].replace(/[\s  ]/g, '').replace(',', '.')
  const price = parseFloat(raw)
  if (!isFinite(price) || price <= 0) return null

  // Devise : c-instrument--currency, fallback EUR (page française par défaut)
  const currMatch =
    html.match(/class="[^"]*c-instrument--currency[^"]*"[^>]*>\s*([A-Z]{3})/) ||
    html.match(/class="c-instrument--currency[^"]*"[^>]*>\s*([A-Z]{3})/)
  const currency = toCurrency(currMatch?.[1])

  return { price, currency }
}
