/**
 * Profil 4 — Le patrimoine diversifié (50 ans, ~800 k€ net).
 *
 * Composition métier :
 *   - RP 400 k€ (dette 100 k€, sim incomplète)
 *   - Locatif A 280 k€ (dette 150 k€, CF Y1 +200 €/mois)
 *   - Locatif B 220 k€ (dette 100 k€, CF Y1 +150 €/mois)
 *   - PEA 80 k€ (3 ETF)
 *   - AV  60 k€ (UC + fonds euros)
 *   - SCPI 30 k€
 *   - PER 20 k€
 *   - Livret A + LDDS = 60 k€ (assets cash)
 *
 * Brut = 1 150 000 €  ·  Dette = 350 000 €  ·  Net = 800 000 €
 * CF Y1 simulé = +200 + 150 = +350 €/mois (RP exclue car sim incomplète)
 */
import type { DashboardFixture } from './types'

export const PATRIMOINE_DIVERSIFIE_FIXTURE: DashboardFixture = {
  id:          'patrimoine-diversifie',
  name:        'Le patrimoine diversifié',
  description: '50 ans, 800 k€ net, mix RP + 2 locatifs + portefeuille + livrets.',

  inputs: {
    assets: [
      { id: 'a-rp', name: 'Résidence principale (Nantes)', asset_type: 'real_estate', current_value: 400_000, acquisition_price: 350_000, confidence: 'medium', last_valued_at: '2026-05-01T08:00:00Z' },
      { id: 'a-la', name: 'Locatif A (Angers)',             asset_type: 'real_estate', current_value: 280_000, acquisition_price: 250_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      { id: 'a-lb', name: 'Locatif B (Le Mans)',            asset_type: 'real_estate', current_value: 220_000, acquisition_price: 200_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      { id: 'a-livret-a', name: 'Livret A', asset_type: 'cash', current_value: 30_000, acquisition_price: 30_000, confidence: 'high', last_valued_at: '2026-05-30T08:00:00Z' },
      { id: 'a-ldds',     name: 'LDDS',     asset_type: 'cash', current_value: 30_000, acquisition_price: 30_000, confidence: 'high', last_valued_at: '2026-05-30T08:00:00Z' },
    ],
    debts: [
      { asset_id: 'a-rp', capital_remaining: 100_000, monthly_payment:  600 },
      { asset_id: 'a-la', capital_remaining: 150_000, monthly_payment:  800 },
      { asset_id: 'a-lb', capital_remaining: 100_000, monthly_payment:  550 },
    ],
    snapshots: [
      // 12 mois — montre clairement BUG-2 : croissance 750 → 800 k€ inclut
      // les apports d'épargne sur 1 an (≈ 2 500 €/mois × 12 = 30 000 €).
      { snapshot_date: '2025-06-01', total_gross_value: 1_100_000, total_net_value: 750_000, total_debt: 350_000 },
      { snapshot_date: '2026-05-30', total_gross_value: 1_150_000, total_net_value: 800_000, total_debt: 350_000 },
    ].reverse(),
    portfolioSummary: {
      // MV = 80 (PEA) + 60 (AV) + 30 (SCPI) + 20 (PER) = 190 000
      totalMarketValue:      190_000,
      totalCostBasis:        170_000,
      totalCostBasisValued:  170_000,
      totalUnrealizedPnL:    20_000,
      totalUnrealizedPnLPct: 11.76,
      positionsCount:        7,
      valuedPositionsCount:  7,
      freshnessRatio:        1.0,
      allocationByClass: [
        { assetClass: 'etf',         value: 80_000 },
        { assetClass: 'fonds_euros', value: 40_000 },
        { assetClass: 'etf',         value: 20_000 },  // UC ETF AV — sera fusionné par le donut sur la clé `class:etf`
        { assetClass: 'scpi',        value: 30_000 },
        { assetClass: 'fonds_euros', value: 20_000 },  // PER fonds euros
      ],
    },
    portfolioPositions: [
      // V1.3 P0.3 — `currentQuantity` ajouté pour permettre le calcul TWR.
      //   220 parts × prix actuel (50 000 / 220 = 227.27 €) = 50 000 € MV.
      { positionId: 'p-pea-1',  name: 'ETF World PEA',         assetClass: 'etf',         status: 'active', marketValue: 50_000, costBasis: 45_000, priceStale: false, currentQuantity: 220 },
      { positionId: 'p-pea-2',  name: 'ETF émergents PEA',     assetClass: 'etf',         status: 'active', marketValue: 30_000, costBasis: 27_000, priceStale: false },
      { positionId: 'p-av-fe',  name: 'Fonds Euros AV',        assetClass: 'fonds_euros', status: 'active', marketValue: 40_000, costBasis: 38_000, priceStale: false },
      { positionId: 'p-av-uc',  name: 'UC ETF World AV',       assetClass: 'etf',         status: 'active', marketValue: 20_000, costBasis: 18_000, priceStale: false },
      { positionId: 'p-scpi-1', name: 'SCPI Corum Origin',     assetClass: 'scpi',        status: 'active', marketValue: 30_000, costBasis: 28_000, priceStale: false },
      { positionId: 'p-per-fe', name: 'PER Fonds Euros',       assetClass: 'fonds_euros', status: 'active', marketValue: 20_000, costBasis: 19_000, priceStale: false },
    ],
    realEstatePortfolio: {
      properties: [
        { propertyId: 'p-rp', propertyName: 'Résidence principale (Nantes)', assetId: 'a-rp', simulation: { incompleteData: true  }, driftAlerts: [] },
        { propertyId: 'p-la', propertyName: 'Locatif A (Angers)',             assetId: 'a-la', simulation: { incompleteData: false }, driftAlerts: [] },
        { propertyId: 'p-lb', propertyName: 'Locatif B (Le Mans)',            assetId: 'a-lb', simulation: { incompleteData: false }, driftAlerts: [] },
      ],
      totalCapitalRemaining: 350_000,
      totalMonthlyCFYear1:   350,
    },
    // ── V1.3 P0.3 — FIXTURE ENRICHIE pour TWR ─────────────────────────
    // Position phare : p-pea-1 (ETF World PEA). 3 achats sur 17 mois
    // calibrés pour matérialiser une volatilité réaliste (apport au
    // sommet → rentrée en perte → remontée) qui fait diverger TWR (perf
    // pure) de la croissance patrimoniale (apports inclus).
    //
    // Calcul manuel des segments (cf. compte-rendu V1.3 § 4) :
    //   T1 = 2025-01-01 : 150 parts @ 200 €  → 30 000 € investis (qty=150)
    //   T2 = 2025-06-01 : 50 parts  @ 220 €  → 11 000 € (qty=200)
    //   T3 = 2025-12-01 : 20 parts  @ 200 €  → 4 000 € (qty=220)
    //   asOfDate = 2026-05-30, MV = 50 000 €  (qty=220, prix actuel = 227,27 €)
    //
    //   Segments générés par l'assembleur :
    //     Seg 1 : 2025-01-01 → 2025-06-01 (151 j) : 30 000 → 33 000   (rdt +10,00 %)
    //     Seg 2 : 2025-06-01 → 2025-12-01 (183 j) : 44 000 → 40 000   (rdt −9,09 %)
    //     Seg 3 : 2025-12-01 → 2026-05-30 (180 j) : 44 000 → 50 000   (rdt +13,64 %)
    //
    //   TWR cumulé   = 1,10 × 0,9091 × 1,1364 − 1 = +13,64 %
    //   totalDays    = 151 + 183 + 180 = 514 j
    //   TWR annualisé = (1,13636)^(365/514) − 1 ≈ +9,50 %  (tolérance 0,1 pp)
    transactionsPortefeuille: [
      { executedAt: '2025-01-01', type: 'purchase', positionId: 'p-pea-1', quantity: 150, unitPriceEur: 200, amountEur: 30_000 },
      { executedAt: '2025-06-01', type: 'purchase', positionId: 'p-pea-1', quantity:  50, unitPriceEur: 220, amountEur: 11_000 },
      { executedAt: '2025-12-01', type: 'purchase', positionId: 'p-pea-1', quantity:  20, unitPriceEur: 200, amountEur:  4_000 },
    ],
    asOfDate: '2026-05-30',
  },

  expected: {
    // assetsValue = 400+280+220+30+30 = 960 000
    // portfolioBrut MV strict = 190 000
    // grossValueMVStrict = 1 150 000
    grossValueMVStrict: 1_150_000,
    totalDebt:          350_000,
    netValue:           800_000,
    cashFlowImmoSimY1:  350,
    topConsolidatedAfterRefactor: [
      { label: 'RP Nantes',                 value: 400_000, type: 'real_estate' },
      { label: 'Locatif A (Angers)',         value: 280_000, type: 'real_estate' },
      { label: 'Locatif B (Le Mans)',        value: 220_000, type: 'real_estate' },
      { label: 'PEA',                        value:  80_000, type: 'pea' },
      { label: 'Assurance-vie',              value:  60_000, type: 'av' },
    ],
    // Taxonomie unifiée P0.6 (V1.2 livré). Base = grossValueMVStrict (1 150 000) :
    //   immobilier_physique 900 000 → 78,26 %
    //   etf (PEA 80 + UC AV 20) = 100 000 → 8,70 %
    //   cash (livret A + LDDS) = 60 000 → 5,22 %
    //   obligations (← fonds_euros : AV 40 + PER 20) = 60 000 → 5,22 %
    //   scpi = 30 000 → 2,61 %
    // Ex æquo cash/obligations à 60 000 → tie-breaker : 'cash' < 'obligations'.
    allocation: [
      { key: 'immobilier_physique', label: 'Immobilier',  valueEur: 900_000, percent: 78.26 },
      { key: 'etf',                 label: 'ETF',         valueEur: 100_000, percent:  8.70 },
      { key: 'cash',                label: 'Cash',        valueEur:  60_000, percent:  5.22 },
      { key: 'obligations',         label: 'Obligations', valueEur:  60_000, percent:  5.22 },
      { key: 'scpi',                label: 'SCPI',        valueEur:  30_000, percent:  2.61 },
    ],
    // V1.3 P0.3 — Performance (fixture enrichie, cf. transactionsPortefeuille)
    //   TWR portefeuille : +9,50 %/an (calcul manuel ci-dessus sur p-pea-1)
    //   Croissance patrimoine : 750k → 800k sur 1 an ≈ +6,73 %/an (apports inclus)
    //   Divergence pédagogique : 9,50 − 6,73 = 2,77 pp > 1 pp ✅
    twr_portefeuille_pct: 9.50,
    croissance_patrimoine_pct: 6.73,
    confidenceScoreNote:
      'Biens RE en `medium` → ne comptent pas. Livrets 60k high + portfolio frais 190k = 250 000. '
      + '250 000 / 1 150 000 ≈ 21,7 %. Score plombé par les RE comme pour le profil 2.',
    notes: [
      'Audit Phase 2 : 6/10 — tout présent mais effet « tableau de bord d\'avion ».',
      'BUG-2 clairement matérialisé : croissance net 750 → 800 k€ sur 1 an inclut',
      '≈ 30 000 € d\'apports → CAGR ≈ +6,7 % alors que performance réelle ≈ +2-3 %.',
      'Le donut allocation actuel fusionne 2 entrées `class:etf` (PEA + UC AV) en',
      'une seule clé — bonne nouvelle pour la taxonomie unifiée.',
    ],
  },

  currentBuggy: {
    grossValueHybrid:   1_150_000,  // pas de positions non valorisées → identique au MV strict
    netValueFromHybrid: 800_000,
    debtRatioPct:       30.43,      // 350 000 / 1 150 000 × 100
    cashFlowMonthly:    350,
    // 750 → 800 sur 1 an exact (2025-06-01 → 2026-05-30, ≈ 0.997 an)
    //   (800/750)^(1/0.997) − 1 ≈ 0.0670 → 6.70 %
    //   En réalité, le temps écoulé est 363 jours = 0,99384 an → CAGR ≈ 6.73 %
    cagrPct:            6.73,
    // highConfAssets (livrets high) = 60 000
    // freshPortfolio = 190 000
    // confScore = 250 000 / 1 150 000 × 100 = 21.7391 → 21.74
    confidenceScorePct: 21.74,
    topAssetsByValue: [
      { name: 'Résidence principale (Nantes)', type: 'real_estate', value: 400_000, percent: 34.78 },
      { name: 'Locatif A (Angers)',             type: 'real_estate', value: 280_000, percent: 24.35 },
      { name: 'Locatif B (Le Mans)',            type: 'real_estate', value: 220_000, percent: 19.13 },
      { name: 'ETF World PEA',                  type: 'etf',         value:  50_000, percent:  4.35 },
      { name: 'Fonds Euros AV',                 type: 'fonds_euros', value:  40_000, percent:  3.48 },
    ],
    allocationKeys: ['asset:real_estate', 'asset:cash', 'class:etf', 'class:fonds_euros', 'class:scpi'],
  },

  triggers: ['BUG-2', 'BUG-5', 'BUG-6'],
}
