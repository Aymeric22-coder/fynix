/**
 * Profil 5 — Le préretraité (60 ans, ~1,5 M€, focus revenus passifs).
 *
 * Composition métier :
 *   - RP 500 k€ (sans dette)
 *   - Locatif 400 k€ (dette résiduelle 50 k€, CF Y1 +600 €/mois)
 *   - AV 450 k€ (Fonds Euros 300k + UC 150k)
 *   - PER 100 k€
 *   - Livret A + LDDS = 100 k€ (assets cash)
 *
 * Brut = 1 550 000 €  ·  Dette = 50 000 €  ·  Net = 1 500 000 €
 * Patrimoine immobilier net = 850 000 € (cf. seuil IFI 1,3 M€ NON dépassé sur le brut immo).
 *
 * Met en lumière :
 *   - BUG-3 : revenus passifs (~3 000 €/mois si on inclut dividendes/intérêts AV)
 *     mais l\'écran affiche +600 €/mois — manque ~2 400 €/mois de revenus réels.
 *   - Pertinence Phase 2 : 5/10 — manque focus rente projetée + transmission.
 */
import type { DashboardFixture } from './types'

export const PRERETRAITE_FIXTURE: DashboardFixture = {
  id:          'preretraite',
  name:        'Le préretraité',
  description: '60 ans, 1,5 M€ net, focus revenus passifs et transmission.',

  inputs: {
    assets: [
      { id: 'a-rp',  name: 'Résidence principale (Bordeaux)',    asset_type: 'real_estate', current_value: 500_000, acquisition_price: 380_000, confidence: 'medium', last_valued_at: '2026-04-01T08:00:00Z' },
      { id: 'a-loc', name: 'Locatif Bassin d\'Arcachon',          asset_type: 'real_estate', current_value: 400_000, acquisition_price: 320_000, confidence: 'medium', last_valued_at: '2026-04-15T08:00:00Z' },
      { id: 'a-livret-a', name: 'Livret A', asset_type: 'cash',   current_value: 50_000, acquisition_price: 50_000, confidence: 'high', last_valued_at: '2026-05-30T08:00:00Z' },
      { id: 'a-ldds',     name: 'LDDS',     asset_type: 'cash',   current_value: 50_000, acquisition_price: 50_000, confidence: 'high', last_valued_at: '2026-05-30T08:00:00Z' },
    ],
    debts: [
      { asset_id: 'a-loc', capital_remaining: 50_000, monthly_payment: 350 },
    ],
    snapshots: [
      // 24 mois — patrimoine stable autour de 1,45-1,5 M€
      { snapshot_date: '2024-05-30', total_gross_value: 1_500_000, total_net_value: 1_440_000, total_debt: 60_000 },
      { snapshot_date: '2025-05-30', total_gross_value: 1_525_000, total_net_value: 1_470_000, total_debt: 55_000 },
      { snapshot_date: '2026-05-30', total_gross_value: 1_550_000, total_net_value: 1_500_000, total_debt: 50_000 },
    ].reverse(),
    portfolioSummary: {
      // MV = 300 (FE AV) + 150 (UC AV) + 100 (PER) = 550 000
      totalMarketValue:      550_000,
      totalCostBasis:        500_000,
      totalCostBasisValued:  500_000,
      totalUnrealizedPnL:    50_000,
      totalUnrealizedPnLPct: 10.0,
      positionsCount:        5,
      valuedPositionsCount:  5,
      freshnessRatio:        1.0,
      allocationByClass: [
        { assetClass: 'fonds_euros', value: 300_000 },
        { assetClass: 'etf',         value: 100_000 },   // UC ETF AV
        { assetClass: 'actions',     value:  50_000 },   // UC actions AV
        { assetClass: 'fonds_euros', value:  60_000 },   // PER fonds euros
        { assetClass: 'etf',         value:  40_000 },   // PER ETF
      ],
    },
    portfolioPositions: [
      // V1.3 P0.3 — costBasis recalibré à 278 000 (= 200 000 + 78 000 des
      // transactions documentées plus bas) ; `currentQuantity` ajouté pour TWR.
      //   275 000 parts × prix actuel (300 000 / 275 000 = 1,0909 €) = 300 000 € MV.
      { positionId: 'p-av-fe', name: 'Fonds Euros AV BPCE',  assetClass: 'fonds_euros', status: 'active', marketValue: 300_000, costBasis: 278_000, priceStale: false, currentQuantity: 275_000 },
      { positionId: 'p-av-uc', name: 'UC ETF Monde AV',       assetClass: 'etf',         status: 'active', marketValue: 100_000, costBasis:  90_000, priceStale: false },
      { positionId: 'p-av-ac', name: 'UC Actions France AV',  assetClass: 'actions',     status: 'active', marketValue:  50_000, costBasis:  45_000, priceStale: false },
      { positionId: 'p-per-fe', name: 'PER Fonds Euros',      assetClass: 'fonds_euros', status: 'active', marketValue:  60_000, costBasis:  55_000, priceStale: false },
      { positionId: 'p-per-uc', name: 'PER UC ETF',           assetClass: 'etf',         status: 'active', marketValue:  40_000, costBasis:  30_000, priceStale: false },
    ],
    realEstatePortfolio: {
      properties: [
        { propertyId: 'p-rp',  propertyName: 'Résidence principale (Bordeaux)',  assetId: 'a-rp',  simulation: { incompleteData: true  }, driftAlerts: [] },
        { propertyId: 'p-loc', propertyName: 'Locatif Bassin d\'Arcachon',         assetId: 'a-loc', simulation: { incompleteData: false }, driftAlerts: [] },
      ],
      totalCapitalRemaining: 50_000,
      totalMonthlyCFYear1:   600,
    },
    // ── V1.3 P0.3 — FIXTURE ENRICHIE pour TWR ─────────────────────────
    // Position phare : p-av-fe (Fonds Euros AV BPCE). 2 achats sur 24 mois
    // calibrés en parts à 1 € (puis revalorisation +4 % au S2 2025 et
    // ≈+4,9 % la 2ᵉ année) — réaliste pour un fonds euros.
    //
    // Calcul manuel des segments :
    //   T1 = 2024-06-01 : 200 000 parts @ 1,00 €   → 200 000 € (qty=200k)
    //   T2 = 2025-06-01 : 75 000 parts  @ 1,04 €   →  78 000 € (qty=275k)
    //   asOfDate = 2026-05-30, MV = 300 000 €      (prix actuel = 1,0909 €)
    //
    //   Segments :
    //     Seg 1 : 2024-06-01 → 2025-06-01 (365 j) : 200 000 → 208 000   (rdt +4,00 %)
    //     Seg 2 : 2025-06-01 → 2026-05-30 (363 j) : 286 000 → 300 000   (rdt +4,90 %)
    //
    //   TWR cumulé   = 1,04 × 1,04895 − 1 ≈ +9,09 %
    //   totalDays    = 365 + 363 = 728 j
    //   TWR annualisé = (1,0909)^(365/728) − 1 ≈ +4,46 %  (tolérance 0,1 pp)
    transactionsPortefeuille: [
      { executedAt: '2024-06-01', type: 'purchase', positionId: 'p-av-fe', quantity: 200_000, unitPriceEur: 1.00, amountEur: 200_000 },
      { executedAt: '2025-06-01', type: 'purchase', positionId: 'p-av-fe', quantity:  75_000, unitPriceEur: 1.04, amountEur:  78_000 },
    ],
    asOfDate: '2026-05-30',
  },

  expected: {
    // assetsValue (2 RE + 2 cash) = 500 + 400 + 50 + 50 = 1 000 000
    // portfolioBrut MV strict = 550 000
    // grossValueMVStrict = 1 550 000
    grossValueMVStrict: 1_550_000,
    totalDebt:          50_000,
    netValue:           1_500_000,
    cashFlowImmoSimY1:  600,
    topConsolidatedAfterRefactor: [
      { label: 'Assurance-vie',              value: 450_000, type: 'av' },
      { label: 'RP Bordeaux',                 value: 500_000, type: 'real_estate' },
      { label: 'Locatif Bassin d\'Arcachon',  value: 400_000, type: 'real_estate' },
      { label: 'PER',                         value: 100_000, type: 'per' },
      { label: 'Livret A',                    value:  50_000, type: 'livret' },
    ],
    // Taxonomie unifiée P0.6 (V1.2 livré). Base = grossValueMVStrict (1 550 000) :
    //   immobilier_physique 900 000 → 58,06 %
    //   obligations (← fonds_euros : AV FE 300 + PER FE 60) = 360 000 → 23,23 %
    //   etf (UC AV 100 + PER ETF 40) = 140 000 → 9,03 %
    //   cash (livret A + LDDS) = 100 000 → 6,45 %
    //   actions (UC AV) = 50 000 → 3,23 %
    allocation: [
      { key: 'immobilier_physique', label: 'Immobilier',  valueEur: 900_000, percent: 58.06 },
      { key: 'obligations',         label: 'Obligations', valueEur: 360_000, percent: 23.23 },
      { key: 'etf',                 label: 'ETF',         valueEur: 140_000, percent:  9.03 },
      { key: 'cash',                label: 'Cash',        valueEur: 100_000, percent:  6.45 },
      { key: 'actions',             label: 'Actions',     valueEur:  50_000, percent:  3.23 },
    ],
    // V1.3 P0.3 — Performance (fixture enrichie, cf. transactionsPortefeuille)
    //   TWR portefeuille : +4,46 %/an (calcul manuel ci-dessus sur p-av-fe)
    //   Croissance patrimoine : 1 440k → 1 500k sur 2 ans ≈ +2,06 %/an (apports inclus)
    //   Divergence pédagogique : 4,46 − 2,06 = 2,40 pp > 1 pp ✅
    twr_portefeuille_pct: 4.46,
    croissance_patrimoine_pct: 2.06,
    confidenceScoreNote:
      'Livrets 100k high + portfolio 550k frais = 650 000 / 1 550 000 ≈ 41,9 %. RE en `medium`.',
    notes: [
      'Profil le plus exposé au BUG-3 : revenus passifs réels ≈ Loyers nets 600 +',
      'Fonds euros AV @ 3 % ≈ 750/mois + livrets @ 3 % ≈ 250/mois = ~1 600 €/mois',
      'minimum, mais l\'écran n\'affiche que les 600 €/mois immo.',
      'Pas d\'IFI déclenché (patrimoine immobilier brut = 900 000 € < 1,3 M€).',
      'Audit Phase 2 : 5/10 — manque focus rente projetée + abattements AV.',
    ],
  },

  currentBuggy: {
    grossValueHybrid:   1_550_000,
    netValueFromHybrid: 1_500_000,
    debtRatioPct:       3.23,
    cashFlowMonthly:    600,
    // 3 snapshots, 1 440 000 → 1 500 000 sur 2 ans :
    //   (1500/1440)^(1/2) − 1 = 1.0206 − 1 ≈ 0.0206 → 2.06 %
    cagrPct:            2.06,
    // highConf = 100 000 + 550 000 = 650 000  ;  / 1 550 000 = 41.94
    confidenceScorePct: 41.94,
    topAssetsByValue: [
      { name: 'Résidence principale (Bordeaux)',  type: 'real_estate', value: 500_000, percent: 32.26 },
      { name: 'Locatif Bassin d\'Arcachon',        type: 'real_estate', value: 400_000, percent: 25.81 },
      { name: 'Fonds Euros AV BPCE',               type: 'fonds_euros', value: 300_000, percent: 19.35 },
      { name: 'UC ETF Monde AV',                   type: 'etf',         value: 100_000, percent:  6.45 },
      { name: 'PER Fonds Euros',                   type: 'fonds_euros', value:  60_000, percent:  3.87 },
    ],
    allocationKeys: ['asset:real_estate', 'asset:cash', 'class:fonds_euros', 'class:etf', 'class:actions'],
  },

  triggers: ['BUG-3', 'BUG-5', 'BUG-6'],
}
