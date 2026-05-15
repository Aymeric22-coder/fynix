/**
 * Types du module Analyse — enrichissement ISIN et exposition portefeuille.
 *
 * Volontairement séparé de `types/database.types.ts` : ce sont des types
 * d'application, calculés / dérivés, pas un mapping direct des tables.
 */

export type AnalyseAssetType =
  | 'stock'
  | 'etf'
  | 'crypto'
  | 'bond'
  | 'scpi'
  | 'unknown'

/**
 * Snapshot d'enrichissement pour un ISIN — ce que la couche Analyse
 * sert au reste de l'app (vues sectorielles, géographiques, etc.).
 */
export interface ISINData {
  isin:          string
  symbol:        string | null     // ticker Yahoo Finance (ex: "AAPL", "BNP.PA")
  name:          string
  asset_type:    AnalyseAssetType
  sector:        string | null     // libellé Yahoo brut (ex: "Technology")
  industry:      string | null
  country:       string | null     // libellé Yahoo brut ou code ISO
  currency:      string            // ex: "EUR", "USD"
  exchange:      string | null     // ex: "PAR", "NMS"
  current_price: number | null
  cached_at:     string            // ISO timestamp
}

/**
 * Position enrichie : ce qu'on calcule à la volée pour chaque ligne du
 * portefeuille en croisant la position DB et l'ISINData.
 */
export interface EnrichedPosition {
  isin:                string
  name:                string
  quantity:            number
  pru:                 number
  current_price:       number
  current_value:       number
  gain_loss:           number
  gain_loss_pct:       number
  asset_type:          AnalyseAssetType
  sector:              string | null
  country:             string | null
  currency:            string
  /** % de cette position dans la valeur totale du portefeuille (0-100). */
  weight_in_portfolio: number
}
