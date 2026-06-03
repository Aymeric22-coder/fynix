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
  /** V2.4 P0.7 — Date d'acquisition (lue pour le filtre 90 j immobilier). */
  acquisition_date?:  string | null
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
  /** V2.2-BIS — Cash historisé pour la règle « cash > 30 % depuis 6 mois ». */
  total_cash?:        number
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
  // ── V2.4 P0.7 — Enveloppe de la position ────────────────────────────
  /** ID de l'enveloppe (PEA / CTO / AV / PER / wallet crypto…). `null` si position orpheline. */
  envelopeId?:       string | null
}

/** Métadonnée enveloppe pour libellé + catégorisation Z8.5 (V2.4 P0.7). */
export interface DashboardEnvelopeMeta {
  id:           string
  name:         string                       // « PEA Boursorama »
  envelopeType: string                       // 'pea' | 'cto' | 'wallet_crypto' | …
}

export interface DashboardRealEstatePortfolio {
  properties: Array<{
    propertyId:    string
    propertyName?: string
    assetId:       string
    simulation: {
      incompleteData: boolean
      /** V2.4 P0.7 — netNetYield % annuel (cf. PropertyKPIs.netNetYield). */
      netNetYieldPct?: number
      /** V2.4-BIS — netYield % = (loyers nets − charges) / coût total (cf. PropertyKPIs.netYield). */
      netYieldPct?:    number
      /** V2.4-BIS — Coût total opération (cf. PropertyKPIs.totalCost). */
      totalCostEur?:   number
    }
    /** V2.4 P0.7 — Date d'acquisition (assets.acquisition_date). */
    acquisitionDate?: string | null
    /** V2.4-BIS — Régime fiscal locatif. `null` = pas de régime → présumé RP (exclu du ranking immo). */
    fiscalRegime?:    string | null
    /** V2.4-BIS — Valeur estimée actuelle (assets.current_value). Sert de dénominateur au rendement locatif. */
    currentValueEur?: number | null
    driftAlerts?: unknown[]
  }>
  totalCapitalRemaining: number
  totalMonthlyCFYear1:   number
}

/** Sous-ensemble de `cash_accounts` consommé par le pipeline (V2.1-BIS + V2.4). */
export interface DashboardCashAccountRow {
  id:           string
  asset_id:     string | null
  balance:      number | string | null
  currency:     string | null
  account_type: string | null
  /** V2.4 P0.7 — Taux nominal annuel (% NUMERIC). */
  interest_rate?: number | string | null
  /** V2.4 P0.7 — Date d'ouverture pour filtre 90 j. */
  created_at?:   string | null
  /** V2.4 P0.7 — Nom de la banque pour libellé Z8.5. */
  bank_name?:    string | null
}

