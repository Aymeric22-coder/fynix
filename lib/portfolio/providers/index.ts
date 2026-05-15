/**
 * Point d'entrée des providers du module Portefeuille.
 *
 * Construit dynamiquement l'orchestrateur en lisant la table
 * `price_providers`. À utiliser depuis les routes API et les jobs cron.
 */

import { CoinGeckoProvider } from './coingecko'
import { YahooPortfolioProvider } from './yahoo'
import { BoursoramaProvider } from './boursorama'
import { JustEtfProvider } from './justetf'
import { PriceOrchestrator, type ProviderConfig } from './orchestrator'
import type { AssetClass } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type { PriceQuote, InstrumentLookup, PortfolioPriceProvider } from './types'
export { PriceOrchestrator, type ProviderConfig } from './orchestrator'
export { YahooPortfolioProvider } from './yahoo'
export { CoinGeckoProvider } from './coingecko'
export { BoursoramaProvider } from './boursorama'
export { JustEtfProvider } from './justetf'

/**
 * Charge la config DB et instancie l'orchestrateur prêt à l'emploi.
 * Ne crée que les providers dont `is_active=true`.
 */
export async function buildOrchestrator(
  supabase: SupabaseClient,
): Promise<PriceOrchestrator> {
  const { data, error } = await supabase
    .from('price_providers')
    .select('code, is_active, priority, supported_classes, api_key_env')

  if (error) {
    console.error('[providers] failed to load price_providers config', error)
    return new PriceOrchestrator([], [])
  }

  const configs: ProviderConfig[] = (data ?? []).map((r) => ({
    code:             r.code as string,
    isActive:         r.is_active as boolean,
    priority:         r.priority as number,
    supportedClasses: (r.supported_classes ?? []) as AssetClass[],
  }))

  // Instancie uniquement les providers actifs (économise la connection au boot)
  const providers = configs
    .filter((c) => c.isActive)
    .map((c) => instantiate(c, data!.find((r) => r.code === c.code) as { api_key_env?: string | null }))
    .filter((p): p is import('./types').PortfolioPriceProvider => p !== null)

  return new PriceOrchestrator(providers, configs)
}

function instantiate(
  cfg:     ProviderConfig,
  raw:     { api_key_env?: string | null },
): import('./types').PortfolioPriceProvider | null {
  switch (cfg.code) {
    case 'yahoo':
      return new YahooPortfolioProvider()
    case 'boursorama':
      return new BoursoramaProvider()
    case 'justetf':
      return new JustEtfProvider()
    case 'coingecko': {
      const key = raw.api_key_env ? process.env[raw.api_key_env] : undefined
      return new CoinGeckoProvider(key)
    }
    // 'alphavantage', 'twelvedata' : à brancher quand on aura les clés
    default:
      return null
  }
}
