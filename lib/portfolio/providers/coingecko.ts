/**
 * Adaptateur CoinGecko pour les cryptomonnaies.
 *
 * Free tier : pas de clé API requise (rate limit 10-30 req/min).
 * Documentation : https://www.coingecko.com/en/api/documentation
 *
 * Résolution :
 *   1. Si `instrument.providerId` est défini → c'est déjà l'id CoinGecko
 *      (ex: "bitcoin", "ethereum"). On l'utilise directement.
 *   2. Sinon, on essaie de résoudre le ticker (ex: "BTC", "ETH",
 *      "BTC-EUR", "ETH/USD") via :
 *      a. Mapping rapide hardcodé pour les ~30 cryptos les plus courantes
 *         (évite un appel API supplémentaire).
 *      b. Fallback : appel /search?query= et match par symbole exact.
 */

import type { AssetClass, CurrencyCode } from '@/types/database.types'
import type { InstrumentLookup, PortfolioPriceProvider, PriceQuote } from './types'

const BASE_URL = 'https://api.coingecko.com/api/v3'
const SUPPORTED: AssetClass[] = ['crypto', 'defi']

// Mapping rapide ticker (uppercase) → id CoinGecko pour les cryptos courantes.
// Évite un round-trip /search pour les cas les plus fréquents.
const QUICK_ID_MAP: Record<string, string> = {
  BTC:   'bitcoin',
  ETH:   'ethereum',
  BNB:   'binancecoin',
  XRP:   'ripple',
  ADA:   'cardano',
  SOL:   'solana',
  DOT:   'polkadot',
  DOGE:  'dogecoin',
  MATIC: 'matic-network',
  POL:   'polygon-ecosystem-token',
  AVAX:  'avalanche-2',
  LTC:   'litecoin',
  LINK:  'chainlink',
  UNI:   'uniswap',
  ATOM:  'cosmos',
  XLM:   'stellar',
  ALGO:  'algorand',
  NEAR:  'near',
  BCH:   'bitcoin-cash',
  TRX:   'tron',
  FIL:   'filecoin',
  APT:   'aptos',
  ARB:   'arbitrum',
  OP:    'optimism',
  PEPE:  'pepe',
  SHIB:  'shiba-inu',
  USDC:  'usd-coin',
  USDT:  'tether',
  DAI:   'dai',
  XMR:   'monero',
  XTZ:   'tezos',
  AAVE:  'aave',
  EOS:   'eos',
  ICP:   'internet-computer',
  HBAR:  'hedera-hashgraph',
  VET:   'vechain',
  THETA: 'theta-token',
  CRO:   'crypto-com-chain',
  FTM:   'fantom',
  SUI:   'sui',
}

interface CoinGeckoSearchResult {
  coins?: Array<{ id: string; symbol: string; name: string }>
}

export class CoinGeckoProvider implements PortfolioPriceProvider {
  readonly code = 'coingecko'

  constructor(private apiKey?: string) {}

  supports(assetClass: AssetClass): boolean {
    return SUPPORTED.includes(assetClass)
  }

  async fetchQuote(instrument: InstrumentLookup): Promise<PriceQuote | null> {
    const id = await this.resolveId(instrument)
    if (!id) return null

    try {
      const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur,usd&include_last_updated_at=true`
      const res = await fetch(url, this.requestInit())

      if (!res.ok) return null

      const data = (await res.json()) as Record<
        string,
        { eur?: number; usd?: number; last_updated_at?: number }
      >

      const entry = data[id]
      if (!entry) return null

      const eur = entry.eur
      const usd = entry.usd
      if (eur === undefined && usd === undefined) return null

      const price    = (eur ?? usd)!
      const currency: CurrencyCode = eur !== undefined ? 'EUR' : 'USD'
      const pricedAt = entry.last_updated_at
        ? new Date(entry.last_updated_at * 1000)
        : new Date()

      return {
        query:      id,
        price,
        currency,
        pricedAt,
        source:     'coingecko',
        confidence: 'high',
      }
    } catch (e) {
      console.warn(`[coingecko] fetchQuote(${id}) failed:`, e)
      return null
    }
  }

  /**
   * Résout l'id CoinGecko à partir d'un providerId pré-stocké ou du ticker.
   * Le ticker peut être "BTC", "BTC-EUR", "btc/usd", etc. — on extrait
   * la partie symbole et on mappe.
   */
  private async resolveId(instrument: InstrumentLookup): Promise<string | null> {
    if (instrument.providerId) return instrument.providerId
    if (!instrument.ticker) return null

    // Extrait le symbole (avant -, /, _)
    const symbol = instrument.ticker
      .toUpperCase()
      .split(/[-/_]/)[0]!
      .trim()

    if (!symbol) return null

    // 1. Quick map (hardcoded)
    if (QUICK_ID_MAP[symbol]) return QUICK_ID_MAP[symbol]

    // 2. Recherche via /search → premier coin dont le symbole match exactement
    try {
      const res = await fetch(
        `${BASE_URL}/search?query=${encodeURIComponent(symbol)}`,
        this.requestInit(),
      )
      if (!res.ok) return null
      const data = (await res.json()) as CoinGeckoSearchResult
      const coins = data.coins ?? []

      // Match exact par symbole d'abord (sinon premier résultat)
      const exact = coins.find((c) => c.symbol?.toUpperCase() === symbol)
      return exact?.id ?? coins[0]?.id ?? null
    } catch (e) {
      console.warn(`[coingecko] search(${symbol}) failed:`, e)
      return null
    }
  }

  private requestInit(): RequestInit {
    if (!this.apiKey) return { headers: { 'Accept': 'application/json' } }
    return {
      headers: {
        'Accept':           'application/json',
        'x-cg-demo-api-key': this.apiKey,
      },
    }
  }
}
