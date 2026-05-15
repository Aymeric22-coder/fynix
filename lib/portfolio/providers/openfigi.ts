/**
 * Client OpenFIGI — résolveur d'identité d'instrument.
 *
 * OpenFIGI (https://www.openfigi.com) est un service gratuit de Bloomberg
 * qui mappe ISIN / CUSIP / SEDOL / ticker vers un identifiant global FIGI
 * et expose les métadonnées riches : nom complet, ticker natif, place de
 * cotation, securityType (Common Stock / ETP / Mutual Fund / ...),
 * marketSector (Equity / Corp / Govt / Comdty / Curncy / ...).
 *
 * IMPORTANT : OpenFIGI ne renvoie PAS de prix. C'est un résolveur
 * d'identité uniquement, à utiliser EN AMONT des price providers
 * (Boursorama, Yahoo, CoinGecko) pour pré-remplir le formulaire et
 * réduire les ambiguïtés (ticker.PA vs ticker.AS, etc.).
 *
 * Rate limit :
 *   - sans clé API : 25 req/min, 5 jobs/requête, 10 mappings/job
 *   - avec clé API (gratuite sur openfigi.com) : 250 req/min, 100 jobs/req
 *
 * Conformité : pas de scraping, API publique documentée.
 */

const BASE_URL  = 'https://api.openfigi.com/v3'
const TIMEOUT_MS = 8000

export type FigiIdType =
  | 'ID_ISIN'
  | 'ID_CUSIP'
  | 'ID_SEDOL'
  | 'TICKER'
  | 'ID_BB_GLOBAL'   // FIGI

export interface FigiMatch {
  /** Identifiant global FIGI (12 chars). */
  figi:           string
  /** Nom complet de l'instrument. */
  name:           string
  /** Ticker natif sur la place principale. */
  ticker:         string
  /** Code place de cotation Bloomberg (ex: "FP"=Paris, "LN"=Londres, "US"). */
  exchCode:       string | null
  /** FIGI au niveau composite (entité). */
  compositeFIGI:  string | null
  /** Type de titre (ex: "Common Stock", "ETP", "Mutual Fund", "Crypto"). */
  securityType:   string | null
  /** Type fin (ex: "ADR", "REIT", "ETP Index Fund"). */
  securityType2:  string | null
  /** Secteur de marché (ex: "Equity", "Corp", "Govt", "Comdty", "Curncy"). */
  marketSector:   string | null
}

interface OpenFigiResponseItem {
  data?:    Array<{
    figi:           string
    name?:          string
    ticker?:        string
    exchCode?:      string
    compositeFIGI?: string
    securityType?:  string
    securityType2?: string
    marketSector?:  string
  }>
  error?:   string
  warning?: string
}

/**
 * Résout un ISIN (ou autre identifiant) via OpenFIGI.
 *
 * @param idType valeur de l'enum FigiIdType
 * @param idValue identifiant brut (ISIN sans tirets, ticker, etc.)
 * @param exchCode filtre optionnel sur la place (ex: "FP" pour Paris,
 *   utile quand un ISIN est listé sur plusieurs marchés)
 *
 * @returns tableau de matches (peut être vide), ou null en cas d'erreur
 *   réseau / quota / format invalide.
 */
export async function resolveFigi(
  idType:   FigiIdType,
  idValue:  string,
  exchCode?: string,
  apiKey?:  string,
): Promise<FigiMatch[] | null> {
  if (!idValue || idValue.length < 4) return null

  const body: Array<Record<string, string>> = [{ idType, idValue }]
  if (exchCode) body[0]!.exchCode = exchCode

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  }
  if (apiKey) headers['X-OPENFIGI-APIKEY'] = apiKey

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE_URL}/mapping`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      // 429 = rate limit, 4xx/5xx = autre erreur API
      console.warn(`[openfigi] ${idType}=${idValue} HTTP ${res.status}`)
      return null
    }

    const json = (await res.json()) as OpenFigiResponseItem[]
    const first = json[0]
    if (!first || first.error || !first.data) return []

    return first.data.map((d) => ({
      figi:          d.figi,
      name:          d.name          ?? '',
      ticker:        d.ticker        ?? '',
      exchCode:      d.exchCode      ?? null,
      compositeFIGI: d.compositeFIGI ?? null,
      securityType:  d.securityType  ?? null,
      securityType2: d.securityType2 ?? null,
      marketSector:  d.marketSector  ?? null,
    }))
  } catch (e) {
    clearTimeout(timer)
    console.warn(`[openfigi] ${idType}=${idValue} failed:`, e)
    return null
  }
}

/**
 * Helper : sélectionne le meilleur match parmi une liste OpenFIGI.
 *
 * Heuristique :
 *   1. Si un match a un ticker non vide ET un exchCode, privilégier
 *      celui-là (place de cotation primaire).
 *   2. Sinon, premier match.
 *   3. Si la liste est vide, null.
 *
 * Pour les ETF/fonds, OpenFIGI peut renvoyer plusieurs lignes (une par
 * place de cotation). On garde la première qui ressemble à une cotation
 * réelle.
 */
export function selectBestMatch(matches: FigiMatch[]): FigiMatch | null {
  if (matches.length === 0) return null

  const withTickerAndExchange = matches.find((m) => m.ticker && m.exchCode)
  if (withTickerAndExchange) return withTickerAndExchange

  const withTicker = matches.find((m) => m.ticker)
  if (withTicker) return withTicker

  return matches[0] ?? null
}
