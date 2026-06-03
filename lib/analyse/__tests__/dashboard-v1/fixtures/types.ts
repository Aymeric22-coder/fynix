/**
 * Types des fixtures Dashboard V1 (chantier de refonte).
 *
 * Chaque fixture représente un profil utilisateur (1 des 6 audités en Phase 2
 * du rapport `auditdashboard.md`) sous deux formes complémentaires :
 *
 *   - `inputs` : les structures déjà calculées par les briques amont
 *     (assets/debts/snapshots tels que lus de Supabase, ainsi que
 *     `portfolioSummary` et `realEstatePortfolio` tels que renvoyés par
 *     `buildPortfolioFromDb` et `computeRealEstatePortfolio`). C'est ce que le
 *     bloc inline `app/(app)/dashboard/page.tsx:207-326` consomme.
 *
 *   - `expected` : les valeurs cibles, calculées à la main et documentées dans
 *     les commentaires de chaque fixture. Ce sont les valeurs « correctes »
 *     d'un point de vue métier — celles que le Dashboard devrait afficher
 *     une fois les bugs P0 corrigés. Les chiffres « actuels » (avec bugs)
 *     sont également capturés dans `currentBuggy` pour les bugs documentés.
 *
 * Le test `dashboard-caracterisation.test.ts` réplique exactement les formules
 * du bloc inline sur `inputs` et compare le résultat à `currentBuggy` (état
 * actuel) — ainsi qu'à `expected` pour les indicateurs où les deux convergent.
 */

/** Sous-ensemble d'`assets` lu par le Dashboard (RE + cash + other). */
export interface DashboardAssetRow {
  id:                 string
  name:               string
  asset_type:         'real_estate' | 'cash' | 'other'
  current_value:      number | null
  acquisition_price:  number | null
  confidence:         'low' | 'medium' | 'high' | null
  last_valued_at:     string | null
}

/** Sous-ensemble de `debts` lu par le Dashboard. */
export interface DashboardDebtRow {
  asset_id:           string | null
  capital_remaining:  number | null
  monthly_payment:    number | null
}

/** Snapshot historique normalisé (cf. dashboard/page.tsx:75-80). */
export interface DashboardSnapshotRow {
  snapshot_date:      string  // ISO date YYYY-MM-DD
  total_net_value:    number
  total_gross_value:  number
  total_debt:         number
}

/** Sous-ensemble du `portfolioResult.summary` consommé par le Dashboard. */
export interface PortfolioSummaryFixture {
  totalMarketValue:        number
  totalCostBasis:          number
  totalCostBasisValued:    number
  totalUnrealizedPnL:      number | null
  totalUnrealizedPnLPct:   number | null
  positionsCount:          number
  valuedPositionsCount:    number
  freshnessRatio:          number
  allocationByClass: Array<{
    assetClass: string
    value:      number
  }>
}

/** Sous-ensemble de `portfolioResult.positions` consommé par le Dashboard. */
export interface PortfolioPositionFixture {
  positionId:   string
  name:         string
  assetClass:   string
  status:       'active' | 'closed' | 'liquidated' | 'archived'
  marketValue:  number | null
  costBasis:    number
  priceStale:   boolean
  // ── V1.3 P0.3 — Champs requis pour le moteur TWR ────────────────────
  currentQuantity?:  number
  acquisitionDate?:  string
  averagePriceEur?:  number
}

/** Sous-ensemble de `computeRealEstatePortfolio` consommé par le Dashboard. */
export interface RealEstatePortfolioFixture {
  properties: Array<{
    propertyId:    string
    propertyName:  string
    assetId:       string
    simulation: {
      incompleteData: boolean
    }
    driftAlerts: unknown[]
  }>
  totalCapitalRemaining: number
  totalMonthlyCFYear1:   number
}

/** Bug documenté dans l'audit (référence vers `auditdashboard.md`). */
export type BugRef =
  | 'BUG-1'   // Patrimoine brut hybride MV/CB
  | 'BUG-2'   // CAGR ≠ performance (apports inclus)
  | 'BUG-3'   // Cash-flow mensuel = uniquement immobilier
  | 'BUG-4'   // Double comptage cash potentiel
  | 'BUG-5'   // Top 5 mélange granularités
  | 'BUG-6'   // Allocation clés hétérogènes

