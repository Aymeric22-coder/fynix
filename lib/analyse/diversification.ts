/**
 * @module diversification (hors-moteur)
 *
 * Contient l'implémentation HHI (Herfindahl-Hirschman Index) de la
 * diversification. NON utilisé par le moteur de scores runtime — celui-ci
 * passe par `trackingErrorScore` dans scores.ts.
 *
 * Conservé comme référence algorithmique et couvert par diversification.test.ts.
 * Candidat à intégration en Phase 3 si une métrique HHI est ajoutée aux scores.
 */

/**
 * Score de diversification 0-100 basé sur l'indice Herfindahl-Hirschman
 * normalisé.
 *
 *   HHI = Σ (pct_i)²        (somme des carrés des parts en %)
 *   max = 10000             (1 seul bucket à 100 %)
 *
 * Score = (1 - HHI/10000) × 100 puis normalisé au nombre de buckets pour
 * pénaliser les portefeuilles à 1 ou 2 buckets seulement.
 *
 * Concrètement :
 *   - 1 seul bucket à 100 %    → score 0
 *   - 2 buckets à 50/50        → score ~50
 *   - 5 buckets à 20 % chacun  → score ~80
 *   - 10 buckets à 10 % chacun → score ~90
 */

interface BucketLike { pourcentage: number }

export function diversificationScore(buckets: ReadonlyArray<BucketLike>): number {
  if (buckets.length === 0) return 0
  const hhi = buckets.reduce((s, b) => s + b.pourcentage * b.pourcentage, 0)
  // hhi est dans [0, 10000]. On veut un score où 0 = concentré, 100 = dispersé.
  const raw = (1 - hhi / 10000) * 100
  return Math.round(Math.max(0, Math.min(100, raw)))
}
