/**
 * Profil 2 — L'investisseur immo (40 ans, 3 locatifs + RP, endettement ~60 %).
 *
 * Composition métier :
 *   - RP             : 350 000 € (dette 200 000 €, sim incomplète : pas de loyer)
 *   - Locatif 1      : 200 000 € (dette 140 000 €, CF Y1 simulé +180 €/mois)
 *   - Locatif 2      : 180 000 € (dette 130 000 €, CF Y1 simulé +150 €/mois)
 *   - Locatif 3      : 160 000 € (dette  94 000 €, CF Y1 simulé +100 €/mois)
 *   - AV (financier) :  50 000 € (cost basis 45 000 €, prix frais)
 *
 * Total brut MV = 350 + 200 + 180 + 160 + 50 = 940 000 €
 * Total dette   = 200 + 140 + 130 + 94 = 564 000 €  (≈ 60 % endettement)
 * Net           = 940 − 564 = 376 000 €
 * CF Y1 simulé  = 180 + 150 + 100 = +430 €/mois (RP exclue : sim incomplète)
 */
import type { DashboardFixture } from './types'

export const INVESTISSEUR_IMMO_FIXTURE: DashboardFixture = {
  id:          'investisseur-immo',
  name:        'L\'investisseur immobilier',
  description: 'RP + 3 locatifs, AV 50 k€, endettement ≈ 60 % du brut.',

  inputs: {
    assets: [
      { id: 'a-rp',  name: 'Résidence principale (Lyon)', asset_type: 'real_estate', current_value: 350_000, acquisition_price: 320_000, confidence: 'medium', last_valued_at: '2026-05-01T08:00:00Z' },
      { id: 'a-l1',  name: 'Locatif Saint-Étienne T3',     asset_type: 'real_estate', current_value: 200_000, acquisition_price: 180_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      { id: 'a-l2',  name: 'Locatif Roanne T2',            asset_type: 'real_estate', current_value: 180_000, acquisition_price: 160_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      { id: 'a-l3',  name: 'Locatif Villeurbanne studio',  asset_type: 'real_estate', current_value: 160_000, acquisition_price: 145_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
    ],
    debts: [
      { asset_id: 'a-rp', capital_remaining: 200_000, monthly_payment: 1100 },
      { asset_id: 'a-l1', capital_remaining: 140_000, monthly_payment:  720 },
      { asset_id: 'a-l2', capital_remaining: 130_000, monthly_payment:  680 },
      { asset_id: 'a-l3', capital_remaining:  94_000, monthly_payment:  500 },
    ],
    snapshots: [
      // 6 points sur 6 mois pour permettre un CAGR
      { snapshot_date: '2025-12-01', total_gross_value: 920_000, total_net_value: 360_000, total_debt: 560_000 },
      { snapshot_date: '2026-01-01', total_gross_value: 925_000, total_net_value: 365_000, total_debt: 560_000 },
      { snapshot_date: '2026-02-01', total_gross_value: 930_000, total_net_value: 369_000, total_debt: 561_000 },
      { snapshot_date: '2026-03-01', total_gross_value: 933_000, total_net_value: 371_000, total_debt: 562_000 },
      { snapshot_date: '2026-04-01', total_gross_value: 937_000, total_net_value: 374_000, total_debt: 563_000 },
      { snapshot_date: '2026-05-30', total_gross_value: 940_000, total_net_value: 376_000, total_debt: 564_000 },
    ].reverse(),  // DESC comme la DB
    portfolioSummary: {
      totalMarketValue:      50_000,
      totalCostBasis:        45_000,
      totalCostBasisValued:  45_000,
      totalUnrealizedPnL:    5_000,
      totalUnrealizedPnLPct: 11.11,
      positionsCount:        4,
      valuedPositionsCount:  4,
      freshnessRatio:        1.0,
      allocationByClass: [
        { assetClass: 'fonds_euros', value: 35_000 },
        { assetClass: 'etf',         value: 15_000 },
      ],
    },
    portfolioPositions: [
      { positionId: 'p-av-fe',  name: 'Fonds Euros AV Lyon',          assetClass: 'fonds_euros', status: 'active', marketValue: 35_000, costBasis: 33_000, priceStale: false },
      { positionId: 'p-av-uc1', name: 'UC Actions Europe AV',          assetClass: 'etf',         status: 'active', marketValue:  8_000, costBasis:  7_000, priceStale: false },
      { positionId: 'p-av-uc2', name: 'UC Obligations AV',             assetClass: 'etf',         status: 'active', marketValue:  4_000, costBasis:  3_500, priceStale: false },
      { positionId: 'p-av-uc3', name: 'UC Immobilier diversifié AV',   assetClass: 'etf',         status: 'active', marketValue:  3_000, costBasis:  1_500, priceStale: false },
    ],
    realEstatePortfolio: {
      properties: [
        // RP : sim incomplète (pas de loyer renseigné)
        { propertyId: 'p-rp', propertyName: 'Résidence principale (Lyon)', assetId: 'a-rp', simulation: { incompleteData: true  }, driftAlerts: [] },
        { propertyId: 'p-l1', propertyName: 'Locatif Saint-Étienne T3',     assetId: 'a-l1', simulation: { incompleteData: false }, driftAlerts: [] },
        { propertyId: 'p-l2', propertyName: 'Locatif Roanne T2',            assetId: 'a-l2', simulation: { incompleteData: false }, driftAlerts: [] },
        { propertyId: 'p-l3', propertyName: 'Locatif Villeurbanne studio',  assetId: 'a-l3', simulation: { incompleteData: false }, driftAlerts: [] },
      ],
      totalCapitalRemaining: 564_000,
      // 180 + 150 + 100 = 430 €/mois (RP exclue car sim incomplète)
      totalMonthlyCFYear1:   430,
    },
    transactionsPortefeuille: [],
    asOfDate: '2026-05-30',
  },

  expected: {
    // assetsValue (4 biens RE) = 890 000
    // portfolioBrut (MV strict) = 50 000 (toutes positions valorisées)
    // grossValueMVStrict = 940 000 €
    grossValueMVStrict: 940_000,
    // dette = CRD immo (564 000) + CRD non-immo (0)
    totalDebt:          564_000,
    netValue:           376_000,
    // CF immo Y1 simulé = +430 €/mois (RP exclue car sim incomplète)
    cashFlowImmoSimY1:  430,
    // Top consolidé : 1 bien = 1 ligne + AV totale en 1 ligne
    topConsolidatedAfterRefactor: [
      { label: 'RP Lyon',                    value: 350_000, type: 'real_estate' },
      { label: 'Locatif Saint-Étienne T3',   value: 200_000, type: 'real_estate' },
      { label: 'Locatif Roanne T2',          value: 180_000, type: 'real_estate' },
      { label: 'Locatif Villeurbanne studio', value: 160_000, type: 'real_estate' },
      { label: 'Assurance-vie',               value: 50_000,  type: 'av' },
    ],
    // Taxonomie unifiée P0.6 (V1.2 livré) :
    //   immobilier_physique 890 000 (94,7 %)
    //   obligations (← fonds_euros) 35 000 (3,7 %)
    //   etf 15 000 (1,6 %)
    allocation: [
      { key: 'immobilier_physique', label: 'Immobilier',  valueEur: 890_000, percent: 94.68 },
      { key: 'obligations',         label: 'Obligations', valueEur:  35_000, percent:  3.72 },
      { key: 'etf',                 label: 'ETF',         valueEur:  15_000, percent:  1.60 },
    ],
    // V1.3 P0.3 — Performance
    twr_portefeuille_pct: null,            // pas de transactions historisées
    // Croissance patrimoine : 360k → 376k sur 180 jours
    //   years = 180/365.25 = 0.4928, cagr = (376/360)^(1/0.4928) − 1 ≈ 9.17 %
    croissance_patrimoine_pct: 9.17,
    confidenceScoreNote:
      'Biens RE confidence=medium (manuel) → ne comptent pas en `high`. '
      + 'Seule l\'AV (50 000 €) compte → 50 000 / 940 000 ≈ 5,3 %. '
      + 'Indicateur trompeur pour ce profil immo (cf. note Phase 4 sur fiabilité).',
    notes: [
      'Audit Phase 2 : 6/10 — meilleur profil servi par le Dashboard actuel.',
      'Sur-exposition immobilier (>70 %) → l\'alerte over_exposure se déclenche.',
      'Le label « Cash-flow mensuel » est ici proche du correct (BUG-3 atténué',
      'car patrimoine majoritairement immo), mais reste imprécis car ignore les',
      'UC actions/obligations qui distribuent.',
    ],
  },

  currentBuggy: {
    // assetsValue (4 RE) = 890 000
    // portfolioBrut = 50 000 + (45 000 − 45 000) = 50 000
    // grossValue = 940 000
    grossValueHybrid:   940_000,
    // reCapital (analytique sim) = 564 000  ;  otherCapital = 0 (toutes dettes sont sur des assets immo)
    // totalDebt = 564 000
    netValueFromHybrid: 376_000,
    // 564 000 / 940 000 × 100 = 60,00
    debtRatioPct:       60.00,
    // hasSim = true (3 locatifs avec sim complète) → portfolio.totalMonthlyCFYear1 − otherMonthlyLoan
    // otherMonthlyLoan = 0 (toutes dettes sur assets immo, donc filtrées par simAssetIds)
    // cashFlow = 430 − 0 = 430
    cashFlowMonthly:    430,
    // 6 snapshots, growth net 360 → 376 sur ≈ 6 mois (0,4932 an)
    //   cagr = (376/360)^(1/0.4932) − 1 = (1.0444)^2.0276 − 1 = 1.0917 − 1 ≈ 0.0917 → 9.17 %
    //   arrondi à 2 décimales puis renvoyé tel quel
    cagrPct:            9.17,
    // highConfAssets = 0 (biens RE en `medium`) + freshPortfolio = 50 000
    // confScore = 50 000 / 940 000 × 100 = 5.319… → arrondi à 5.32
    confidenceScorePct: 5.32,
    // Top par valeur absolue : 4 biens immo entiers + positions financières atomiques
    topAssetsByValue: [
      { name: 'Résidence principale (Lyon)', type: 'real_estate', value: 350_000, percent: 37.23 },
      { name: 'Locatif Saint-Étienne T3',     type: 'real_estate', value: 200_000, percent: 21.28 },
      { name: 'Locatif Roanne T2',            type: 'real_estate', value: 180_000, percent: 19.15 },
      { name: 'Locatif Villeurbanne studio',  type: 'real_estate', value: 160_000, percent: 17.02 },
      { name: 'Fonds Euros AV Lyon',          type: 'fonds_euros', value:  35_000, percent:  3.72 },
    ],
    // Allocation : `asset:real_estate` + `class:fonds_euros` + `class:etf`
    allocationKeys: ['asset:real_estate', 'class:fonds_euros', 'class:etf'],
  },

  triggers: ['BUG-5', 'BUG-6'],
}
