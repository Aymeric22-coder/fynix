/**
 * Profil 1 — Le débutant (25 ans, 15 k€).
 *
 * Composition métier :
 *   - Livret A : 12 000 €
 *   - PEA naissant : 3 000 € (1 ETF World monde MV 3 000 €, CB 2 800 €, prix frais)
 *   - Pas d'immobilier, pas de dette
 *
 * Total brut = 15 000 € · Total net = 15 000 € · Endettement = 0 %
 *
 * Profil utilisé pour :
 *   - Valider qu'aucun bug ne se déclenche sur un patrimoine minimaliste
 *     (sauf BUG-6 sur la taxonomie d'allocation).
 *   - Mesurer la pertinence du Dashboard pour le primo-investisseur (Phase 2).
 */
import type { DashboardFixture } from './types'

export const DEBUTANT_FIXTURE: DashboardFixture = {
  id:          'debutant',
  name:        'Le débutant',
  description: '25 ans, 15 k€, Livret A + PEA naissant. Aucun immo, aucune dette.',

  inputs: {
    assets: [
      {
        id: 'a-livret-a',
        name: 'Livret A',
        asset_type: 'cash',
        current_value: 12_000,
        acquisition_price: 12_000,
        confidence: 'high',
        last_valued_at: '2026-05-30T08:00:00Z',
      },
    ],
    debts: [],
    snapshots: [
      // 1 seul snapshot → CAGR sera null par construction (besoin de ≥ 2 points)
      {
        snapshot_date: '2026-05-30',
        total_net_value:   15_000,
        total_gross_value: 15_000,
        total_debt:        0,
      },
    ],
    portfolioSummary: {
      totalMarketValue:      3_000,
      totalCostBasis:        2_800,
      totalCostBasisValued:  2_800,    // 100 % des positions sont valorisées
      totalUnrealizedPnL:    200,
      totalUnrealizedPnLPct: 7.14,
      positionsCount:        1,
      valuedPositionsCount:  1,
      freshnessRatio:        1.0,
      allocationByClass: [
        { assetClass: 'etf', value: 3_000 },
      ],
    },
    portfolioPositions: [
      {
        positionId:  'p-etf-world',
        name:        'Amundi MSCI World UCITS ETF (CW8)',
        assetClass:  'etf',
        status:      'active',
        marketValue: 3_000,
        costBasis:   2_800,
        priceStale:  false,
      },
    ],
    realEstatePortfolio: {
      properties: [],
      totalCapitalRemaining: 0,
      totalMonthlyCFYear1:   0,
    },
    // V1.3 P0.3 — pas d'historique transactions (utilisateur primo-investisseur)
    transactionsPortefeuille: [],
    asOfDate: '2026-05-30',
  },

  expected: {
    // Calcul à la main :
    //   assetsValue (cash)     = 12 000 €
    //   portfolioBrut (MV strict, pas de positions non valorisées) = 3 000 €
    //   grossValueMVStrict     = 15 000 €
    grossValueMVStrict: 15_000,
    // Pas de dette → net = brut
    netValue:           15_000,
    totalDebt:          0,
    // Pas d'immobilier → CF immo simulé = 0 €
    cashFlowImmoSimY1:  0,
    // Top consolidé attendu par la refonte P0.5 :
    //   1 livret = 1 ligne, 1 enveloppe = 1 ligne. Ici 2 lignes.
    topConsolidatedAfterRefactor: [
      { label: 'Livret A', value: 12_000, type: 'livret' },
      { label: 'PEA',      value: 3_000,  type: 'pea' },
    ],
    // Taxonomie unifiée P0.6 (V1.2 livré) :
    //   cash 12 000 € (80 %) · etf 3 000 € (20 %)
    // Ordre = valueEur DESC puis key ASC (tie-breaker).
    allocation: [
      { key: 'cash', label: 'Cash', valueEur: 12_000, percent: 80 },
      { key: 'etf',  label: 'ETF',  valueEur:  3_000, percent: 20 },
    ],
    confidenceScoreNote:
      'Livret cash confidence=high + ETF priceStale=false → confidence = 100 %.',
    // V1.3 P0.3 — Performance (1 seul snapshot → croissance = null aussi)
    twr_portefeuille_pct: null,            // pas de transactions
    croissance_patrimoine_pct: null,       // 1 seul snapshot
    notes: [
      'Cas le plus simple : aucun bug critique côté calculs, seule la taxonomie',
      'd\'allocation reste impactée par BUG-6 (clés `asset:cash` vs `class:etf`).',
      'L\'audit Phase 2 conclut à 4/10 pour ce profil : le contenu est juste mais',
      'mal hiérarchisé (KPIs en 8e position) et FIRE Hero anxiogène.',
    ],
  },

  currentBuggy: {
    // Réplique du bloc inline `dashboard/page.tsx:207-326` :
    //   assetsValue   = 12 000
    //   portfolioBrut = 3 000 + (2 800 − 2 800) = 3 000
    //   grossValue    = 15 000
    grossValueHybrid:   15_000,
    netValueFromHybrid: 15_000,
    debtRatioPct:       0,
    cashFlowMonthly:    0,        // hasSim = false → 0
    cagrPct:            null,     // < 2 snapshots
    confidenceScorePct: 100,
    topAssetsByValue: [
      { name: 'Livret A',                          type: 'cash', value: 12_000, percent: 80 },
      { name: 'Amundi MSCI World UCITS ETF (CW8)', type: 'etf',  value:  3_000, percent: 20 },
    ],
    allocationKeys: ['asset:cash', 'class:etf'],
  },

  triggers: ['BUG-6'],
}
