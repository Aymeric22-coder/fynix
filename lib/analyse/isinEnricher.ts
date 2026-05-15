/**
 * Service d'enrichissement ISIN — chaîne complète :
 *
 *   1. Lookup `isin_cache` Supabase (TTL 24h)
 *   2. Si miss/expiré : OpenFIGI (résolveur d'identité, ticker)
 *   3. Yahoo Finance via `yf.search(isin)` puis `quoteSummary` modules
 *      (assetProfile/summaryProfile/price) → secteur, pays, etc.
 *   4. Upsert dans `isin_cache`
 *   5. Retour de l'ISINData consolidé
 *
 * Heuristiques :
 *   - SCPI françaises (FR0…) : OpenFIGI ne les connaît pas, Yahoo non plus.
 *     On retombe sur asset_type='scpi', country='France', sector='Real Estate'
 *     et on grise les autres champs.
 *   - Crypto : si Yahoo renvoie quoteType='CRYPTOCURRENCY' on bascule sur
 *     asset_type='crypto'.
 *   - ISIN inconnu partout : on retourne ISINData minimal (asset_type='unknown')
 *     pour ne JAMAIS planter le caller.
 *
 * À n'utiliser QUE côté serveur (route API ou Server Component) — la lib
 * `yahoo-finance2` est marquée serverExternalPackages dans next.config.ts.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import yahooFinance from 'yahoo-finance2'
import { createServerClient } from '@/lib/supabase/server'
import { resolveFigi, selectBestMatch, type FigiMatch } from '@/lib/portfolio/providers/openfigi'
import {
  fetchYahooEnrichment, quoteTypeToAssetType, type YahooEnrichment,
} from './yahooQuoteSummary'
import type { ISINData, AnalyseAssetType } from '@/types/analyse'

const yf = yahooFinance as any

/** TTL réécrit en millisecondes pour les comparaisons côté code (24h). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Map OpenFIGI exchCode → suffixe Yahoo Finance.
 * Couverture pragmatique des places les plus courantes pour un PEA / CTO français.
 */
const EXCH_TO_YAHOO_SUFFIX: Record<string, string> = {
  FP: '.PA',  // Paris
  LN: '.L',   // London
  GR: '.DE',  // Frankfurt (Xetra)
  GY: '.DE',
  NA: '.AS',  // Amsterdam
  IM: '.MI',  // Milan
  SM: '.MC',  // Madrid
  SW: '.SW',  // Swiss
  BB: '.BR',  // Brussels
  PL: '.LS',  // Lisbon
  // US (UN, UQ, UA…) → pas de suffixe Yahoo
}

/**
 * Construit un symbol Yahoo à partir d'un FigiMatch en appliquant le
 * suffixe d'exchange si nécessaire. Renvoie null si pas de ticker.
 */
function figiToYahooSymbol(match: FigiMatch): string | null {
  if (!match.ticker) return null
  const suffix = match.exchCode ? EXCH_TO_YAHOO_SUFFIX[match.exchCode] : ''
  return suffix ? `${match.ticker}${suffix}` : match.ticker
}

/**
 * Cherche un symbol via Yahoo `yf.search(isin)`. Retourne le 1er résultat
 * dont le champ `symbol` est défini.
 */
async function searchYahooSymbolByIsin(isin: string): Promise<string | null> {
  try {
    const res = await yf.search(isin, { quotesCount: 5, newsCount: 0 })
    const quotes = (res?.quotes ?? []) as Array<{ symbol?: string }>
    const first = quotes.find((q) => q.symbol)
    return first?.symbol ?? null
  } catch {
    return null
  }
}

/**
 * Détecte les SCPI françaises par leur ISIN (FR0… avec heuristique).
 * Toutes les SCPI françaises ont un code AMF préfixé FR001 (longueur 12).
 * On sera prudent et on accepte tout FR0 → on laisse Yahoo / OpenFIGI
 * tenter, mais si tout échoue on tombera sur le fallback SCPI.
 */
function isProbablyFrenchScpi(
  isin:    string,
  figi:    FigiMatch | null,
  yahoo:   YahooEnrichment | null,
): boolean {
  if (figi || yahoo) return false  // l'un ou l'autre a répondu → pas une SCPI inconnue
  return /^FR\d{10}$/.test(isin)
}

/**
 * Petit helper pour timestamp ISO actuel — extrait pour faciliter les tests
 * (mock possible si on injecte une horloge).
 */
function nowIso(): string {
  return new Date().toISOString()
}

interface CacheRow {
  isin:             string
  symbol:           string | null
  name:             string | null
  asset_type:       string | null
  sector:           string | null
  industry:         string | null
  country:          string | null
  currency:         string | null
  exchange:         string | null
  current_price:    number | null
  cached_at:        string
  cache_expires_at: string
  raw_data:         unknown
}

function rowToData(row: CacheRow): ISINData {
  return {
    isin:          row.isin,
    symbol:        row.symbol,
    name:          row.name ?? row.isin,
    asset_type:    (row.asset_type as AnalyseAssetType) ?? 'unknown',
    sector:        row.sector,
    industry:      row.industry,
    country:       row.country,
    currency:      row.currency ?? 'EUR',
    exchange:      row.exchange,
    current_price: row.current_price !== null ? Number(row.current_price) : null,
    cached_at:     row.cached_at,
  }
}

