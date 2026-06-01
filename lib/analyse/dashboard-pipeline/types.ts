/**
 * Types du pipeline Dashboard unifié (V1.1 du chantier de refonte).
 *
 * Aucun import Supabase ici — c'est la couche pure. Le loader `load.ts`
 * convertit les rows DB vers ces structures.
 */

// ─────────────────────────────────────────────────────────────────────
// Inputs — exactement la forme que consomme le bloc inline actuel
// (`app/(app)/dashboard/page.tsx:207-326`). Les fixtures V1.0 produisent
// déjà cette shape.
// ─────────────────────────────────────────────────────────────────────

export interface DashboardAssetRow {
  id:                 string
  name:               string
  asset_type:         string                 // 'real_estate' | 'cash' | 'other'
  current_value:      number | null
  acquisition_price:  number | null
  confidence:         string | null          // 'low' | 'medium' | 'high'
  last_valued_at:     string | null
}

export interface DashboardDebtRow {
  asset_id:           string | null
  capital_remaining:  number | null
  monthly_payment:    number | null
}

export interface DashboardSnapshotRow {
  snapshot_date:      string                 // ISO YYYY-MM-DD
  total_net_value:    number
  total_gross_value:  number
  total_debt:         number
}

export interface DashboardPortfolioSummary {
  totalMarketValue:        number
  totalCostBasis:          number
  totalCostBasisValued:    number
  totalUnrealizedPnL:      number | null
  totalUnrealizedPnLPct:   number | null
  positionsCount:          number
  valuedPositionsCount:    number
  freshnessRatio:          number
  allocationByClass:       Array<{ assetClass: string; value: number }>
}

export interface DashboardPortfolioPosition {
  positionId:   string
  name:         string
  assetClass:   string
  status:       string                       // 'active' | …
  marketValue:  number | null
  costBasis:    number
  priceStale:   boolean
  // ── V1.3 P0.3 — Champs requis pour le moteur TWR ────────────────────
  /** Quantité actuellement détenue (utilisée pour interpoler le prix actuel). */
  currentQuantity?:  number
  /** Date d'acquisition initiale (fallback si pas de transaction historisée). */
  acquisitionDate?:  string
  /** Prix moyen d'acquisition (fallback). Combiné à `acquisitionDate` pour
   *  générer une transaction synthétique. */
  averagePriceEur?:  number
}

export interface DashboardRealEstatePortfolio {
  properties: Array<{
    propertyId:    string
    propertyName?: string
    assetId:       string
    simulation: { incompleteData: boolean }
    driftAlerts?: unknown[]
  }>
  totalCapitalRemaining: number
  totalMonthlyCFYear1:   number
}

export interface DashboardPipelineInputs {
  assets:              DashboardAssetRow[]
  debts:               DashboardDebtRow[]
  snapshots:           DashboardSnapshotRow[]    // DESC (latest first) — comme la DB
  portfolioSummary:    DashboardPortfolioSummary
  portfolioPositions:  DashboardPortfolioPosition[]
  realEstatePortfolio: DashboardRealEstatePortfolio
  // ── V1.3 P0.3 — Inputs TWR ──────────────────────────────────────────
  /** Transactions du portefeuille financier (sous-ensemble dédié au TWR). */
  transactionsPortefeuille?: import('@/lib/portfolio/transaction-segments').TransactionForTwr[]
  /** Date d'observation finale (« now »). Si absent, le calc utilise `new Date()`. */
  asOfDate?:                 string | Date
}

// ─────────────────────────────────────────────────────────────────────
// Output — structure consommée par les composants UI
// ─────────────────────────────────────────────────────────────────────

export interface DashboardKpis {
  gross_value:        number
  net_value:          number
  total_debt:         number
  debt_ratio:         number     // %
  /**
   * Cash-flow immobilier Y1 simulé (après impôts).
   * V1.2 P0.4 : renommé depuis `monthly_cash_flow` pour expliciter le périmètre.
   * Le vrai cash-flow patrimonial (loyers + dividendes + intérêts livrets −
   * mensualités) viendra en P1.1, sous une clé distincte.
   */
  cash_flow_immo_y1:       number
  cash_flow_immo_y1_label: string  // toujours « Cash-flow immobilier (Y1 simulé) »

