/**
 * Profil 6 — Le haut patrimoine complexe (45 ans, ~3 M€, entrepreneur).
 *
 * **Limite assumée** : le modèle de données Fynix actuel ne supporte pas SCI,
 * holding, démembrement, non-coté (cf. Phase 5.6 du rapport). La fixture
 * matérialise donc ces actifs comme `asset_type='other'` avec une valorisation
 * manuelle stockée dans `current_value` — proxy en attendant P2.2/P2.3.
 *
 * Composition métier :
 *   - RP 600 k€ (sans dette)
 *   - 2 locatifs LMNP 700 k€ cumulé (dette 350 k€, CF Y1 +900 €/mois)
 *   - Parts SCI 850 k€ (saisi en `other`)        ← proxy, vrai modèle = P2.2
 *   - Holding SARL famille 650 k€ (saisi en `other`) ← idem
 *   - PEA + CTO 500 k€
 *   - Crypto 150 k€
 *   - Livrets 50 k€
 *
 * Brut = 600 + 700 + 850 + 650 + 500 + 150 + 50 = 3 500 000 €
 * Dette = 350 000 €  ·  Net = 3 150 000 €
 *
 * Triggers : BUG-1 (une part holding non valorisée, MV null, CB 100 k€),
 *            BUG-5 (top dominé par RE + parts), BUG-6, BUG-3 (dividendes holding).
 */
import type { DashboardFixture } from './types'

