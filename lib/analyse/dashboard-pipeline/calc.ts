/**
 * Pipeline Dashboard unifié — couche de calcul pure (V1.1).
 *
 * **Contrat strict pour V1.1 :** reproduire EXACTEMENT les formules du bloc
 * inline `app/(app)/dashboard/page.tsx:207-367`. Aucune correction de bug
 * dans ce sprint — les bugs documentés (BUG-1 à BUG-6 du rapport) sont
 * volontairement conservés. Les corrections viendront en V1.2/V1.3.
 *
 * **Seule déviation autorisée** (validée explicitement en clôture V1.0) :
 * un tie-breaker `id.localeCompare` est ajouté au tri du top pour rendre
 * l'ordre déterministe en cas d'ex æquo de valeur. Ce comportement est
 * sémantiquement équivalent à l'ancien dans les cas non-ex æquo, et plus
 * robuste dans les cas limites (3 positions à 15 000 € chez le boursier).
 *
 * Pureté : aucun appel I/O, aucun import Supabase. Les inputs viennent du
 * loader `load.ts` ou directement d'une fixture de test.
 */

import { formatEur, formatPercent } from '@/lib/utils/format'
import {
  TAXONOMY_LABELS, TAXONOMY_COLORS,
  mapToTaxonomy, type TaxonomyKey,
} from '@/lib/finance/asset-taxonomy'
import { computeTwr } from '@/lib/finance/twr'
import {
  buildTwrSegments,
  type PositionForSegments,
} from '@/lib/portfolio/transaction-segments'
// V2.4-BIS — Pivot d'approche : on n'utilise plus `computeTwrPerEnvelope`,
// `computeYieldPerProperty` ni `computeRatePerAccount` pour Z8.5. Ces 3
// modules restent disponibles sur le repo (utilisables pour analyses
// futures) mais sont décrochés du pipeline Dashboard.
// Le nouvel orchestrateur `buildInvestmentRankings` calcule des
// rendements INSTANTANÉS (plus-value latente / rendement locatif / taux
// contractuel) sans seuil temporel.
import {
  buildInvestmentRankings,
  type PositionForRanking,
  type PropertyForRanking,
  type CashAccountForRanking,
} from '@/lib/portfolio/investment-rankings'
import type {
  DashboardData, DashboardPipelineInputs,
  DashboardAllocationSlice, DashboardTopAsset, DashboardAlert,
  DashboardRealEstateDriftSummary, DashboardTimelinePoint,
} from './types'

/**
 * Calcule la structure `DashboardData` à partir des inputs déjà chargés.
 *
 * Réplique strictement le bloc inline de `dashboard/page.tsx`. Le tableau
 * `snapshots` est attendu en ordre DESC (latest first), conformément à la
 * requête `.order('snapshot_date', { ascending: false })`.
 */
