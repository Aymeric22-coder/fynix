/**
 * Types métier du module Portefeuille.
 *
 * Couche pure — aucune dépendance Supabase / Next.js.
 */

import type {
  AssetClass, ConfidenceLevel, CurrencyCode, PositionStatus,
} from '@/types/database.types'

// ─── Inputs (données brutes côté DB ou import) ───────────────────────────────

/** Représentation minimale d'un instrument (catalogue partagé). */
export interface InstrumentInput {
  id:           string
  ticker:       string | null
  isin:         string | null
  name:         string
  assetClass:   AssetClass
  subclass:     string | null
  currency:     CurrencyCode
  sector:       string | null
  geography:    string | null
}

/** Représentation minimale d'une position utilisateur. */
export interface PositionInput {
  id:               string
  instrumentId:     string
  envelopeId:       string | null
  quantity:         number       // ≥ 0
  averagePrice:     number       // PRU dans la devise de la position
  currency:         CurrencyCode
  acquisitionDate:  string | null
  status:           PositionStatus
  broker:           string | null
}

/** Dernière cotation connue pour un instrument. */
export interface PriceInput {
  instrumentId:  string
  price:         number
  currency:      CurrencyCode
  pricedAt:      string          // ISO timestamp
  source:        string
  confidence:    ConfidenceLevel
}

// ─── Outputs (résultats de valorisation) ─────────────────────────────────────

/** Valorisation d'une position (1 ligne enrichie pour l'UI). */
export interface PositionValuation {
  positionId:        string
  instrumentId:      string
  ticker:            string | null
  name:              string
  assetClass:        AssetClass
  envelopeId:        string | null
  quantity:          number
  averagePrice:      number
  currency:          CurrencyCode
  /** Prix actuel (après conversion FX vers la devise de la position). */
  currentPrice:      number | null
  priceConfidence:   ConfidenceLevel
  priceFreshAt:      string | null
  priceStale:        boolean       // true si > 24 h sans MAJ
  /** Cost basis = quantity × averagePrice (devise position). */
  costBasis:         number
  /** Valeur de marché = quantity × currentPrice (devise position). null si prix inconnu. */
  marketValue:       number | null
  /** Plus / moins-value latente en montant (devise position). */
  unrealizedPnL:     number | null
  /** Plus / moins-value latente en %. */
  unrealizedPnLPct:  number | null
  /** Statut de la position. */
  status:            PositionStatus
}

/** Vue agrégée du portefeuille pour le cockpit. */
export interface PortfolioSummary {
  /** Nombre de positions actives. */
  positionsCount:        number
  /** Nombre de positions actives qui ont un prix de marché. */
  valuedPositionsCount:  number
  /** Cost basis total (TOUTES positions actives — capital réellement investi). */
  totalCostBasis:        number
  /** Cost basis des positions valorisées uniquement (utilisé pour la +/-). */
  totalCostBasisValued:  number
  /** Market value total (positions valorisées seulement). */
  totalMarketValue:      number
  /**
   * Plus / moins-value latente cumulée (devise ref).
   * Calculée UNIQUEMENT sur les positions valorisées : on ne peut pas
   * inventer une perte sur une position dont on ne connaît pas le prix.
   * null si aucune position n'a de prix.
   */
  totalUnrealizedPnL:    number | null
  /** Plus / moins-value latente cumulée en %. null si aucune position valorisée. */
  totalUnrealizedPnLPct: number | null
  /** Pourcentage du portefeuille avec un prix frais (< 24 h). */
  freshnessRatio:        number
  /** Allocation par classe d'actif (poids %, sur market value). */
  allocationByClass:     Array<{ assetClass: AssetClass; value: number; weightPct: number }>
  /** Allocation par enveloppe (poids %). null = sans enveloppe. */
  allocationByEnvelope:  Array<{ envelopeId: string | null; value: number; weightPct: number }>
  /** Devise de référence utilisée pour les agrégats. */
  referenceCurrency:     CurrencyCode
}

/** Résultat global : positions enrichies + agrégats. */
export interface PortfolioResult {
  positions:  PositionValuation[]
  summary:    PortfolioSummary
}