  // ── V1.3 P0.3 — TWR + Croissance patrimoine séparés ─────────────────
  /**
   * Performance du portefeuille financier (Time-Weighted Return) annualisée,
   * NEUTRALISANT les apports et retraits. `null` si historique insuffisant.
   * Voir `twr_portefeuille_label` pour la raison du null.
   */
  twr_portefeuille_pct:       number | null
  /** `true` si TWR calculé sur < 365 j (annualisation extrapolée). */
  twr_portefeuille_extrapole: boolean
  /**
   * Label explicite à afficher :
   *   - TWR non null : `"Performance portefeuille : +X,X %/an"` (ou avec caveat extrapolé)
   *   - TWR null : raison documentée (« Pas assez d'historique » / « Historique trop court »)
   */
  twr_portefeuille_label:     string

  /**
   * Croissance annualisée du patrimoine net (apports d'épargne INCLUS).
   * Reprend l'ancien calcul `cagr` sur `wealth_snapshots` mais explicitement
   * labellé pour éviter la confusion avec une performance d'investissement.
   * `null` si < 2 snapshots ou < 90 jours d'historique.
   */
  croissance_patrimoine_pct:  number | null
  /** Label : `"Croissance patrimoine : +X,X %/an (apports inclus)"` ou raison du null. */
  croissance_patrimoine_label: string

  confidence_score:   number     // %
  assets_count:       number
  /**
   * Sous-label optionnel affiché sous le KPI cash-flow.
   * `'après impôts (simulation)'` si au moins un bien a `hasImmoSim=true`,
   * sinon `undefined`.
   */
  sim_cf_label?:      string
}

/**
 * Slice d'allocation typée par la taxonomie canonique (V1.2 P0.6).
 *
 * `key` est garantie de provenir de `ASSET_TAXONOMY` (cf. `lib/finance/asset-taxonomy.ts`).
 * Les anciennes clés hétérogènes `asset:*` / `class:*` ne sont plus exposées —
 * elles sont mappées via `mapToTaxonomy()` AVANT l'agrégation.
 */
export interface DashboardAllocationSlice {
  key:      string     // TaxonomyKey (typage assoupli ici pour éviter le coupling fort)
  label:    string     // libellé humain depuis TAXONOMY_LABELS
  valueEur: number     // € (base = grossValueMVStrict)
  percent:  number     // % (somme = 100 à ε près)
  color:    string     // hex depuis TAXONOMY_COLORS
}

export interface DashboardTopAsset {
  id:      string     // `asset:<assetId>` ou `position:<positionId>`
  name:    string
  type:    string
  value:   number
  percent: number
}

export interface DashboardTimelinePoint {
  date:        string
  net_value:   number
  gross_value: number
  total_debt:  number
}

export interface DashboardAlert {
  type:     string
  message:  string
  severity: 'warning' | 'info'
}

export interface DashboardRealEstateDriftSummary {
  propertyId:   string
  propertyName?: string
  alerts:       unknown[]
}

export interface DashboardData {
  kpis:                    DashboardKpis
  allocation:              DashboardAllocationSlice[]
  topAssets:               DashboardTopAsset[]
  timeline:                DashboardTimelinePoint[]
  alerts:                  DashboardAlert[]
  realEstateDriftSummaries: DashboardRealEstateDriftSummary[]
  /** Vrai si au moins un bien immo a une simulation complète (utilisé par KpiGrid). */
  hasImmoSim: boolean

  // ── V1.2 P0.2 — Badge « positions non valorisées » ──────────────────
  /** Nombre de positions actives sans valeur de marché (`marketValue === null`). */
  unvaluedPositionsCount:    number
  /** Somme des cost basis des positions non valorisées (info indicative, en €). */
  unvaluedPositionsCostBasis: number
  /**
   * Libellé prêt à afficher : `"3 positions non valorisées · 5 200 € manquants"`
   * ou chaîne vide si tout est valorisé. Le composant UI peut ignorer ou
   * formater librement à partir des deux champs numériques ci-dessus.
   */
  unvaluedPositionsLabel:    string

  // ── V1.2 P0.6 — Métadonnées d'allocation ────────────────────────────
  /** Base de calcul du donut. V1.2 : toujours `'gross_strict'`. Toggle `'net'` arrive avec V2 visuelle. */
  allocationBase:  'gross_strict' | 'net'
  /** Somme des `allocation[].valueEur` — doit égaler `kpis.gross_value` à ε près. */
  allocationTotal: number
}