export function computeDashboardData(inputs: DashboardPipelineInputs): DashboardData {
  const {
    assets, debts, snapshots,
    portfolioSummary, portfolioPositions, realEstatePortfolio,
  } = inputs

  // ── KPIs : brut MV strict (V1.2 P0.2) + dette + net ────────────────
  // V1.2 P0.2 — Fin de BUG-1 : le portefeuille est strictement valorisé à la
  // MV. Les positions sans prix actualisé (`marketValue === null`) ne sont
  // plus comptées en proxy cost basis dans le brut. Elles font l'objet d'un
  // indicateur séparé `unvaluedPositions*` que l'UI peut afficher comme badge.
  const assetsValue   = assets.reduce((s, a) => s + (a.current_value ?? 0), 0)
  const portfolioBrut = portfolioSummary.totalMarketValue
  const grossValue    = assetsValue + portfolioBrut

  // ── V1.2 P0.2 — Comptage positions non valorisées ───────────────────
  const unvaluedPositions = portfolioPositions.filter(
    (p) => p.status === 'active' && p.marketValue === null,
  )
  const unvaluedPositionsCount      = unvaluedPositions.length
  const unvaluedPositionsCostBasis  = unvaluedPositions.reduce((s, p) => s + p.costBasis, 0)
  const unvaluedPositionsLabel      = unvaluedPositionsCount === 0
    ? ''
    : `${unvaluedPositionsCount} position${unvaluedPositionsCount > 1 ? 's' : ''} non valorisée${unvaluedPositionsCount > 1 ? 's' : ''}`
      + ` · ${formatEur(unvaluedPositionsCostBasis, { decimals: 0 })} manquants`

  const simAssetIds = new Set(realEstatePortfolio.properties.map((p) => p.assetId))
  const reCapital    = realEstatePortfolio.totalCapitalRemaining
  const otherCapital = debts
    .filter((d) => !simAssetIds.has(d.asset_id ?? ''))
    .reduce((s, d) => s + (d.capital_remaining ?? 0), 0)
  const totalDebt    = reCapital + otherCapital
  const netValue     = grossValue - totalDebt

  // ── Cash-flow mensuel (page.tsx:228-234) ────────────────────────────
  const otherMonthlyLoan = debts
    .filter((d) => !simAssetIds.has(d.asset_id ?? ''))
    .reduce((s, d) => s + (d.monthly_payment ?? 0), 0)
  const hasImmoSim = realEstatePortfolio.properties.some((p) => !p.simulation.incompleteData)
  const cashFlow   = hasImmoSim
    ? realEstatePortfolio.totalMonthlyCFYear1 - otherMonthlyLoan
    : 0

  // ── V1.3 P0.3 — Croissance patrimoniale annualisée (apports INCLUS) ──
  // Ancien `cagrValue` renommé pour expliciter le périmètre. Même formule,
  // même limites (≥ 2 snapshots, ≥ 90 jours d'historique).
  const croissance = computeCroissancePatrimoine(snapshots)

  // ── V1.3 P0.3 — TWR portefeuille (apports NEUTRALISÉS) ──────────────
  const twrResult = computePortefeuilleTwr(inputs)

  // ── Confidence score (page.tsx:246-253) ─────────────────────────────
  const highConfAssets = assets
    .filter((a) => a.confidence === 'high')
    .reduce((s, a) => s + (a.current_value ?? 0), 0)
  const freshPortfolio = portfolioPositions
    .filter((p) => p.status === 'active' && !p.priceStale && p.marketValue !== null)
    .reduce((s, p) => s + (p.marketValue ?? 0), 0)
  const confScore = grossValue > 0 ? ((highConfAssets + freshPortfolio) / grossValue) * 100 : 0

  // ── Allocation V1.2 P0.6 — Taxonomie unifiée ────────────────────────
  // Fin de BUG-6 : les anciennes clés `asset:*` / `class:*` sont normalisées
  // via `mapToTaxonomy()` AVANT l'agrégation. Le donut sort une seule
  // taxonomie cohérente (immobilier_physique / actions / etf / obligations
  // / scpi / crypto / cash / or_metaux / autres).
  const byTaxonomy = new Map<TaxonomyKey, number>()

  for (const a of assets) {
    if (!a.current_value || a.current_value <= 0) continue
    const taxKey = mapToTaxonomy({ source: 'asset_type', key: a.asset_type })
    byTaxonomy.set(taxKey, (byTaxonomy.get(taxKey) ?? 0) + a.current_value)
  }
  for (const slice of portfolioSummary.allocationByClass) {
    if (slice.value <= 0) continue
    const taxKey = mapToTaxonomy({ source: 'asset_class', key: slice.assetClass })
    byTaxonomy.set(taxKey, (byTaxonomy.get(taxKey) ?? 0) + slice.value)
  }

  const allocation: DashboardAllocationSlice[] = Array.from(byTaxonomy.entries())
    .filter(([, value]) => value > 0)
    .sort(([keyA, a], [keyB, b]) => (b - a) || keyA.localeCompare(keyB))
    .map(([key, valueEur]) => ({
      key,
      label:    TAXONOMY_LABELS[key],
      valueEur,
      percent:  grossValue > 0 ? (valueEur / grossValue) * 100 : 0,
      color:    TAXONOMY_COLORS[key],
    }))

  const allocationTotal = allocation.reduce((s, slice) => s + slice.valueEur, 0)

  // ── Timeline (page.tsx:292-298) — ASC pour affichage chart ──────────
  const timeline: DashboardTimelinePoint[] = [...snapshots].reverse().map((s) => ({
    date:        s.snapshot_date,
    net_value:   s.total_net_value,
    gross_value: s.total_gross_value,
    total_debt:  s.total_debt,
  }))

  // ── Top assets (page.tsx:300-326) — granularité actuelle conservée ──
  // BUG-5 volontairement conservé : biens immo entiers + positions atomiques.
  // SEULE DÉVIATION : tie-breaker `id.localeCompare` pour ordre déterministe.
  type TopCandidate = { id: string; name: string; type: string; value: number }

  const assetsForTop: TopCandidate[] = assets
    .filter((a) => (a.current_value ?? 0) > 0)
    .map((a) => ({ id: a.id, name: a.name, type: a.asset_type, value: a.current_value! }))

  const positionsForTop: TopCandidate[] = portfolioPositions
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id:    p.positionId,
      name:  p.name,
      type:  p.assetClass,
      // Identique à page.tsx:317 — fallback CB pour positions sans prix (BUG-1)
      value: p.marketValue ?? p.costBasis,
    }))

  const topAssets: DashboardTopAsset[] = [...assetsForTop, ...positionsForTop]
    .filter((a) => a.value > 0)
    .sort((a, b) => (b.value - a.value) || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((a) => ({
      ...a,
      percent: grossValue > 0 ? (a.value / grossValue) * 100 : 0,
    }))

  // V2.2-BIS — `cashSummary` est désormais utilisé par la règle d'alerte
  // « cash > 30 % du patrimoine net depuis > 6 mois » → lifté ici (avant
  // le bloc alerts) pour éviter la double agrégation.
  const cashSummary = computeCashSummary(inputs)

  // ── Alertes (V2.2-BIS — seuils réalistes par classe d'actif) ────────
  // **Suppression franche** de l'ancienne logique « > 70 % du brut » qui
  // ignorait le levier et la moyenne française. Remplacée par 4 règles
  // documentées + une `signature` stable par alerte pour permettre
  // l'individualisation du masquage (cf. V2.2-BIS ST3 + ST4).
  //
  // Seuils retenus (constantes documentées) :
  //   • IMMO net (= valeurImmo − CRD) > 60 % du patrimoine net
  //     Moyenne française ~ 62 %, on alerte au-delà car ça impacte la
  //     diversification du foyer ET la sensibilité au cycle immo.
  //   • Crypto > 15 % du patrimoine net (très volatil, classe spéculative)
  //   • 1 position financière > 25 % du patrimoine financier (risque idiosyncratique)
  //   • Cash > 30 % du patrimoine net ET historique 6 mois consécutifs
  //     au-dessus du seuil (pas d'alerte sur un mouvement ponctuel)
  //
  // Chaque alerte porte un `signature` unique pour le masquage utilisateur
  // (cf. V2.2-BIS — `user_alert_dismissals`).
  const IMMO_NET_THRESHOLD_PCT     = 60
  const CRYPTO_THRESHOLD_PCT       = 15
  const POSITION_CONCENTRATION_PCT = 25
  const CASH_THRESHOLD_PCT         = 30
  const CASH_PERSISTENCE_DAYS      = 180   // 6 mois consécutifs minimum

  const alerts: DashboardAlert[] = []

  // ── Règle 1 — Immobilier NET > 60 % du patrimoine net ──────────────
  if (netValue > 0) {
    const reAssetsValue = assets
      .filter((a) => a.asset_type === 'real_estate')
      .reduce((s, a) => s + (a.current_value ?? 0), 0)
    const immoNet = reAssetsValue - realEstatePortfolio.totalCapitalRemaining
    const immoNetPct = (immoNet / netValue) * 100
    if (immoNetPct > IMMO_NET_THRESHOLD_PCT) {
      alerts.push({
        type:      'over_exposure_immo_net',
        signature: 'over_exposure_immo_net',
        message:   `Immobilier net : ${immoNetPct.toFixed(0)} % du patrimoine net (au-delà de ${IMMO_NET_THRESHOLD_PCT} %). Sensibilité élevée au cycle immo.`,
        severity:  'warning',
      })
    }
  }

  // ── Règle 2 — Crypto > 15 % du patrimoine net ──────────────────────
  if (netValue > 0) {
    const cryptoSlice = allocation.find((a) => a.key === 'crypto')
    const cryptoPctOfNet = cryptoSlice
      ? (cryptoSlice.valueEur / netValue) * 100
      : 0
    if (cryptoPctOfNet > CRYPTO_THRESHOLD_PCT) {
      alerts.push({
        type:      'over_exposure_crypto',
        signature: 'over_exposure_crypto',
        message:   `Crypto : ${cryptoPctOfNet.toFixed(0)} % du patrimoine net (au-delà de ${CRYPTO_THRESHOLD_PCT} %). Classe très volatile.`,
        severity:  'warning',
      })
    }
  }

  // ── Règle 3 — Concentration sur 1 position financière > 25 % ───────
  // Base de référence : `totalMarketValue` (patrimoine financier valorisé).
  // 1 alerte par position dépassant le seuil (signature inclut le positionId).
  if (portfolioSummary.totalMarketValue > 0) {
    for (const pos of portfolioPositions) {
      if (pos.status !== 'active' || pos.marketValue === null) continue
      const posPct = (pos.marketValue / portfolioSummary.totalMarketValue) * 100
      if (posPct > POSITION_CONCENTRATION_PCT) {
        alerts.push({
          type:      'concentration_position',
          signature: `concentration_position:${pos.positionId}`,
          message:   `${pos.name} : ${posPct.toFixed(0)} % du portefeuille financier (au-delà de ${POSITION_CONCENTRATION_PCT} %). Risque idiosyncratique.`,
          severity:  'warning',
        })
      }
    }
  }

  // ── Règle 4 — Cash > 30 % du patrimoine net depuis > 6 mois ────────
  // Snapshots arrivés en DESC (latest first). On vérifie :
  //   (a) maintenant : cash actuel > 30 % du net
  //   (b) historique : tous les snapshots des 180 derniers jours ont aussi
  //       cash > 30 % (pas d'alerte sur un pic ponctuel)
  //   (c) historique disponible : ≥ 2 snapshots ET span ≥ 180 j
  // Si l'historique est trop court, on s'abstient (mieux pas d'alerte
  // qu'une fausse alerte — cf. brief V2.2-BIS).
  if (netValue > 0 && snapshots.length >= 2) {
    const cashTodayPct = (cashSummary.totalEur / netValue) * 100
    if (cashTodayPct > CASH_THRESHOLD_PCT) {
      const latestDate = new Date(snapshots[0]!.snapshot_date)
      const horizonDate = new Date(latestDate)
      horizonDate.setDate(horizonDate.getDate() - CASH_PERSISTENCE_DAYS)
      const oldestDate = new Date(snapshots[snapshots.length - 1]!.snapshot_date)
      const spanCoversHorizon = oldestDate.getTime() <= horizonDate.getTime()
      if (spanCoversHorizon) {
        // Tous les snapshots dans la fenêtre [horizonDate, latestDate]
        // doivent avoir cash > 30 % du patrimoine net.
        const snapshotsInWindow = snapshots.filter((s) => {
          const d = new Date(s.snapshot_date)
          return d.getTime() >= horizonDate.getTime()
        })
        const allAboveThreshold = snapshotsInWindow.every((s) => {
          if (s.total_net_value <= 0) return false
          const cashRow = (s as { total_cash?: number }).total_cash ?? 0
          return (cashRow / s.total_net_value) * 100 > CASH_THRESHOLD_PCT
        })
        if (allAboveThreshold) {
          alerts.push({
            type:      'cash_dormant_6m',
            signature: 'cash_dormant_6m',
            message:   `Cash : ${cashTodayPct.toFixed(0)} % du patrimoine net depuis plus de 6 mois. Excès au-delà du coussin de sécurité.`,
            severity:  'warning',
          })
        }
      }
    }
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const stale = assets.filter((a) => a.last_valued_at && new Date(a.last_valued_at) < thirtyDaysAgo)
  if (stale.length) {
    alerts.push({
      type: 'stale_data',
      message: `${stale.length} actif(s) non valorisé(s) depuis +30 jours`,
      severity: 'info',
    })
  }

  const incompleteCount = realEstatePortfolio.properties.filter((p) => p.simulation.incompleteData).length
  if (incompleteCount > 0) {
    alerts.push({
      type: 'sim_incomplete',
      message: `${incompleteCount} bien(s) avec simulation incomplète — complétez le crédit pour un cash-flow précis`,
      severity: 'info',
    })
  }

  // ── Résumé drift immo (page.tsx:348-355) ────────────────────────────
  const realEstateDriftSummaries: DashboardRealEstateDriftSummary[] = realEstatePortfolio.properties
    .filter((p) => (p.driftAlerts ?? []).length > 0)
    .map((p) => ({
      propertyId:   p.propertyId,
      propertyName: p.propertyName,
      alerts:       p.driftAlerts ?? [],
    }))

  // ── KPIs arrondis (page.tsx:357-367) ────────────────────────────────
  return {
    kpis: {
      gross_value:        Math.round(grossValue * 100) / 100,
      net_value:          Math.round(netValue * 100) / 100,
      total_debt:         Math.round(totalDebt * 100) / 100,
      debt_ratio:         grossValue > 0 ? Math.round((totalDebt / grossValue) * 10000) / 100 : 0,
      // V1.2 P0.4 — rename : `cash_flow_immo_y1` (valeur inchangée) +
      // libellé explicite. Le bloc inline garde `monthly_cash_flow` jusqu'à V1.4.
      cash_flow_immo_y1:       Math.round(cashFlow * 100) / 100,
      cash_flow_immo_y1_label: 'Cash-flow immobilier (Y1 simulé)',
      twr_portefeuille_pct:        twrResult.value,
      twr_portefeuille_extrapole:  twrResult.extrapole,
      twr_portefeuille_label:      twrResult.label,
      croissance_patrimoine_pct:   croissance.value,
      croissance_patrimoine_label: croissance.label,
      confidence_score:   Math.round(confScore * 100) / 100,
      assets_count:       assets.length,
      sim_cf_label:       hasImmoSim ? 'après impôts (simulation)' : undefined,
    },
    allocation,
    topAssets,
    timeline,
    alerts,
    realEstateDriftSummaries,
    hasImmoSim,
    unvaluedPositionsCount,
    unvaluedPositionsCostBasis,
    unvaluedPositionsLabel,
    allocationBase:  'gross_strict' as const,
    allocationTotal: Math.round(allocationTotal * 100) / 100,
    cashSummary,
    investmentRankings: computeInvestmentRankings(inputs),
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helper V2.4 — Classement Champions / Casseroles (Z8.5)
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit les 4 buckets V2.4-BIS du classement Z8.5 (financier, crypto,
 * immobilier, cash) à partir des inputs Dashboard. Métriques **instantanées** :
 *   - financier/crypto : plus-value latente `(MV − cost_basis) / cost_basis × 100`
 *   - immobilier loc.  : `loyers_nets_annuels / valeur_actuelle × 100`
 *                        (RP exclue par `fiscalRegime === null`)
 *   - cash             : `interest_rate` (taux contractuel annualisé)
 *
 * **Pas de seuil d'ancienneté** : la zone s'affiche dès le jour 1, sans
 * jamais brandir d'annualisation extrapolée.
 *
 * **Pas de mélange inter-classes** : les 4 buckets sont strictement isolés.
 */
function computeInvestmentRankings(
  inputs: DashboardPipelineInputs,
): import('@/lib/portfolio/investment-rankings').InvestmentRankings {
  // ── 1. Positions (financier + crypto split sur assetClass) ──────────
  const envelopesMeta = inputs.envelopes ?? []
  const envelopeLabelById = new Map(envelopesMeta.map((e) => [e.id, e.name]))

  const positionsForRanking: PositionForRanking[] = inputs.portfolioPositions
    .filter((p) => p.status === 'active')
    .map((p) => {
      const envelopeLabel = p.envelopeId ? envelopeLabelById.get(p.envelopeId) : undefined
      return {
        id:             p.positionId,
        label:          p.name,
        ...(envelopeLabel ? { envelopeLabel } : {}),
        assetClass:     p.assetClass,
        marketValueEur: p.marketValue,
        costBasisEur:   p.costBasis,
      }
    })

  // ── 2. Biens immobiliers (RP exclue côté buildInvestmentRankings) ───
  // Dérivation des loyers nets annuels :
  //   netYield = (loyers nets − charges) / coût total opération (en %)
  //   ⇒ loyers_nets_annuels = netYield × coût_total / 100
  //   ⇒ rendement_locatif_actuel = loyers_nets_annuels / valeur_actuelle × 100
  const propertiesForRanking: PropertyForRanking[] = inputs.realEstatePortfolio.properties
    .map((p) => {
      const ny = p.simulation.netYieldPct
      const tc = p.simulation.totalCostEur
      const netAnnualRentEur = (ny !== undefined && tc !== undefined && Number.isFinite(ny) && Number.isFinite(tc))
        ? (ny * tc) / 100
        : null
      return {
        id:               p.propertyId,
        label:            p.propertyName ?? p.propertyId,
        netAnnualRentEur,
        currentValueEur:  p.currentValueEur ?? null,
        fiscalRegime:     p.fiscalRegime ?? null,
      }
    })

  // ── 3. Comptes cash (taux contractuel) ──────────────────────────────
  const cashForRanking: CashAccountForRanking[] = (inputs.cashAccounts ?? []).map((a) => {
    const num = (v: number | string | null | undefined): number | null => {
      if (v === null || v === undefined) return null
      const n = typeof v === 'number' ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }
    const accountTypeLabel = a.account_type ?? 'Compte'
    const bank = a.bank_name ? ` — ${a.bank_name}` : ''
    return {
      id:             a.id,
      label:          `${accountTypeLabel}${bank}`,
      interestRatePct: num(a.interest_rate ?? null),
      balanceEur:     num(a.balance) ?? 0,
    }
  })

  return buildInvestmentRankings({
    positions:    positionsForRanking,
    properties:   propertiesForRanking,
    cashAccounts: cashForRanking,
  })
}

// ─────────────────────────────────────────────────────────────────────
// Helper V2.1-BIS — Synthèse cash agrégée
// ─────────────────────────────────────────────────────────────────────

/**
 * Agrège le total cash (en EUR) en évitant le double comptage entre les
 * sources `cash_accounts` (table moderne) et `assets` filtré `cash` (legacy).
 *
 * Règle de dédup : si un compte `cash_accounts` a un `asset_id` non null,
 * on compte SA balance et on SKIP l'asset correspondant. Les `assets` cash
 * non rattachés à un cash_account sont également comptés.
 *
 * Hypothèse devise : on suppose EUR pour V2.1-BIS. La conversion FX
 * patrimoniale viendra plus tard si besoin (cf. `toEur` dans aggregateur).
 */
function computeCashSummary(
  inputs: DashboardPipelineInputs,
): { totalEur: number; accountsCount: number } {
  const accounts = inputs.cashAccounts ?? []
  const cashAssetIdsCovered = new Set<string>(
    accounts
      .map((a) => a.asset_id)
      .filter((id): id is string => id !== null),
  )

  const numOrZero = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined) return 0
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const cashFromAccounts = accounts.reduce((s, a) => s + numOrZero(a.balance), 0)

  const legacyCashAssets = inputs.assets.filter(
    (a) => a.asset_type === 'cash' && !cashAssetIdsCovered.has(a.id),
  )
  const cashFromLegacy = legacyCashAssets.reduce(
    (s, a) => s + numOrZero(a.current_value),
    0,
  )

  const totalEur      = Math.round((cashFromAccounts + cashFromLegacy) * 100) / 100
  const accountsCount = accounts.length + legacyCashAssets.length
  return { totalEur, accountsCount }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers V1.3 P0.3
// ─────────────────────────────────────────────────────────────────────

interface CroissanceResult { value: number | null; label: string }

/** Croissance patrimoniale annualisée — ancien CAGR explicitement labellé. */
function computeCroissancePatrimoine(
  snapshots: DashboardPipelineInputs['snapshots'],
): CroissanceResult {
  if (snapshots.length < 2) {
    return { value: null, label: 'Pas assez d\'historique pour la croissance patrimoniale' }
  }
  const latest = snapshots[0]!
  const oldest = snapshots[snapshots.length - 1]!
  const days   = (new Date(latest.snapshot_date).getTime() - new Date(oldest.snapshot_date).getTime())
               / 86_400_000
  if (days < 90 || oldest.total_net_value <= 0) {
    return { value: null, label: 'Historique trop court (< 3 mois) pour annualiser' }
  }
  const years = days / 365.25
  const rate  = (Math.pow(latest.total_net_value / oldest.total_net_value, 1 / years) - 1) * 100
  const rounded = Math.round(rate * 100) / 100
  return {
    value: rounded,
    label: `Croissance patrimoine : ${formatPercent(rounded, { sign: true })}/an (apports inclus)`,
  }
}

interface TwrFinal { value: number | null; extrapole: boolean; label: string }

/** TWR du portefeuille via l'assembleur + le moteur pur.
 *
 *  **Périmètre du TWR** : uniquement les positions tracées, c'est-à-dire
 *  celles qui ont au moins une `transactionsPortefeuille` ou un fallback
 *  legacy complet (`acquisitionDate` + `averagePriceEur`). Les positions
 *  non tracées sont **exclues du calcul** — leur MV n'entre ni dans le
 *  segment final, ni dans la base de valorisation des segments
 *  intermédiaires. C'est une conséquence directe de la sous-option (b) :
 *  sans transaction ni fallback, on n'a aucun ancre de prix pour cette
 *  position, on ne peut donc pas la TWR-iser honnêtement.
 */
function computePortefeuilleTwr(inputs: DashboardPipelineInputs): TwrFinal {
  const txs = inputs.transactionsPortefeuille ?? []
  const txPositionIds = new Set(txs.map((t) => t.positionId))

  const tracked: PositionForSegments[] = inputs.portfolioPositions
    .filter((p) => p.status === 'active')
    .filter((p) =>
      txPositionIds.has(p.positionId)
      || (p.acquisitionDate !== undefined && p.averagePriceEur !== undefined),
    )
    .map((p) => ({
      positionId:       p.positionId,
      currentMvEur:     p.marketValue,
      currentQuantity:  p.currentQuantity ?? 0,
      acquisitionDate:  p.acquisitionDate,
      averagePriceEur:  p.averagePriceEur,
    }))

  if (txs.length === 0 && tracked.length === 0) {
    return {
      value:     null,
      extrapole: false,
      label:     'Pas assez d\'historique pour calculer la performance',
    }
  }

  const asOf = inputs.asOfDate
    ? (inputs.asOfDate instanceof Date ? inputs.asOfDate : new Date(inputs.asOfDate))
    : new Date()
  const segments = buildTwrSegments({ transactions: txs, positions: tracked, asOfDate: asOf })
  const result   = computeTwr(segments)

  if (result === null) {
    return {
      value:     null,
      extrapole: false,
      label:     segments.length === 0
        ? 'Pas assez d\'historique pour calculer la performance'
        : 'Historique trop court (< 3 mois) pour annualiser',
    }
  }
  const pct = result.twrAnnualisePct
  const baseLabel = `Performance portefeuille : ${formatPercent(pct, { sign: true })}/an`
  return {
    value:     pct,
    extrapole: result.extrapole,
    label:     result.extrapole
      ? `${baseLabel} (estimé sur ${result.totalDays} j)`
      : baseLabel,
  }
}
