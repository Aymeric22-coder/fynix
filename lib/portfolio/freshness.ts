/**
 * Seuils de fraîcheur des prix selon la fréquence de valorisation.
 *
 * Le moteur de valorisation marque un prix comme "stale" si son `priced_at`
 * est plus vieux que le seuil correspondant à la fréquence de l'instrument.
 *
 * Pourquoi : un ETF coté en bourse doit être < 24h pour être "frais", mais
 * un fonds AV mensuel reste "frais" pendant tout le mois entre 2 publications.
 *
 * Pas de seuil pour `manual` : l'utilisateur saisit quand il veut, jamais
 * marqué stale automatiquement (mais affiché avec la date pour transparence).
 *
 * Marge de sécurité : on ajoute un peu de marge sur chaque seuil pour
 * tolérer les délais de publication (un fonds mensuel publie souvent
 * en J+3 à J+5 du mois suivant).
 */

import type { ValuationFrequency } from '@/types/database.types'

const DAY_MS = 24 * 60 * 60 * 1000

const THRESHOLDS_MS: Record<ValuationFrequency, number> = {
  daily:      1.5 * DAY_MS,   // 36h (week-end et jours fériés bourse)
  weekly:     9   * DAY_MS,   // 9j (tolère un retard de 2 jours)
  monthly:    35  * DAY_MS,   // 35j (publication J+3-5 du mois suivant)
  quarterly:  100 * DAY_MS,   // ~3 mois + 10j tolerance
  manual:     Number.POSITIVE_INFINITY,
}

/**
 * Renvoie le seuil de fraîcheur en millisecondes pour une fréquence donnée.
 *
 * @returns nombre de ms avant qu'un prix soit considéré "stale".
 *   Infinity pour 'manual' (jamais stale).
 */
export function freshThresholdMs(freq: ValuationFrequency | null | undefined): number {
  if (!freq) return THRESHOLDS_MS.daily  // legacy fallback
  return THRESHOLDS_MS[freq] ?? THRESHOLDS_MS.daily
}

/**
 * Détermine si un prix est encore frais selon la fréquence de l'instrument.
 *
 * @param pricedAtISO timestamp ISO du prix
 * @param freq fréquence de valorisation de l'instrument
 * @param now date de référence (défaut : Date.now())
 */
export function isPriceFresh(
  pricedAtISO: string,
  freq:        ValuationFrequency | null | undefined,
  now:         Date = new Date(),
): boolean {
  const threshold = freshThresholdMs(freq)
  if (threshold === Number.POSITIVE_INFINITY) return true  // 'manual' jamais stale
  const ageMs = now.getTime() - new Date(pricedAtISO).getTime()
  return ageMs >= 0 && ageMs <= threshold
}

/**
 * Suggère une fréquence par défaut selon la classe d'actif.
 * Utilisé pour pré-remplir le formulaire (l'user peut toujours override).
 */
export function defaultFrequencyForClass(assetClass: string): ValuationFrequency {
  switch (assetClass) {
    case 'fund':
    case 'opci':
      return 'monthly'    // fonds AV / OPCI typiquement mensuels
    case 'scpi':
      return 'quarterly'  // SCPI publient souvent la valeur de part trimestriellement
    case 'private_equity':
    case 'crowdfunding':
    case 'private_debt':
    case 'structured':
      return 'manual'     // pas de marché public, valorisation à la main
    default:
      return 'daily'      // equity, etf, crypto, metal, bond, reit, siic, defi, derivative
  }
}

/** Label humain pour l'UI. */
export const FREQUENCY_LABELS: Record<ValuationFrequency, string> = {
  daily:     'Quotidienne',
  weekly:    'Hebdomadaire',
  monthly:   'Mensuelle',
  quarterly: 'Trimestrielle',
  manual:    'Manuelle (libre)',
}

/** Description courte affichée à côté du label dans le select. */
export const FREQUENCY_HINTS: Record<ValuationFrequency, string> = {
  daily:     'ETF, actions, crypto',
  weekly:    'Cas rares',
  monthly:   'Fonds AV, supports pilotés',
  quarterly: 'SCPI, OPCI',
  manual:    'Private equity, crowdfunding',
}

/**
 * Calcule la prochaine date attendue de valorisation à partir d'un prix
 * existant et de la fréquence de l'instrument.
 *
 * @returns Date de la prochaine valeur attendue, ou null pour 'manual'
 *   (pas de rythme imposé) ou si la fréquence est inconnue.
 */
export function nextValuationDue(
  lastPricedAtISO: string,
  freq:            ValuationFrequency | null | undefined,
): Date | null {
  if (!freq || freq === 'manual') return null
  const d = new Date(lastPricedAtISO)
  if (isNaN(d.getTime())) return null

  switch (freq) {
    case 'daily':     d.setUTCDate(d.getUTCDate() + 1);   break
    case 'weekly':    d.setUTCDate(d.getUTCDate() + 7);   break
    case 'monthly':   d.setUTCMonth(d.getUTCMonth() + 1); break
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break
  }
  return d
}

/**
 * Statut d'une valorisation par rapport à sa cadence attendue.
 *
 * - 'on_time'   : on n'a pas encore atteint la date attendue
 * - 'due'       : on est dans la fenêtre de publication (jusqu'à 1 cycle de retard)
 * - 'overdue'   : ça fait plus d'un cycle qu'on n'a pas eu de valeur
 * - 'unknown'   : pas de prix encore, ou fréquence 'manual'
 */
export type ValuationStatus = 'on_time' | 'due' | 'overdue' | 'unknown'

export function valuationStatus(
  lastPricedAtISO: string | null,
  freq:            ValuationFrequency | null | undefined,
  now:             Date = new Date(),
): ValuationStatus {
  if (!freq || freq === 'manual') return 'unknown'
  if (!lastPricedAtISO) return 'unknown'

  const due = nextValuationDue(lastPricedAtISO, freq)
  if (!due) return 'unknown'

  if (now < due) return 'on_time'

  // Au-delà de 1.5 × intervalle, c'est overdue
  const intervalMs = due.getTime() - new Date(lastPricedAtISO).getTime()
  const overdueAt  = new Date(due.getTime() + intervalMs * 0.5)
  return now > overdueAt ? 'overdue' : 'due'
}
