/**
 * Helper pur de fraîcheur d'une `balance_date` cash (V1.4 Vol D).
 *
 * Aucun I/O. La saisie cash étant déclarative (pas de bank connect),
 * une `balance_date` ancienne pénalise la fiabilité du matelas affiché —
 * mais sans bloquer les calculs (sinon perte d'expérience).
 *
 * Paliers (en jours depuis `balance_date`) :
 *   - < 90  ou date absente   → `none`     (état nominal, pas de badge)
 *   - 90 ≤ x < 180            → `warning`  (rafraîchir conseillé, orange)
 *   - ≥ 180                   → `stale`    (donnée ancienne, rouge)
 */

export type FreshnessLevel = 'none' | 'warning' | 'stale'

const WARNING_THRESHOLD_DAYS = 90
const STALE_THRESHOLD_DAYS   = 180
const DAY_MS                 = 86_400_000

/**
 * Retourne le niveau de fraîcheur de `balance_date` par rapport à `now`.
 * `null`/invalide → `'none'` (cas de saisie initiale sans date, légitime).
 */
export function getFreshnessLevel(
  balanceDate: string | null | undefined,
  now: Date = new Date(),
): FreshnessLevel {
  if (!balanceDate) return 'none'
  const ts = Date.parse(balanceDate)
  if (!Number.isFinite(ts)) return 'none'
  const ageDays = Math.floor((now.getTime() - ts) / DAY_MS)
  if (ageDays < WARNING_THRESHOLD_DAYS) return 'none'
  if (ageDays < STALE_THRESHOLD_DAYS)   return 'warning'
  return 'stale'
}

/** Âge en jours arrondi vers le bas, ou 0 si invalide. */
export function getBalanceDateAgeDays(
  balanceDate: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!balanceDate) return 0
  const ts = Date.parse(balanceDate)
  if (!Number.isFinite(ts)) return 0
  const ageDays = Math.floor((now.getTime() - ts) / DAY_MS)
  return Math.max(0, ageDays)
}
