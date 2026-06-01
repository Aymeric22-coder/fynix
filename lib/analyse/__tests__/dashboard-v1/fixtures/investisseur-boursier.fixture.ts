/**
 * Profil 3 — L'investisseur boursier (35 ans, ~160 k€, 80 % financier).
 *
 * Composition métier :
 *   - PEA  80 k€ — 4 ETF (CW8 30k, émergents 20k, Europe 15k, small 15k)
 *   - CTO  37 k€ valorisés (Tesla 15k, Apple 22k) + 1 action non valorisée (CB 3k)
 *   - AV   30 k€ (Fonds euros 18k, UC ETF 12k)
 *   - Livret A 10 k€ (assets table)
 *   - Pas d'immo, pas de dette
 *
 * Cette fixture est conçue pour **déclencher explicitement BUG-1** : la
 * position CTO non valorisée (MV null, CB 3 000 €) fait que le brut hybride
 * actuel surévalue le patrimoine de 3 000 €.
 */
import type { DashboardFixture } from './types'

export const INVESTISSEUR_BOURSIER_FIXTURE: DashboardFixture = {
  id:          'investisseur-boursier',
  name:        'L\'investisseur boursier',
  description: '~160 k€, 80 % financier (PEA + CTO + AV) + livret de précaution.',

  inputs: {
    assets: [
      {
        id: 'a-livret-a',
        name: 'Livret A',
        asset_type: 'cash',
        current_value: 10_000,
        acquisition_price: 10_000,
        confidence: 'high',
        last_valued_at: '2026-05-30T08:00:00Z',
      },
    ],
    debts: [],
    snapshots: [
      // 6 mois — apports mensuels d'épargne typiques d'un investisseur DCA
      // (~+1 000 €/mois) : la croissance du net intègre 6 × 1 000 = 6 000 €
      // d'apports, ce qui prouve BUG-2 (CAGR sur le net inclut ces apports).
      { snapshot_date: '2025-12-01', total_gross_value: 152_000, total_net_value: 152_000, total_debt: 0 },
      { snapshot_date: '2026-01-01', total_gross_value: 154_000, total_net_value: 154_000, total_debt: 0 },
      { snapshot_date: '2026-02-01', total_gross_value: 155_500, total_net_value: 155_500, total_debt: 0 },
      { snapshot_date: '2026-03-01', total_gross_value: 157_000, total_net_value: 157_000, total_debt: 0 },
      { snapshot_date: '2026-04-01', total_gross_value: 158_500, total_net_value: 158_500, total_debt: 0 },
      { snapshot_date: '2026-05-30', total_gross_value: 160_000, total_net_value: 160_000, total_debt: 0 },
    ].reverse(),
    portfolioSummary: {
      // MV = 30 + 20 + 15 + 15 + 15 + 22 + 18 + 12 = 147 000 €
      totalMarketValue:      147_000,
      // CB valorisées : 28 + 18 + 14 + 13 + 12 + 19 + 17 + 11 = 132 000
      // CB totale     : 132 000 + 3 000 (small non valorisée) = 135 000
      totalCostBasis:        135_000,
      totalCostBasisValued:  132_000,
      totalUnrealizedPnL:    15_000,
      totalUnrealizedPnLPct: 11.36,
      positionsCount:        9,
      valuedPositionsCount:  8,
      freshnessRatio:        8/9,
      allocationByClass: [
        { assetClass: 'etf',         value: 92_000 },   // 30 + 20 + 15 + 15 (PEA) + 12 (UC AV)
        { assetClass: 'actions',     value: 37_000 },   // Tesla 15 + Apple 22
        { assetClass: 'fonds_euros', value: 18_000 },
      ],
    },
    portfolioPositions: [
      { positionId: 'p-cw8',     name: 'Amundi MSCI World UCITS ETF',          assetClass: 'etf',         status: 'active', marketValue: 30_000, costBasis: 28_000, priceStale: false },
      { positionId: 'p-em',      name: 'iShares MSCI Emerging Markets',         assetClass: 'etf',         status: 'active', marketValue: 20_000, costBasis: 18_000, priceStale: false },
      { positionId: 'p-eur',     name: 'Lyxor STOXX Europe 600',                assetClass: 'etf',         status: 'active', marketValue: 15_000, costBasis: 14_000, priceStale: false },
      { positionId: 'p-small',   name: 'Amundi MSCI World Small Cap',           assetClass: 'etf',         status: 'active', marketValue: 15_000, costBasis: 13_000, priceStale: false },
      { positionId: 'p-tsla',    name: 'Tesla Inc (TSLA)',                       assetClass: 'actions',     status: 'active', marketValue: 15_000, costBasis: 12_000, priceStale: false },
      { positionId: 'p-aapl',    name: 'Apple Inc (AAPL)',                       assetClass: 'actions',     status: 'active', marketValue: 22_000, costBasis: 19_000, priceStale: false },
      // Position « bug-1 » : prix obsolète → MV null, CB 3 000 €
      { positionId: 'p-untracked', name: 'Action non valorisée (legacy)',         assetClass: 'actions',     status: 'active', marketValue: null,   costBasis:  3_000, priceStale: true  },
      { positionId: 'p-av-fe',   name: 'Fonds Euros AV',                         assetClass: 'fonds_euros', status: 'active', marketValue: 18_000, costBasis: 17_000, priceStale: false },
      { positionId: 'p-av-uc',   name: 'UC ETF World AV',                        assetClass: 'etf',         status: 'active', marketValue: 12_000, costBasis: 11_000, priceStale: false },
    ],
    realEstatePortfolio: {
      properties: [],
      totalCapitalRemaining: 0,
      totalMonthlyCFYear1:   0,
    },
    transactionsPortefeuille: [],
    asOfDate: '2026-05-30',
  },

  expected: {
    // assetsValue (Livret) = 10 000
    // portfolioBrut MV STRICT = 147 000 (on n'inclut PAS les 3 000 € CB de la
    // position non valorisée — c'est précisément le fix de P0.2)
    grossValueMVStrict: 157_000,
    totalDebt:          0,
    netValue:           157_000,
    cashFlowImmoSimY1:  0,
    // Top consolidé attendu après P0.5 :
    //   PEA total = 30 + 20 + 15 + 15 = 80 000
    //   CTO total = 15 + 22 + 0 (non valorisée non comptée en MV strict)
    //     = 37 000 (ou 40 000 si on inclut CB proxy — décision métier
    //     à prendre, ici on retient MV stricte cohérente avec brut)
    //   AV total  = 18 + 12 = 30 000
    //   Livret    = 10 000
    topConsolidatedAfterRefactor: [
      { label: 'PEA',           value: 80_000, type: 'pea' },
      { label: 'CTO',           value: 37_000, type: 'cto' },
      { label: 'Assurance-vie', value: 30_000, type: 'av' },
      { label: 'Livret A',      value: 10_000, type: 'livret' },
    ],
    // Taxonomie unifiée P0.6 (V1.2 livré). Base = grossValueMVStrict (157 000) :
    //   etf       = 30+20+15+15 (PEA) + 12 (UC AV) = 92 000 → 58,60 %
    //   actions   = 15 + 22 = 37 000 → 23,57 %
    //   obligations (← fonds_euros) = 18 000 → 11,46 %
    //   cash      = 10 000 → 6,37 %
    //   NB : la position p-untracked (CB 3 000 €) n'est PAS dans
    //   allocationByClass et n'apparaît donc pas dans le donut — c'est
    //   précisément ce que doit faire P0.2 (séparer MV du brut).
    allocation: [
      { key: 'etf',         label: 'ETF',         valueEur: 92_000, percent: 58.60 },
      { key: 'actions',     label: 'Actions',     valueEur: 37_000, percent: 23.57 },
      { key: 'obligations', label: 'Obligations', valueEur: 18_000, percent: 11.46 },
      { key: 'cash',        label: 'Cash',        valueEur: 10_000, percent:  6.37 },
    ],
    // V1.3 P0.3 — Performance
    twr_portefeuille_pct: null,            // pas de transactions historisées
    // Croissance patrimoine : 152k → 160k sur 180 j (≈ 0.4928 an), 10.97 %
    croissance_patrimoine_pct: 10.97,
    confidenceScoreNote:
      'Livret cash high (10 000) + portfolio frais (147 000) = 157 000 / 157 000 = 100 %. '
      + 'NB : le score actuel utilise grossValueHybrid au dénominateur, ce qui dilue (157 / 160 = 98,13 %).',
    notes: [
      'Audit Phase 2 : 4/10 — top atomique illisible et CF mensuel = 0 € malgré',
      'des dividendes potentiels (BUG-3).',
      'BUG-1 matérialisé par `p-untracked` : 3 000 € de CB comptés en MV.',
      'BUG-2 visible : la croissance brute 152 → 160 k€ sur 6 mois inclut',
      '~6 000 € d\'apports DCA — CAGR « performance » apparente très surévaluée.',
    ],
  },

  currentBuggy: {
    // assetsValue   = 10 000
    // portfolioBrut = 147 000 + (135 000 − 132 000) = 147 000 + 3 000 = 150 000
    // grossValue    = 160 000  ← surévalué de 3 000 € (BUG-1)
    grossValueHybrid:   160_000,
    netValueFromHybrid: 160_000,
    debtRatioPct:       0,
    cashFlowMonthly:    0,
    // 152 000 → 160 000 sur 0,4932 an :
    //   (160/152)^(1/0.4928) − 1 ≈ 0.1097 → 10.97 %
    cagrPct:            10.97,
    // highConfAssets (livret high) = 10 000
    // freshPortfolio = MV des positions active && !priceStale && marketValue !== null
    //   = 30+20+15+15+15+22+18+12 = 147 000  (p-untracked exclu : priceStale=true et MV=null)
    // confScore = (10 000 + 147 000) / 160 000 × 100 = 157/160 = 98.125 → 98.13
    confidenceScorePct: 98.13,
    // Top 5 atomique (BUG-5) : trié par valeur absolue
    topAssetsByValue: [
      { name: 'Amundi MSCI World UCITS ETF',     type: 'etf',         value: 30_000, percent: 18.75 },
      { name: 'Apple Inc (AAPL)',                 type: 'actions',     value: 22_000, percent: 13.75 },
      { name: 'iShares MSCI Emerging Markets',    type: 'etf',         value: 20_000, percent: 12.50 },
      { name: 'Fonds Euros AV',                   type: 'fonds_euros', value: 18_000, percent: 11.25 },
      // 3 positions ex æquo à 15 000 : Lyxor STOXX 600, Amundi Small Cap, Tesla
      // L'ordre exact dépend de la stabilité du sort ; on capture la 1ʳᵉ rencontrée.
      { name: 'Lyxor STOXX Europe 600',           type: 'etf',         value: 15_000, percent:  9.375 },
    ],
    // BUG-6 : clés `asset:cash` + `class:*` mélangées
    allocationKeys: ['asset:cash', 'class:etf', 'class:actions', 'class:fonds_euros'],
  },

  triggers: ['BUG-1', 'BUG-3', 'BUG-5', 'BUG-6'],
}
