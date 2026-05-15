/**
 * Provider Boursorama — couvre les actifs Euronext / fonds français / SCPI
 * que Yahoo ne référence pas correctement.
 *
 * Stratégie :
 *   1. Recherche par providerId → ISIN → ticker → name (fallback ultime).
 *   2. /recherche/?query= redirige vers la fiche canonique :
 *        - /bourse/trackers/cours/... ou /bourse/action/cours/... (ETF, action…)
 *        - /immobilier/scpi/cours/... (SCPI)
 *   3. Parse selon l'URL : parser SCPI dédié si /immobilier/scpi/, sinon
 *      parser standard. Cette séparation évite que les widgets de sidebar
 *      (qui contiennent des classes c-instrument--last pour d'autres titres)
 *      polluent le prix extrait pour les SCPI.
 *
 * Pas de clé API requise.
 */

import type { AssetClass, CurrencyCode } from '@/types/database.types'
import type { InstrumentLookup, PortfolioPriceProvider, PriceQuote } from './types'

const BASE        = 'https://www.boursorama.com'
const USER_AGENT  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const SUPPORTED: AssetClass[] = [
  'equity', 'etf', 'fund', 'reit', 'siic', 'opci', 'bond', 'scpi',
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
    const queries: string[] = []
    if (instrument.providerId)                              queries.push(instrument.providerId)
    if (instrument.isin && instrument.isin.length >= 10)    queries.push(instrument.isin)
    if (instrument.ticker)                                  queries.push(instrument.ticker)
    if (instrument.name)                                    queries.push(instrument.name)

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

      // L'URL finale doit contenir /cours/ : Boursorama a redirigé vers une fiche
      const symMatch = finalUrl.match(/\/cours\/([^/?#]+)\/?/)
      if (!symMatch) return null
      const symbol = symMatch[1]!

      // Choix du parser selon le type de fiche
      const isScpiPage = finalUrl.includes('/immobilier/scpi/')
      const parsed = isScpiPage
        ? parseScpiHtml(html)
        : parseStandardHtml(html)

      if (!parsed) {
        console.warn(`[boursorama] price parse failed for ${query} (resolved=${symbol}, scpi=${isScpiPage})`)
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
}

/**
 * Parser dédié aux fiches SCPI (URL /immobilier/scpi/cours/...).
 *
 * Structure HTML observée :
 *   <p class="c-list-info__heading">Prix de souscription 2025</p>
 *   <p class="c-list-info__value u-text-size-lg">204 EUR</p>
 *
 * On NE peut PAS utiliser c-instrument--last comme sur les ETF/actions car
 * la page SCPI contient des widgets sidebar (indices, autres SCPI, etc.) qui
 * ont aussi cette classe et fausseraient le prix.
 */
export function parseScpiHtml(html: string): { price: number; currency: CurrencyCode } | null {
  // Pattern strict : "Prix de souscription" dans un c-list-info__heading,
  // suivi (avec balises HTML entre) d'un c-list-info__value contenant XX EUR.
  // Tolérance de 500 chars pour absorber les retours à la ligne et indentations.
  const re = /c-list-info__heading[^>]*>\s*Prix de souscription[\s\S]{0,500}?c-list-info__value[^>]*>\s*([0-9][0-9 ]*(?:[.,][0-9]+)?)\s*(EUR|USD|GBP|CHF)/i
  const m = html.match(re)
  if (m && m[1] && m[2]) {
    const price = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'))
    if (isFinite(price) && price > 0) {
      return { price, currency: toCurrency(m[2]) }
    }
  }

  // Fallback : si la structure HTML change, regarde le tout premier
  // "Prix de souscription" et le prochain montant + devise dans un span/p.
  const fallback = html.match(
    /Prix de souscription[\s\S]{0,400}?>\s*([0-9][0-9 ]*(?:[.,][0-9]+)?)\s*(EUR|USD|GBP|CHF)/i,
  )
  if (fallback && fallback[1] && fallback[2]) {
    const price = parseFloat(fallback[1].replace(/\s/g, '').replace(',', '.'))
    if (isFinite(price) && price > 0) {
      return { price, currency: toCurrency(fallback[2]) }
    }
  }

  return null
}

/**
 * Parser pour fiches ETF / action / fonds (toutes sauf SCPI).
 *
 * Patterns observés :
 *   - <span class="c-instrument c-instrument--last">99,09</span>
 *   - data-ist-last="..." (legacy)
 */
export function parseStandardHtml(html: string): { price: number; currency: CurrencyCode } | null {
  let priceMatch: RegExpMatchArray | null = null

  // 1. Pattern principal : c-instrument--last
  priceMatch = html.match(/class="[^"]*c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9 ]*[.,][0-9]+)/)

  // 2. Fallback : ordre des classes inversé
  if (!priceMatch) {
    priceMatch = html.match(/class="c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9 ]*[.,][0-9]+)/)
  }

  // 3. Fallback : data-ist-last="VALEUR" (ancien format)
  if (!priceMatch) {
    priceMatch = html.match(/data-ist-last="([0-9][0-9.,]*)"/)
  }

  if (!priceMatch || !priceMatch[1]) return null

  const raw   = priceMatch[1].replace(/\s/g, '').replace(',', '.')
  const price = parseFloat(raw)
  if (!isFinite(price) || price <= 0) return null

  const currMatch =
    html.match(/class="[^"]*c-instrument--currency[^"]*"[^>]*>\s*([A-Z]{3})/) ||
    html.match(/class="c-instrument--currency[^"]*"[^>]*>\s*([A-Z]{3})/)
  const currency = toCurrency(currMatch?.[1])

  return { price, currency }
}

/**
 * Compatibilité ascendante : ancien parser unifié. Garde-le pour ne pas
 * casser les tests existants. Détecte heuristiquement si l'input contient
 * "c-list-info__heading" → SCPI, sinon standard.
 */
export function parseBoursoramaHtml(html: string): { price: number; currency: CurrencyCode } | null {
  if (/c-list-info__heading[^>]*>\s*Prix de souscription/i.test(html)) {
    return parseScpiHtml(html)
  }
  return parseStandardHtml(html)
}