export interface DashboardPipelineInputs {
  assets:              DashboardAssetRow[]
  debts:               DashboardDebtRow[]
  snapshots:           DashboardSnapshotRow[]    // DESC (latest first) — comme la DB
  portfolioSummary:    DashboardPortfolioSummary
  portfolioPositions:  DashboardPortfolioPosition[]
  realEstatePortfolio: DashboardRealEstatePortfolio
  /** V2.1-BIS — `cash_accounts` du user (table moderne dédiée). */
  cashAccounts?:       DashboardCashAccountRow[]
  /** V2.4 P0.7 — Méta enveloppes (libellé + type) pour Z8.5. */
  envelopes?:          DashboardEnvelopeMeta[]
  /**
   * V2.2-BIS — Signatures actuellement masquées par l'utilisateur
   * (cf. table `user_alert_dismissals`, expires_at IS NULL OR > now()).
   * Le pipeline filtre les alertes ET les actions du mois correspondantes
   * avant de les exposer à l'UI.
   */
  alertDismissalsActive?: ReadonlySet<string>
  /**
   * V1.2 Cash — Intentions de cash volontaire déclarées par l'utilisateur
   * (table `cash_intents`, mig 055). Le pipeline soustrait les intents
   * actives de `cashSummary.totalEur` AVANT d'évaluer l'alerte
   * `cash_dormant_6m`, fermant le faux positif P5 (« sur-liquide
   * volontaire »).
   */
  cashIntents?: ReadonlyArray<import('@/types/database.types').CashIntent>
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

// `DashboardTopAsset` (granularité atomique) supprimé en V2.3 — remplacé
// par `TopAssetConsolidated`. L'ancien top mélangeait positions atomiques
// et biens immo entiers, rendant le classement inintelligible (BUG-5).
// Si un drill-down atomique est requis ailleurs, il sera regénéré à la
// demande depuis `positions` plutôt que transporté dans `DashboardData`.

/**
 * Type V2.3 — Top consolidé par enveloppe / bien / compte (BUG-5).
 *
 * 1 ligne = 1 enveloppe financière (PEA, CTO, AV, PER, wallet crypto)
 *         OU 1 bien immobilier
 *         OU 1 compte cash
 * Pas de positions atomiques mélangées (un PEA contenant 5 ETF = 1 ligne « PEA »).
 * Pas d'agrégation entre comptes cash (Livret A séparé de LDDS séparé de LEP).
 * Pas d'agrégation entre biens immo.
 */
export type ConsolidatedEnvelopeType =
  | 'pea' | 'cto' | 'av' | 'per' | 'wallet_crypto' | 'other'    // enveloppes financières (V2.4 envelope_type)
  | 'real_estate'                                                  // bien immo
  | 'cash_livret' | 'cash_courant'                                 // compte cash (livret réglementé vs CC)
  | 'asset_class'                                                  // fallback : ≥ 50 % positions sans envelope_id

export interface TopAssetConsolidated {
  /** Clé stable : `envelope:<id>` / `re:<propertyId>` / `cash:<accountId>` / `class:<assetClass>`. */
  key:                      string
  /** Libellé prêt à afficher (« PEA Bourso », « Immeuble Tandoori », « Livret A — Crédit Agricole »). */
  label:                    string
  /** Type d'enveloppe consolidée — sert à choisir l'icône côté UI. */
  envelopeType:             ConsolidatedEnvelopeType
  /** Valeur totale agrégée (€). */
  totalValueEur:            number
  /** % du patrimoine BRUT (pas net) — peut dépasser 100 % si la dette n'est pas déduite. */
  percentOfGross:           number
  /** Nombre de positions sous-jacentes (1 pour immo/cash/livret, N pour PEA/CTO/wallet). */
  underlyingPositionsCount: number
  /** Lien de drill-down (Server Component → `<Link href={...}>`). */
  href?:                    string
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
  /**
   * V2.2-BIS — Identifiant stable côté DB pour le masquage individuel.
   * Pour les alertes globales (ex: `over_exposure_immo_net`) : le type
   * suffit. Pour les alertes par position (`concentration_position`) :
   * suffixe `:<positionId>` pour distinguer chaque ligne.
   * Optionnel pour conserver la rétrocompat avec les alertes informatives
   * pures (stale_data, sim_incomplete) que l'utilisateur ne masque pas.
   */
  signature?: string
}

export interface DashboardRealEstateDriftSummary {
  propertyId:   string
  propertyName?: string
  alerts:       unknown[]
}

export interface DashboardData {
  kpis:                    DashboardKpis
  allocation:              DashboardAllocationSlice[]
  /**
   * V2.3 — Top 5 actifs consolidés par enveloppe / bien / compte.
   * Remplace l'ancien `topAssets` atomique (BUG-5). 1 ligne = 1 enveloppe
   * (PEA, CTO, AV, wallet…) ou 1 bien immo ou 1 compte cash. Trié par
   * valeur décroissante, limité à 5. Cf. `TopAssetConsolidated`.
   */
  topAssetsConsolidated:   TopAssetConsolidated[]
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

  // ── V2.1-BIS — Synthèse cash agrégée ────────────────────────────────
  /**
   * Total cash agrégé pour la ligne compacte Dashboard.
   * Source : `cash_accounts.balance` + `assets` de type `cash` non liés
   * à un `cash_account` (dédup par `cash_accounts.asset_id`).
   * Hypothèse devise : EUR uniquement en V2.1-BIS (cf. décision sprint).
   */
  cashSummary: {
    totalEur:       number
    accountsCount:  number
  }

  // ── V2.4-BIS — Classement Champions / Casseroles instantané (Z8.5) ──
  /**
   * Top 1 best + top 1 worst (si ≥ 2 positions) par catégorie. Buckets
   * vides absents du retour (clé omise). Métrique = rendement instantané
   * constaté, sans aucun seuil d'historique :
   *   - financier/crypto : plus-value latente `(MV − cost_basis) / cost_basis × 100`
   *   - immobilier       : rendement locatif net (RP exclue par fiscalRegime null)
   *   - cash             : taux contractuel `interest_rate`
   */
  investmentRankings: import('@/lib/portfolio/investment-rankings').InvestmentRankings
}
