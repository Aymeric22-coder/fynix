/**
 * Interface des fournisseurs de cotations pour le module Portefeuille.
 *
 * Différence avec `lib/providers/market-data` :
 *   - asset_class-aware (chaque provider déclare quelles classes il sait gérer)
 *   - PriceQuote est aligné sur le schéma DB `instrument_prices`
 */

import type { AssetClass, ConfidenceLevel, CurrencyCode } from '@/types/database.types'

export interface PriceQuote {
  /** Identifiant utilisé pour la requête (ticker, isin, ou id provider). */
  query:       string
  price:       number
  currency:    CurrencyCode
  pricedAt:    Date
  source:      string
  confidence:  ConfidenceLevel
}

export interface InstrumentLookup {
  ticker:     string | null
  isin:       string | null
  providerId: string | null
  assetClass: AssetClass
  /**
   * Nom de l'instrument, utilisé comme fallback de recherche textuelle
   * quand ticker/ISIN ne sont pas reconnus par le provider. Indispensable
   * pour les SCPI dont les codes AMF ne sont pas des ISIN ISO 6166.
   */
  name?:      string | null
}

export interface PortfolioPriceProvider {
  /** Code interne unique (matche `price_providers.code` en DB). */
  code: string
  /** Classes d'actifs supportées. */
  supports(assetClass: AssetClass): boolean
  /** Renvoie une cotation, ou null si introuvable. */
  fetchQuote(instrument: InstrumentLookup): Promise<PriceQuote | null>
}
