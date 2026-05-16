/**
 * Benchmarks de référence pour l'analyse sectorielle et géographique.
 *
 * Principe : un portefeuille "neutre" suit la capitalisation boursière
 * mondiale (MSCI ACWI pour la géo, MSCI World pour les secteurs).
 * On compare la répartition réelle de l'utilisateur À CE BENCHMARK,
 * pas à une répartition fictive équipondérée.
 *
 * Cela donne des alertes pertinentes : un investisseur 65 % USA n'est
 * PAS surpondéré (c'est le marché mondial), tandis qu'un investisseur
 * 35 % France EST surpondéré (home bias).
 *
 * Sources :
 *   - MSCI ACWI factsheet 2024 (pondération pays par zone)
 *   - MSCI World sector breakdown 2024 (GICS 11 secteurs)
 *
 * À remettre à jour annuellement (les compos bougent de 1-3 % par an).
 */

/** Pondérations zone géographique selon MSCI ACWI (Sep 2024 approx). */
export const BENCHMARK_GEO_MSCI_ACWI: Record<string, number> = {
  'Amérique du Nord':  65,   // USA 62 % + Canada 3 %
  'Europe':            15,   // Europe développée (DE, FR, UK, CH, NL…)
  'Asie développée':   11,   // Japon 6, Australie 2, Corée 2, Singapour 1
  'Asie émergente':     5,   // Chine 3, Inde 2
  'Amérique latine':    1,
  'Moyen-Orient':       1,
  'Europe émergente':   1,
  'Afrique':            0.5,
  'Autres':             0.5,
}

/** Pondérations sectorielles selon MSCI World (Sep 2024 approx, GICS). */
export const BENCHMARK_SECTOR_MSCI_WORLD: Record<string, number> = {
  'Technologie':              23,
  'Finance':                  15,
  'Santé':                    12,
  'Industrie':                11,
  'Consommation cyclique':    10,
  'Communication':             8,
  'Consommation de base':      7,
  'Énergie':                   5,
  'Matières premières':        4,
  'Immobilier':                3,
  'Services publics':          2,
}

// Seuils de déviation (en points de pourcentage)
export const DEVIATION_SEUIL_GEO        = 15  // surpondération → orange
export const DEVIATION_SEUIL_GEO_STRONG = 30  // surpondération forte → rouge
export const DEVIATION_SEUIL_SECTOR     = 15  // idem secteurs
export const DEVIATION_SEUIL_SECTOR_STRONG = 30
export const DEVIATION_SEUIL_UNDER      = -20  // sous-pondération marquée → info violette

// Type DeviationStatus re-exporté depuis types/analyse.ts pour éviter le
// dédoublement. Statuts : 'aligned' | 'overweight' | 'overweight_strong'
// | 'underweight' (voir types/analyse.ts pour la définition canonique).
import type { DeviationStatus } from '@/types/analyse'
export type { DeviationStatus }

interface SeuilsConfig {
  over:        number   // ex 15
  overStrong:  number   // ex 30
  under:       number   // ex -20
}

const SEUILS_GEO:    SeuilsConfig = { over: DEVIATION_SEUIL_GEO,    overStrong: DEVIATION_SEUIL_GEO_STRONG,    under: DEVIATION_SEUIL_UNDER }
const SEUILS_SECTOR: SeuilsConfig = { over: DEVIATION_SEUIL_SECTOR, overStrong: DEVIATION_SEUIL_SECTOR_STRONG, under: DEVIATION_SEUIL_UNDER }

/**
 * Renvoie la pondération benchmark d'une zone (0 si zone inconnue,
 * pour ne pas planter quand on tombe sur "Non mappé" etc.).
 */
export function benchmarkGeoOf(zone: string): number {
  return BENCHMARK_GEO_MSCI_ACWI[zone] ?? 0
}

export function benchmarkSectorOf(secteur: string): number {
  return BENCHMARK_SECTOR_MSCI_WORLD[secteur] ?? 0
}

/**
 * Calcule la déviation (en points) du portefeuille par rapport au benchmark
 * et son statut visuel.
 *
 * @param pct        pourcentage du portefeuille (0..100)
 * @param benchmark  pourcentage de référence (0..100)
 * @param config     'geo' ou 'sector'
 */
export function classifyDeviation(
  pct:       number,
  benchmark: number,
  kind:      'geo' | 'sector',
): { deviation: number; status: DeviationStatus } {
  const dev = pct - benchmark
  const s   = kind === 'geo' ? SEUILS_GEO : SEUILS_SECTOR
  let status: DeviationStatus = 'aligned'
  if (dev >= s.overStrong)      status = 'overweight_strong'
  else if (dev >= s.over)       status = 'overweight'
  else if (dev <= s.under)      status = 'underweight'
  return { deviation: dev, status }
}

/**
 * Score de diversification basé sur le tracking error vs benchmark.
 *
 * tracking_error = Σ |dev_i| / 2
 *   - Aligné parfaitement      → 0      → score 100
 *   - Tilt modéré (10pts)      → 10     → score 90
 *   - 100 % concentré une zone → ~100   → score 0
 *
 * On considère TOUTES les zones / secteurs du benchmark (même ceux
 * absents du portefeuille → leur déviation = 0 - benchmark = négative)
 * pour pénaliser l'absence des marchés mondiaux.
 */
export function trackingErrorScore(
  buckets:   Array<{ label: string; pct: number }>,
  benchmark: Record<string, number>,
): number {
  // Crée un set de toutes les clés à considérer : benchmark ∪ portfolio
  const allKeys = new Set<string>([
    ...Object.keys(benchmark),
    ...buckets.map((b) => b.label),
  ])
  const portfolioMap = new Map(buckets.map((b) => [b.label, b.pct]))
  let absDevSum = 0
  for (const k of allKeys) {
    const pct = portfolioMap.get(k) ?? 0
    const bm  = benchmark[k] ?? 0
    absDevSum += Math.abs(pct - bm)
  }
  // tracking error = somme des |dev| / 2 (chaque déviation compte comme
  // un swap entre 2 buckets → on évite le double-comptage)
  const trackingError = absDevSum / 2
  return Math.max(0, Math.min(100, Math.round(100 - trackingError)))
}
