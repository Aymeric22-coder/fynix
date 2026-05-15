/**
 * Wrapper Yahoo Finance pour récupérer secteur / industrie / pays /
 * description d'un instrument coté, via `quoteSummary` modules.
 *
 * Couvre 2 cas distincts :
 *
 *   1. **Action / EQUITY** : Yahoo renseigne `assetProfile.sector`,
 *      `assetProfile.industry`, `assetProfile.country` directement.
 *
 *   2. **ETF / Fund** : `assetProfile` est VIDE pour les fonds. On
 *      bascule sur :
 *        - `topHoldings.sectorWeightings` → secteur dominant (max %)
 *        - `summaryProfile.country`        → pays du gestionnaire (ex
 *          "Ireland" pour les UCITS irlandais)
 *        - `fundProfile.categoryName`      → label "Large Blend",
 *          "Sector - Technology"…  utilisé comme industry de fallback.
 *
 * Réutilise `yahoo-finance2` qui gère les cookies CSRF et la rotation
 * d'endpoints. À n'utiliser QUE côté serveur (Node only).
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
  /** Indique si le secteur a été déduit (ETF via topHoldings) plutôt que lu direct. */
  sector_inferred: boolean
  /** Payload brut pour stockage en isin_cache.raw_data. */
  raw:           unknown
}

/**
 * Extrait le secteur dominant d'un ETF depuis `topHoldings.sectorWeightings`.
 * Yahoo renvoie un tableau d'objets type `{ realestate: 0.05 }`, etc., un
 * key par objet — on cherche celui avec le poids max.
 *
 * @returns le libellé Yahoo en anglais (ex "Technology") déjà compatible
 *   avec `lib/analyse/sectorMapping.translateSector()`. Null si absent.
 */
function dominantSectorFromHoldings(topHoldings: any): string | null {
  const weights = topHoldings?.sectorWeightings
  if (!Array.isArray(weights) || weights.length === 0) return null

  // Map clé Yahoo (lowercase, snake-ish) → libellé GICS standard
  const KEY_TO_LABEL: Record<string, string> = {
    technology:            'Technology',
    healthcare:            'Healthcare',
    financial_services:    'Financial Services',
    financialservices:     'Financial Services',
    consumer_cyclical:     'Consumer Cyclical',
    consumercyclical:      'Consumer Cyclical',
    consumer_defensive:    'Consumer Defensive',
    consumerdefensive:     'Consumer Defensive',
    industrials:           'Industrials',
    basic_materials:       'Basic Materials',
    basicmaterials:        'Basic Materials',
    energy:                'Energy',
    utilities:             'Utilities',
    real_estate:           'Real Estate',
    realestate:            'Real Estate',
    communication_services:'Communication Services',
    communicationservices: 'Communication Services',
  }

  let bestKey: string | null = null
  let bestVal = 0
  for (const entry of weights) {
    if (entry && typeof entry === 'object') {
      for (const [k, v] of Object.entries(entry)) {
        const num = typeof v === 'number' ? v : Number((v as any)?.raw ?? NaN)
        if (isFinite(num) && num > bestVal) {
          bestVal = num
          bestKey = k.toLowerCase()
        }
      }
    }
  }
  if (!bestKey) return null
  return KEY_TO_LABEL[bestKey] ?? bestKey  // au pire, on renvoie la clé brute
}

/**
 * Récupère les modules d'analyse depuis Yahoo Finance pour un symbol donné.
 * Fait 2 appels séquentiels en cas d'échec du premier (assetProfile vide
 * → on retente avec uniquement les modules ETF).
 *
 * @param symbol Ticker au format Yahoo (ex: "AAPL", "BNP.PA", "IWDA.AS")
 * @returns enrichissement avec champs nullables. Renvoie null SEULEMENT si
 *   Yahoo ne reconnaît pas du tout le symbol.
 */
export async function fetchYahooEnrichment(symbol: string): Promise<YahooEnrichment | null> {
  const trimmed = symbol.trim()
  if (!trimmed) return null

  try {
    const result = await yf.quoteSummary(trimmed, {
      modules: [
        'assetProfile',
        'summaryProfile',
        'price',
        'defaultKeyStatistics',
        'topHoldings',
        'fundProfile',
      ],
    }, { validateResult: false })

    if (!result) return null

    const ap = result.assetProfile    ?? {}
    const sp = result.summaryProfile  ?? {}
    const p  = result.price           ?? {}
    const th = result.topHoldings     ?? {}
    const fp = result.fundProfile     ?? {}

    // 1) Sector : assetProfile (actions) → topHoldings.sectorWeightings (ETFs)
    let sector: string | null = ap.sector ?? sp.sector ?? null
    let sectorInferred = false
    if (!sector) {
      const inferred = dominantSectorFromHoldings(th)
      if (inferred) {
        sector = inferred
        sectorInferred = true
      }
    }

    // 2) Industry : assetProfile, sinon summaryProfile, sinon catégorie de fonds
    const industry =
      ap.industry ?? sp.industry ??
      (fp.categoryName as string | undefined) ?? null

    // 3) Country : assetProfile (actions) → summaryProfile (pays gestionnaire ETF)
    const country = ap.country ?? sp.country ?? null

    const currency = (p.currency ?? null) as string | null
    const exchange = (p.exchange ?? null) as string | null
    const longName = (p.longName ?? p.shortName ?? null) as string | null
    const summary  = (ap.longBusinessSummary ?? sp.longBusinessSummary ?? null) as string | null

    return {
      sector, industry, country, currency, exchange, longName,
      longBusinessSummary: summary,
      quoteType:    (p.quoteType ?? null) as string | null,
      currentPrice: typeof p.regularMarketPrice === 'number' ? p.regularMarketPrice : null,
      sector_inferred: sectorInferred,
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