/**
 * Récupère depuis le cache une ligne ISIN si elle existe et n'a pas expiré.
 */
export async function getCachedIsin(isin: string): Promise<ISINData | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('isin_cache')
    .select('*')
    .eq('isin', isin)
    .maybeSingle()
  if (error || !data) return null
  const expiresAt = new Date(data.cache_expires_at as string).getTime()
  if (isFinite(expiresAt) && expiresAt < Date.now()) return null
  return rowToData(data as CacheRow)
}

/**
 * Upsert le cache. Le `cache_expires_at` est recalculé côté serveur via
 * `NOW() + 24h` mais on l'écrit explicitement pour éviter l'aller-retour
 * "défaut DB → relecture".
 */
async function upsertCache(data: ISINData, raw: unknown): Promise<void> {
  const supabase = await createServerClient()
  const expires = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  const { error } = await supabase
    .from('isin_cache')
    .upsert({
      isin:             data.isin,
      symbol:           data.symbol,
      name:             data.name,
      asset_type:       data.asset_type,
      sector:           data.sector,
      industry:         data.industry,
      country:          data.country,
      currency:         data.currency,
      exchange:         data.exchange,
      current_price:    data.current_price,
      raw_data:         raw,
      cached_at:        data.cached_at,
      cache_expires_at: expires,
    }, { onConflict: 'isin' })
  if (error) console.warn(`[isinEnricher] upsert cache failed for ${data.isin}:`, error.message)
}

/**
 * Point d'entrée principal : enrichit un ISIN. JAMAIS de throw, toujours
 * un ISINData en retour (au minimum 'unknown' si tout échoue).
 */
export async function enrichISIN(isin: string): Promise<ISINData> {
  const norm = isin.trim().toUpperCase()

  // 1. Cache hit
  const cached = await getCachedIsin(norm)
  if (cached) {
    console.log(`[isinEnricher] cache HIT  ${norm}`)
    return cached
  }
  console.log(`[isinEnricher] cache MISS ${norm}`)

  // 2. OpenFIGI
  const figiMatches = await resolveFigi('ID_ISIN', norm).catch(() => null)
  const figi        = figiMatches ? selectBestMatch(figiMatches) : null
  if (figi) console.log(`[isinEnricher] FIGI ${norm} → ${figi.ticker} (${figi.exchCode ?? '—'}) ${figi.securityType ?? ''}`)

  // 3. Yahoo : on tente d'abord le symbole déduit du FIGI, sinon yf.search(isin).
  let yahooSymbol: string | null = figi ? figiToYahooSymbol(figi) : null
  let yahoo:       YahooEnrichment | null = null
  if (yahooSymbol) {
    yahoo = await fetchYahooEnrichment(yahooSymbol)
    if (yahoo) console.log(`[isinEnricher] Yahoo ${yahooSymbol} ✓ (${yahoo.quoteType})`)
  }
  if (!yahoo) {
    const fallbackSym = await searchYahooSymbolByIsin(norm)
    if (fallbackSym && fallbackSym !== yahooSymbol) {
      yahooSymbol = fallbackSym
      yahoo       = await fetchYahooEnrichment(fallbackSym)
      if (yahoo) console.log(`[isinEnricher] Yahoo fallback ${fallbackSym} ✓`)
    }
  }

  // 4. Détermination de l'asset_type
  let assetType: AnalyseAssetType = 'unknown'
  if (yahoo?.quoteType) {
    assetType = quoteTypeToAssetType(yahoo.quoteType)
  } else if (figi?.securityType) {
    const st = figi.securityType.toLowerCase()
    if (st.includes('etp') || st.includes('etf'))             assetType = 'etf'
    else if (st.includes('mutual fund'))                      assetType = 'etf'
    else if (st.includes('common stock') || st.includes('equity')) assetType = 'stock'
    else if (st.includes('bond') || st.includes('note'))      assetType = 'bond'
    else if (st.includes('crypto'))                           assetType = 'crypto'
  }

  // 5. Cas particulier SCPI française : OpenFIGI/Yahoo blank → on annote.
  if (assetType === 'unknown' && isProbablyFrenchScpi(norm, figi, yahoo)) {
    assetType = 'scpi'
  }

  // 6. Construction de l'ISINData
  const data: ISINData = {
    isin:          norm,
    symbol:        yahooSymbol,
    name:          yahoo?.longName ?? figi?.name ?? norm,
    asset_type:    assetType,
    sector:        yahoo?.sector  ?? (assetType === 'scpi' ? 'Real Estate' : null),
    industry:      yahoo?.industry ?? null,
    country:       yahoo?.country ?? (assetType === 'scpi' ? 'France' : null),
    currency:      yahoo?.currency ?? (assetType === 'scpi' ? 'EUR' : 'EUR'),
    exchange:      yahoo?.exchange ?? figi?.exchCode ?? null,
    current_price: yahoo?.currentPrice ?? null,
    cached_at:     nowIso(),
  }

  // 7. Persistance (best-effort, ne plante jamais le caller)
  await upsertCache(data, { figi, yahoo: yahoo?.raw ?? null }).catch(() => null)

  return data
}