export const HNW_COMPLEXE_FIXTURE: DashboardFixture = {
  id:          'hnw-complexe',
  name:        'Le haut patrimoine complexe',
  description: '3 M€+, entrepreneur. Limite assumée : SCI/holding en proxy `other`.',

  inputs: {
    assets: [
      { id: 'a-rp',   name: 'RP Paris XVI',                   asset_type: 'real_estate', current_value: 600_000, acquisition_price: 480_000, confidence: 'medium', last_valued_at: '2026-03-01T08:00:00Z' },
      { id: 'a-lmnp1', name: 'LMNP Cannes',                    asset_type: 'real_estate', current_value: 400_000, acquisition_price: 320_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      { id: 'a-lmnp2', name: 'LMNP Aix-en-Provence',           asset_type: 'real_estate', current_value: 300_000, acquisition_price: 250_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      // Proxy SCI / Holding — saisis en `other` faute de modèle dédié
      { id: 'a-sci',     name: 'Parts SCI familiale (proxy)',     asset_type: 'other', current_value: 850_000, acquisition_price: 600_000, confidence: 'low', last_valued_at: '2025-12-01T08:00:00Z' },
      { id: 'a-holding', name: 'Parts holding SARL (proxy)',       asset_type: 'other', current_value: 650_000, acquisition_price: 400_000, confidence: 'low', last_valued_at: '2025-12-01T08:00:00Z' },
      { id: 'a-livret-a', name: 'Livret A', asset_type: 'cash',   current_value: 30_000, acquisition_price: 30_000, confidence: 'high', last_valued_at: '2026-05-30T08:00:00Z' },
      { id: 'a-ldds',     name: 'LDDS',     asset_type: 'cash',   current_value: 20_000, acquisition_price: 20_000, confidence: 'high', last_valued_at: '2026-05-30T08:00:00Z' },
    ],
    debts: [
      { asset_id: 'a-lmnp1', capital_remaining: 200_000, monthly_payment: 1100 },
      { asset_id: 'a-lmnp2', capital_remaining: 150_000, monthly_payment:  830 },
    ],
    snapshots: [
      // 12 mois, croissance significative (entrepreneur)
      { snapshot_date: '2025-05-30', total_gross_value: 3_300_000, total_net_value: 2_950_000, total_debt: 350_000 },
      { snapshot_date: '2025-11-30', total_gross_value: 3_400_000, total_net_value: 3_050_000, total_debt: 350_000 },
      { snapshot_date: '2026-05-30', total_gross_value: 3_500_000, total_net_value: 3_150_000, total_debt: 350_000 },
    ].reverse(),
    portfolioSummary: {
      // MV valorisée = 200 (PEA ETF) + 150 (CTO actions) + 100 (CTO actions diverses) + 150 (crypto BTC/ETH)
      //              = 600 000  (mais une position holding-rachat est non valorisée → cf. BUG-1)
      // Pour matérialiser BUG-1 ici, je mets une position « stock-options employer » sans prix : CB 100k, MV null
      // MV totale valorisée = 200 + 150 + 100 + 150 = 600 000
      // CB totale = 600 000 + 100 000 (stock-options) = 700 000
      // CB valued = 600 000
      // Donc portfolioBrut hybrid = 600 + (700 − 600) = 700 000 → grossValueHybrid +100k vs MV strict
      totalMarketValue:      600_000,
      totalCostBasis:        700_000,
      totalCostBasisValued:  600_000,
      totalUnrealizedPnL:    0,
      totalUnrealizedPnLPct: 0,
      positionsCount:        5,
      valuedPositionsCount:  4,
      freshnessRatio:        4/5,
      allocationByClass: [
        { assetClass: 'etf',     value: 200_000 },
        { assetClass: 'actions', value: 250_000 },
        { assetClass: 'crypto',  value: 150_000 },
      ],
    },
    portfolioPositions: [
      { positionId: 'p-pea-etf',     name: 'ETF World PEA',                 assetClass: 'etf',     status: 'active', marketValue: 200_000, costBasis: 180_000, priceStale: false },
      { positionId: 'p-cto-act1',    name: 'Apple + MSFT CTO',               assetClass: 'actions', status: 'active', marketValue: 150_000, costBasis: 140_000, priceStale: false },
      { positionId: 'p-cto-act2',    name: 'CAC 40 diversifié CTO',          assetClass: 'actions', status: 'active', marketValue: 100_000, costBasis:  90_000, priceStale: false },
      { positionId: 'p-cto-stockopt', name: 'Stock-options employeur (legacy)', assetClass: 'actions', status: 'active', marketValue: null,   costBasis: 100_000, priceStale: true  },
      { positionId: 'p-crypto-btc',  name: 'BTC + ETH',                       assetClass: 'crypto',  status: 'active', marketValue: 150_000, costBasis:  90_000, priceStale: false },
    ],
    realEstatePortfolio: {
      properties: [
        { propertyId: 'p-rp',    propertyName: 'RP Paris XVI',         assetId: 'a-rp',    simulation: { incompleteData: true  }, driftAlerts: [] },
        { propertyId: 'p-lmnp1', propertyName: 'LMNP Cannes',           assetId: 'a-lmnp1', simulation: { incompleteData: false }, driftAlerts: [] },
        { propertyId: 'p-lmnp2', propertyName: 'LMNP Aix-en-Provence',  assetId: 'a-lmnp2', simulation: { incompleteData: false }, driftAlerts: [] },
      ],
      totalCapitalRemaining: 350_000,
      totalMonthlyCFYear1:   900,
    },
    transactionsPortefeuille: [],
    asOfDate: '2026-05-30',
    // ── Cash V1.1 — 4 livrets réalistes pour tester le taux moyen pondéré ─
    // Les 2 premiers ont `asset_id` correspondant aux assets legacy
    // `a-livret-a` / `a-ldds` → dédup activée côté `computeCashSummary` :
    // ces livrets remplacent les balances legacy au niveau de cashSummary.
    // Les 2 derniers (LEP, CEL) ont `asset_id: null` → ajoutés sans dédup.
    //
    // Total cash (via cashAccounts) = 22 950 + 12 000 + 10 000 + 8 000 = 52 950 €
    // Taux moyen pondéré attendu :
    //   (22950×3 + 12000×3 + 10000×4 + 8000×1,5) / 52950
    //   = 1 568,50 / 52 950 = 2,962 % (≈ 2,92 % annoncé dans le brief V1.1)
    //
    // Note : `grossValueMVStrict` reste à 3 450 000 € (calculé sur
    // `assets[].current_value`, qui inclut toujours les 50 k€ de cash
    // legacy). La divergence brut Dashboard vs cashSummary est précisément
    // ce que le refactor totals (Volet B) va corriger en V1.1.
    cashAccounts: [
      { id: 'c-la',   asset_id: 'a-livret-a', balance: 22_950, currency: 'EUR',
        account_type: 'livret_a', interest_rate: 3.0, bank_name: 'Bourso',
        created_at: '2023-01-15' },
      { id: 'c-ldds', asset_id: 'a-ldds',     balance: 12_000, currency: 'EUR',
        account_type: 'ldds',     interest_rate: 3.0, bank_name: 'Bourso',
        created_at: '2023-01-15' },
      { id: 'c-lep',  asset_id: null,         balance: 10_000, currency: 'EUR',
        account_type: 'lep',      interest_rate: 4.0, bank_name: 'BNP',
        created_at: '2023-06-01' },
      { id: 'c-cel',  asset_id: null,         balance:  8_000, currency: 'EUR',
        account_type: 'cel',      interest_rate: 1.5, bank_name: 'BNP',
        created_at: '2023-06-01' },
    ],
  },

  expected: {
    // assetsValue = 600 + 400 + 300 + 850 + 650 + 30 + 20 = 2 850 000
    // portfolioBrut MV strict = 600 000
    // grossValueMVStrict = 3 450 000
    // ⚠ Diffère du brut hybride (3 550 000) de 100 000 € — magnitude BUG-1
    grossValueMVStrict: 3_450_000,
    totalDebt:          350_000,
    netValue:           3_100_000,
    cashFlowImmoSimY1:  900,
    topConsolidatedAfterRefactor: [
      { label: 'Parts SCI familiale',  value: 850_000, type: 'other' },
      { label: 'Parts holding SARL',   value: 650_000, type: 'other' },
      { label: 'RP Paris XVI',         value: 600_000, type: 'real_estate' },
      { label: 'CTO',                  value: 350_000, type: 'cto' },
      { label: 'LMNP Cannes',          value: 400_000, type: 'real_estate' },
    ],
    // Taxonomie unifiée P0.6 (V1.2 livré). Base = grossValueMVStrict (3 450 000) :
    //   autres (SCI + holding, mappés depuis asset_type='other') 1 500 000 → 43,48 %
    //   immobilier_physique 1 300 000 → 37,68 %
    //   actions (CTO valorisé) 250 000 → 7,25 %  (stock-options non valorisées exclues)
    //   etf 200 000 → 5,80 %
    //   crypto 150 000 → 4,35 %
    //   cash 50 000 → 1,45 %
    allocation: [
      { key: 'autres',              label: 'Autres',     valueEur: 1_500_000, percent: 43.48 },
      { key: 'immobilier_physique', label: 'Immobilier', valueEur: 1_300_000, percent: 37.68 },
      { key: 'actions',             label: 'Actions',    valueEur:   250_000, percent:  7.25 },
      { key: 'etf',                 label: 'ETF',        valueEur:   200_000, percent:  5.80 },
      { key: 'crypto',              label: 'Crypto',     valueEur:   150_000, percent:  4.35 },
      { key: 'cash',                label: 'Cash',       valueEur:    50_000, percent:  1.45 },
    ],
    // V1.3 P0.3 — Performance
    twr_portefeuille_pct: null,            // pas de transactions historisées
    // Croissance patrimoine : 2 950 000 → 3 150 000 sur 1 an (365 j ≈ 0.9993 an)
    //   cagr = (3150/2950)^(1/0.9993) − 1 ≈ 6.78 %
    croissance_patrimoine_pct: 6.78,
    confidenceScoreNote:
      'Livrets 50k high + portfolio 600k frais = 650 000 / 3 450 000 ≈ 18,8 %. '
      + 'Parts SCI/holding en `low` → indicateur lourdement plombé, normal pour ce profil.',
    notes: [
      'Audit Phase 2 : 4/10 — profil structurellement mal servi par le modèle de données.',
      'BUG-1 matérialisé par les stock-options non valorisées (100 000 € de CB',
      'comptés en MV dans le brut hybride).',
      'BUG-5 critique : top atomique mélange immobilier, parts non cotées (proxy) et',
      'positions atomiques → illisible pour ce profil.',
      'Le badge « Fonctionnalités SCI/holding à venir » (5.6) sera affiché ici.',
    ],
  },

  currentBuggy: {
    // assetsValue = 2 850 000
    // portfolioBrut hybrid = 600 + (700 − 600) = 700 000
    // grossValue = 3 550 000  ← surévalué de 100 000 € (BUG-1)
    grossValueHybrid:   3_550_000,
    netValueFromHybrid: 3_200_000,
    // 350 000 / 3 550 000 × 100 = 9.8591 → 9.86
    debtRatioPct:       9.86,
    cashFlowMonthly:    900,
    // 2 950 000 → 3 150 000 sur 1 an → (3150/2950)^(1/1) − 1 ≈ 0.0678 → 6.78 %
    cagrPct:            6.78,
    // highConfAssets = 50 000 (livrets only — RE en medium, SCI/holding en low)
    // freshPortfolio = 600 000
    // confScore = 650 000 / 3 550 000 = 18.31
    confidenceScorePct: 18.31,
    topAssetsByValue: [
      { name: 'Parts SCI familiale (proxy)',       type: 'other',       value: 850_000, percent: 23.94 },
      { name: 'Parts holding SARL (proxy)',         type: 'other',       value: 650_000, percent: 18.31 },
      { name: 'RP Paris XVI',                       type: 'real_estate', value: 600_000, percent: 16.90 },
      { name: 'LMNP Cannes',                        type: 'real_estate', value: 400_000, percent: 11.27 },
      { name: 'LMNP Aix-en-Provence',               type: 'real_estate', value: 300_000, percent:  8.45 },
    ],
    allocationKeys: ['asset:real_estate', 'asset:other', 'asset:cash', 'class:etf', 'class:actions', 'class:crypto'],
  },

  triggers: ['BUG-1', 'BUG-3', 'BUG-5', 'BUG-6'],
}
