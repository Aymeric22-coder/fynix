/**
 * Wrapper Yahoo Finance pour récupérer secteur / industrie / pays /
 * description d'une action ou d'un ETF, via `quoteSummary` modules.
 *
 * Réutilise la dépendance `yahoo-finance2` déjà installée (cf. package.json).
 * L'avantage par rapport à un fetch direct sur query1.finance.yahoo.com :
 * la lib gère les cookies CSRF, la rotation d'endpoints, le retry, et
 * livre une typage strict des modules (assetProfile, summaryProfile…).
 *
 * À n'utiliser QUE côté serveur (Server Component, route handler) — la
 * lib n'est pas faite pour le navigateur (ESM Node + DNS lookups).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import yahooFinance from 'yahoo-finance2'

const yf = yahooFinance as any

export interface YahooEnrichment {
  sector:        string | null
  industry:      string | null
  country:       string | null
  currency:      string | null
  exchange:      string | null
  longName:      string | null
  longBusinessSummary: string | null
  /** Type Yahoo brut : 'EQUITY','ETF','MUTUALFUND','CRYPTOCURRENCY','INDEX'… */
  quoteType:     string | null
  /** Prix temps réel quand disponible. */
  currentPrice:  number | null
  /** Payload brut pour stockage en isin_cache.raw_data. */
  raw:           unknown
}

/**
 * Récupère les modules d'analyse depuis Yahoo Finance pour un symbol donné.
 *
 * @param symbol Ticker au format Yahoo (ex: "AAPL", "BNP.PA", "IWDA.AS")
 * @returns enrichissement avec champs nullables. Renvoie null si Yahoo
 *   ne reconnaît pas le symbol.
 */
export async function fetchYahooEnrichment(symbol: string): Promise<YahooEnrichment | null> {
  const trimmed = symbol.trim()
  if (!trimmed) return null

  try {
    const result = await yf.quoteSummary(trimmed, {
      modules: ['assetProfile', 'summaryProfile', 'price', 'defaultKeyStatistics'],
    }, { validateResult: false })

    if (!result) return null

    const ap = result.assetProfile    ?? {}
    const sp = result.summaryProfile  ?? {}
    const p  = result.price           ?? {}

    // assetProfile prend la priorité (rempli pour les actions cotées),
    // summaryProfile sert de fallback (parfois mieux rempli pour ETFs).
    const sector   = ap.sector   ?? sp.sector   ?? null
    const industry = ap.industry ?? sp.industry ?? null
    const country  = ap.country  ?? sp.country  ?? null

    const currency = (p.currency ?? null) as string | null
    const exchange = (p.exchange ?? null) as string | null
    const longName = (p.longName ?? p.shortName ?? null) as string | null
    const summary  = (ap.longBusinessSummary ?? sp.longBusinessSummary ?? null) as string | null

    return {
      sector, industry, country, currency, exchange, longName,
      longBusinessSummary: summary,
      quoteType:    (p.quoteType ?? null) as string | null,
      currentPrice: typeof p.regularMarketPrice === 'number' ? p.regularMarketPrice : null,
      raw:          result,
    }
  } catch (e) {
    console.warn(`[yahooQuoteSummary] échec ${symbol}:`, (e as Error).message)
    return null
  }
}

/**
 * Heuristique simple : Yahoo `quoteType` → asset_type interne du module Analyse.
 */
export function quoteTypeToAssetType(qt: string | null): 'stock' | 'etf' | 'crypto' | 'bond' | 'unknown' {
  switch ((qt ?? '').toUpperCase()) {
    case 'EQUITY':         return 'stock'
    case 'ETF':            return 'etf'
    case 'MUTUALFUND':     return 'etf'        // assimilé ETF côté analyse pour l'agrégat sectoriel
    case 'CRYPTOCURRENCY': return 'crypto'
    case 'BOND':           return 'bond'
    default:               return 'unknown'
  }
}
