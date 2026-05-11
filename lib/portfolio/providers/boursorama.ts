/**
 * Provider Boursorama — couvre les actifs Euronext / fonds français / SCPI
 * que Yahoo ne référence pas correctement.
 *
 * Stratégie :
 *   1. Recherche par providerId → ISIN → ticker → name (fallback ultime).
 *   2. /recherche/?query= redirige vers la fiche canonique
 *      /bourse/trackers/cours/... ou /bourse/action/cours/... ou
 *      /immobilier/scpi/cours/... selon le type d'actif.
 *   3. Parse extrait le prix selon plusieurs patterns (ETF, action, SCPI).
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
    // Ordre de résolution : providerId, ISIN, ticker, nom.
    // Le nom est indispensable pour les SCPI (codes AMF non-ISIN) et les
    // fonds dont l'ISIN n'est pas indexé par Boursorama.
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
      // /bourse/<type>/cours/<symbol>/ ou /immobilier/scpi/cours/<symbol>/
      const symMatch = finalUrl.match(/\/cours\/([^/?#]+)\/?/)
      if (!symMatch) return null
      const symbol = symMatch[1]!

      const parsed = parseBoursoramaHtml(html)
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
 * Patterns supportés (testés dans l'ordre) :
 *   - <span class="c-instrument c-instrument--last">99,09</span>  ← ETF, action
 *   - data-ist-last="..." (ancien format, fallback)
 *   - "Prix de souscription YYYY ... XXX EUR" ← fiche SCPI (peut traverser des balises HTML)
 *   - Pattern générique "NB EUR" (fallback ultime)
 */
export function parseBoursoramaHtml(html: string): { price: number; currency: CurrencyCode } | null {
  let priceMatch: RegExpMatchArray | null = null
  let detectedCurrency: CurrencyCode | null = null

  // 1. Pattern principal : class contenant c-instrument--last (ETF, action…)
  priceMatch = html.match(/class="[^"]*c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9  ]*[.,][0-9]+)/)

  // 2. Fallback : ordre des classes inversé
  if (!priceMatch) {
    priceMatch = html.match(/class="c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9  ]*[.,][0-9]+)/)
  }

  // 3. Fallback : data-ist-last="VALEUR" (ancien format)
  if (!priceMatch) {
    priceMatch = html.match(/data-ist-last="([0-9][0-9.,  ]*)"/)
  }

  // 4. Pattern SCPI : "Prix de souscription [annee] ... XXX EUR".
  //    Le prix peut être separe par des balises HTML (span, div…). On accepte
  //    tout caractère entre "Prix de souscription" et le montant final, dans
  //    une fenêtre limitée (250 chars) pour éviter de matcher un montant non
  //    lié plus loin dans la page.
  if (!priceMatch) {
    const scpi = html.match(
      /Prix de souscription[\s\S]{0,250}?([0-9][0-9  ]*(?:[.,][0-9]+)?)\s*(EUR|USD|GBP|CHF)/i,
    )
    if (scpi && scpi[1] && scpi[2]) {
      priceMatch       = [scpi[0], scpi[1]] as RegExpMatchArray
      detectedCurrency = toCurrency(scpi[2])
    }
  }

  // 5. Fallback ultime : "NB EUR" (peut faire un faux positif sur graphes)
  if (!priceMatch) {
    priceMatch = html.match(/>\s*([0-9][0-9  ]*[.,][0-9]{2,4})\s*<\/?\w*[^>]*>\s*EUR/)
  }

  if (!priceMatch || !priceMatch[1]) return null

  const raw   = priceMatch[1].replace(/[\s ]/g, '').replace(',', '.')
  const price = parseFloat(raw)
  if (!isFinite(price) || price <= 0) return null

  // Devise : déjà détectée pour SCPI, sinon c-instrument--currency, sinon EUR
  let currency = detectedCurrency
  if (!currency) {
    const currMatch =
      html.match(/class="[^"]*c-instrument--currency[^"]*"[^>]*>\s*([A-Z]{3})/) ||
      html.match(/class="c-instrument--currency[^"]*"[^>]*>\s*([A-Z]{3})/)
    currency = toCurrency(currMatch?.[1])
  }

  return { price, currency }
}
