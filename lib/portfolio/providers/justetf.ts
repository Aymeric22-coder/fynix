/**
 * Provider JustETF — source primaire pour les ETF cotés en Europe.
 *
 * Endpoint JSON public, pas de clé API requise :
 *   https://www.justetf.com/api/etfs/{ISIN}/quote?locale=en&currency={CUR}&isin={ISIN}
 *
 * Réponse :
 *   {
 *     "latestQuote":      { "raw": 121.05, "localized": "121.05" },
 *     "latestQuoteDate":  "2026-05-15",
 *     "previousQuote":    { "raw": 122.00, ... },
 *     "previousQuoteDate":"2026-05-14",
 *     "dtdPrc":           { "raw": -0.78, ... },
 *     "dtdAmt":           { "raw": -0.95, ... },
 *     "quoteTradingVenue":"XETRA",
 *     "quoteLowHigh":     { ... }
 *   }
 *
 * Pourquoi JustETF en priorité haute pour les ETF :
 *   - Une référence ETF européenne consolidée par ISIN (un seul code, pas
 *     besoin de jongler entre les suffixes Yahoo .PA / .DE / .AS / .L).
 *   - Prix NAV ou marché XETRA selon le tradingVenue, plus stable que
 *     Boursorama pour les ETF non-Euronext.
 *   - Données calées sur la devise demandée → on évite les conversions FX.
 *
 * Limites :
 *   - Couvre uniquement les ETF (asset_class='etf'). Pas d'action, pas de fonds.
 *   - Requiert un ISIN valide. Sans ISIN, on n'essaie même pas.
 */

import type { AssetClass, CurrencyCode } from '@/types/database.types'
import type { InstrumentLookup, PortfolioPriceProvider, PriceQuote } from './types'

const BASE = 'https://www.justetf.com/api/etfs'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TIMEOUT_MS = 8000

const SUPPORTED: AssetClass[] = ['etf']
const KNOWN_CURRENCIES: Set<string> = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY'])

function toCurrency(raw: string | null | undefined): CurrencyCode {
  const upper = (raw ?? 'EUR').toUpperCase()
  return KNOWN_CURRENCIES.has(upper) ? (upper as CurrencyCode) : 'EUR'
}

/** Format strict de la réponse JustETF (champs qu'on utilise). */
export interface JustEtfQuoteResponse {
  latestQuote?:      { raw?: number; localized?: string }
  latestQuoteDate?:  string  // "YYYY-MM-DD"
  quoteTradingVenue?: string
}

/**
 * Parse une réponse JSON JustETF en quote interne.
 * Exporté pour les tests.
 */
export function parseJustEtfQuote(
  body:     JustEtfQuoteResponse,
  currency: CurrencyCode,
): { price: number; currency: CurrencyCode; pricedAt: Date } | null {
  const raw = body?.latestQuote?.raw
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null

  // Date : si latestQuoteDate est fourni (YYYY-MM-DD), on l'utilise à midi UTC
  // pour éviter les surprises de fuseau. Sinon now().
  let pricedAt = new Date()
  if (body.latestQuoteDate && /^\d{4}-\d{2}-\d{2}$/.test(body.latestQuoteDate)) {
    const d = new Date(`${body.latestQuoteDate}T12:00:00Z`)
    if (!isNaN(d.getTime())) pricedAt = d
  }

  return { price: raw, currency, pricedAt }
}

export class JustEtfProvider implements PortfolioPriceProvider {
  readonly code = 'justetf'

  supports(c: AssetClass): boolean {
    return SUPPORTED.includes(c)
  }

  async fetchQuote(instrument: InstrumentLookup): Promise<PriceQuote | null> {
    // JustETF est indexé par ISIN exclusivement.
    const isin = instrument.isin?.trim()
    if (!isin || isin.length < 10) return null

    // Currency cible : on demande dans la devise de l'instrument quand
    // c'est connu, sinon EUR par défaut.
    const currency = toCurrency(null)
    const url =
      `${BASE}/${encodeURIComponent(isin)}/quote` +
      `?locale=en&currency=${currency}&isin=${encodeURIComponent(isin)}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept':     'application/json',
        },
        signal: controller.signal,
      })
      if (!res.ok) {
        console.warn(`[justetf] HTTP ${res.status} for ${isin}`)
        return null
      }

      const json = (await res.json()) as JustEtfQuoteResponse
      const parsed = parseJustEtfQuote(json, currency)
      if (!parsed) {
        console.warn(`[justetf] empty quote for ${isin}`)
        return null
      }

      return {
        query:      isin,
        price:      parsed.price,
        currency:   parsed.currency,
        pricedAt:   parsed.pricedAt,
        source:     'justetf',
        confidence: 'high',
      }
    } catch (e) {
      console.warn(`[justetf] fetch(${isin}) failed:`, e)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
