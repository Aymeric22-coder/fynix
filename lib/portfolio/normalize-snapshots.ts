/**
 * Normalisation de la série de snapshots affichée dans le graphique
 * d'évolution du portefeuille.
 *
 * Pourquoi : les snapshots sont des photos figées à J. Les KPI affichés sur
 * la même page sont, eux, recalculés en temps réel à partir des positions
 * et du dernier prix. Deux sources → deux résultats possibles si :
 *  - aucun snapshot n'a encore été créé aujourd'hui (le dernier date d'hier
 *    ou d'avant le dernier refresh des prix),
 *  - des positions ont été ajoutées après les snapshots les plus anciens
 *    (la courbe semble alors "démarrer plus bas" qu'aujourd'hui),
 *  - une position était au fallback cost_basis à J (pas encore de prix)
 *    puis a reçu un prix plus bas plus tard → la "Valeur actuelle" peut
 *    descendre puis remonter, ce qui n'a aucun sens financier.
 *
 * Cette fonction aligne la série avec les KPI live et lisse les artefacts
 * historiques pour que le graphique reste lisible.
 */

import type { CurrencyCode } from '@/types/database.types'

export interface SnapshotPoint {
  snapshot_date:      string  // ISO yyyy-MM-dd
  total_market_value: number
  total_cost_basis:   number
  total_pnl:          number
}

/** Sous-ensemble du PortfolioSummary utilisé pour le point live. */
export interface LiveKpis {
  totalMarketValue:   number
  totalCostBasis:     number
  totalUnrealizedPnL: number | null
  referenceCurrency?: CurrencyCode  // non utilisé ici, gardé pour traçabilité
}

export interface NormalizeOptions {
  /** Date "aujourd'hui" (injectable pour les tests). Défaut : new Date(). */
  now?: Date
  /**
   * Tolérance d'écart entre le dernier point synthétique et les KPI live
   * (en devise de référence). En dessous, on considère que le dernier
   * snapshot du jour est "déjà à jour" et on ne le remplace pas.
   * Défaut : 1.0 (1 €).
   */
  liveDriftTolerance?: number
}

/**
 * Pipeline de normalisation :
 *  1. Injecte/remplace le point du jour avec les KPI live → garantit que
 *     le dernier point du graphique correspond exactement aux cartes.
 *  2. Force `total_cost_basis` monotone croissant (running max) → le
 *     capital investi ne descend que sur vente, et l'historique ne
 *     remonte jamais les positions ajoutées après coup. Sans cette
 *     correction la courbe en pointillés démarre artificiellement bas.
 *  3. Force `total_market_value >= total_cost_basis` uniquement quand la
 *     série originale était sous le cost_basis à cause du fallback (mv
 *     reportée au cost_basis quand prix manquant — voir valuation.ts).
 *     On laisse passer les vraies moins-values latentes.
 *  4. Recalcule `total_pnl = mv − cb` sur chaque point pour garantir la
 *     cohérence visuelle avec l'axe de droite.
 */
export function normalizeSnapshotSeries(
  snapshots: readonly SnapshotPoint[],
  live:      LiveKpis,
  options:   NormalizeOptions = {},
): SnapshotPoint[] {
  const todayIso  = toIsoDate(options.now ?? new Date())
  const tolerance = options.liveDriftTolerance ?? 1.0

  // 1) Injecte / remplace le point du jour avec les KPI live.
  const livePoint: SnapshotPoint = {
    snapshot_date:      todayIso,
    total_market_value: round2(live.totalMarketValue),
    total_cost_basis:   round2(live.totalCostBasis),
    total_pnl:          round2(
      live.totalUnrealizedPnL ?? (live.totalMarketValue - live.totalCostBasis),
    ),
  }

  const withLive: SnapshotPoint[] = (() => {
    if (snapshots.length === 0) return [livePoint]
    const last = snapshots[snapshots.length - 1]!
    if (last.snapshot_date === todayIso) {
      // Remplace si le snapshot du jour diffère significativement des KPI
      // live (stale). On conserve l'existant sinon, pour éviter une
      // mutation inutile lors d'un simple re-render.
      const drift =
        Math.abs(last.total_market_value - livePoint.total_market_value) +
        Math.abs(last.total_cost_basis   - livePoint.total_cost_basis)
      return drift > tolerance
        ? [...snapshots.slice(0, -1), livePoint]
        : [...snapshots]
    }
    return [...snapshots, livePoint]
  })()

  // 2) Monotonie croissante du cost_basis.
  let runCostMax = 0
  const monoCost = withLive.map((p) => {
    runCostMax = Math.max(runCostMax, p.total_cost_basis)
    return { ...p, total_cost_basis: runCostMax }
  })

  // 3) Quand le running max a relevé le cost_basis d'un point (snapshot
  // incomplet à l'époque), on doit aussi relever la mv SI ce snapshot était
  // au fallback cost_basis (cas où des positions n'avaient pas de prix et
  // étaient comptées au PRU). Sinon, mv resterait sous la nouvelle baseline
  // cb → fausse moins-value affichée. On préserve en revanche les vraies
  // moins-values latentes (mv brut strictement < cb brut).
  const FALLBACK_EPSILON = 0.5  // 0,5 € de tolérance pour détecter "mv == cb"
  const liftedMv = monoCost.map((p, i) => {
    const original = withLive[i]!
    const cbWasLifted = p.total_cost_basis > original.total_cost_basis + FALLBACK_EPSILON
    if (!cbWasLifted) return p
    const wasAtFallback =
      Math.abs(original.total_market_value - original.total_cost_basis) <= FALLBACK_EPSILON
    if (wasAtFallback) {
      return { ...p, total_market_value: p.total_cost_basis }
    }
    return p
  })

  // 4) Recalcule le PnL pour qu'il soit strictement cohérent (mv - cb).
  return liftedMv.map((p) => ({
    ...p,
    total_market_value: round2(p.total_market_value),
    total_cost_basis:   round2(p.total_cost_basis),
    total_pnl:          round2(p.total_market_value - p.total_cost_basis),
  }))
}

/**
 * Vérifie qu'une série normalisée se termine bien sur les KPI live (à la
 * tolérance près). Renvoie un message d'erreur descriptif ou null si OK.
 * Utilisé pour les assertions dev côté serveur ET client.
 */
export function checkSeriesMatchesLive(
  series: readonly SnapshotPoint[],
  live:   LiveKpis,
  tol     = 1.0,
): string | null {
  if (series.length === 0) return 'série vide'
  const last = series[series.length - 1]!
  const dMv  = Math.abs(last.total_market_value - live.totalMarketValue)
  const dCb  = Math.abs(last.total_cost_basis   - live.totalCostBasis)
  if (dMv > tol || dCb > tol) {
    return `dernier point désynchronisé : mv Δ${dMv.toFixed(2)} / cb Δ${dCb.toFixed(2)} (tol ${tol})`
  }
  return null
}

function toIsoDate(d: Date): string {
  const y  = d.getUTCFullYear()
  const m  = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