/** Forme d'une fixture Dashboard. */
export interface DashboardFixture {
  /** Slug court (kebab-case). */
  id: string
  /** Nom lisible du profil. */
  name: string
  /** Description métier d'une ligne. */
  description: string

  /** Données d'entrée — exactement la forme consommée par le bloc inline. */
  inputs: {
    assets:              DashboardAssetRow[]
    debts:               DashboardDebtRow[]
    snapshots:           DashboardSnapshotRow[]
    portfolioSummary:    PortfolioSummaryFixture
    portfolioPositions:  PortfolioPositionFixture[]
    realEstatePortfolio: RealEstatePortfolioFixture
    // ── V1.3 P0.3 — Inputs TWR ────────────────────────────────────────
    transactionsPortefeuille?: import('@/lib/portfolio/transaction-segments').TransactionForTwr[]
    asOfDate?:                 string | Date
    // ── Cash V1.1 — Slot optionnel pour fixtures multi-livrets ────────
    // Reprend exactement le shape `DashboardCashAccountRow` consommé par
    // le pipeline (cf. `dashboard-pipeline/types.ts`). Pour les fixtures
    // qui n'en ont pas besoin, le champ reste `undefined` (l'ancienne
    // simulation via `assets[].asset_type === 'cash'` continue de
    // fonctionner). Une fois renseigné, le pipeline le consomme via
    // `computeCashSummary` (dédup avec `assets.cash` legacy).
    cashAccounts?: import('@/lib/analyse/dashboard-pipeline/types').DashboardCashAccountRow[]
  }

  /**
   * Valeurs « métier correctes » — celles qui devraient être affichées
   * une fois les bugs P0 corrigés. Toutes les valeurs sont arrondies à 0,01 €.
   */
  expected: {
    /** Patrimoine brut = MV stricte (sans proxy cost basis pour positions non valorisées). */
    grossValueMVStrict: number
    /** Patrimoine net = brut MV strict − dettes totales (CRD). */
    netValue:           number
    totalDebt:          number
    /** Cash-flow strictement immobilier (Y1 simulé, après impôts). */
    cashFlowImmoSimY1:  number
    /** Top 5 attendu après la refonte P0.5 — consolidé par enveloppe/bien. */
    topConsolidatedAfterRefactor: Array<{ label: string; value: number; type: string }>
    /**
     * Allocation cible (P0.6 livré V1.2). Format : `{ key, label, valueEur, percent }`.
     * `key` doit appartenir à `ASSET_TAXONOMY` (cf. lib/finance/asset-taxonomy.ts).
     */
    allocation: Array<{ key: string; label: string; valueEur: number; percent: number }>
    /** Note d'attente sur le ratio de confidence. */
    confidenceScoreNote: string
    // ── V1.3 P0.3 — Performance + Croissance attendues ───────────────
    /** TWR portefeuille annualisé attendu. `null` si historique insuffisant. */
    twr_portefeuille_pct: number | null
    /** Croissance patrimoniale annualisée (apports inclus). `null` si < 2 snapshots / < 90 j. */
    croissance_patrimoine_pct: number | null
    /** Commentaire libre — raisonnement métier. */
    notes: string[]
  }

  /**
   * Valeurs « actuelles » telles que produites par le code de production
   * aujourd'hui (avec les bugs identifiés). Le test de caractérisation
   * vérifie que la formule inline produit bien ces valeurs.
   */
  currentBuggy: {
    grossValueHybrid:     number     // BUG-1 — hybride MV/CB
    netValueFromHybrid:   number     // hérite BUG-1
    debtRatioPct:         number
    cashFlowMonthly:      number     // BUG-3 — label trompeur
    cagrPct:              number | null  // BUG-2 — apports inclus
    confidenceScorePct:   number
    topAssetsByValue: Array<{        // BUG-5 — granularités mélangées
      name:    string
      type:    string
      value:   number
      percent: number
    }>
    allocationKeys: string[]         // BUG-6 — clés `asset:*` + `class:*` mélangées
  }

  /** Bugs déclenchés par cette fixture (référencent l'audit). */
  triggers: BugRef[]
}
