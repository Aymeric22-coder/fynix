/**
 * `cash_intents` — Cash volontaire déclaré par l'utilisateur (V1.2).
 *
 * Helper pur. Calcule le **matelas effectif** = `totalCash − Σ intents actives`
 * pour fermer le faux positif P5 (« Sur-liquide volontaire ») identifié dans
 * `auditcash.md` § 7.
 *
 * Une intention est *active* si `target_date IS NULL` (sans deadline) OU si
 * `target_date >= today` (UTC, granularité jour). Les expirées sont SILENT-
 * ignorées en V1.2 (pas d'archivage formel — décision V1.3+).
 *
 * Convention montants : EUR. La table DB stocke `montant NUMERIC(18,2)` en
 * EUR. Pas de FX dans ce helper (le brief V1.2 le précise explicitement).
 *
 * Pur, synchrone, aucun I/O.
 */

import type { CashIntent, CashIntentMotif } from '@/types/database.types'

export type { CashIntent, CashIntentMotif }

export interface MatelasEffectifResult {
  /** Somme des intents actives, en EUR (arrondi 2 décimales). */
  totalIntentsActives:   number
  /** `max(0, totalCash − totalIntentsActives)`. Jamais négatif. */
  cashEffectif:          number
  countIntentsActives:   number
  intentsActives:        CashIntent[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Compare une chaîne ISO (`YYYY-MM-DD`) à une date repère, par valeur de
 * jour UTC. Robuste face aux time-zones : on tronque à minuit UTC les deux
 * côtés. Cette comparaison stricte sur le jour est la spec V1.2 :
 *   - `target_date IS NULL`     → active
 *   - `target_date >= today`    → active (inclusif aujourd'hui)
 *   - `target_date < today`     → inactive (filtrée)
 */
function isOnOrAfterToday(target: string, now: Date): boolean {
  // target attendu en `YYYY-MM-DD`. On le compare sans heure.
  const [y, m, d] = target.split('-').map((p) => Number(p))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false
  // Construit le timestamp UTC du DÉBUT de jour de la target_date.
  const targetUtc = Date.UTC(y!, (m! - 1), d!)
  // Today (UTC) à 00:00.
  const today = new Date(now)
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return targetUtc >= todayUtc
}

/**
 * Retourne les intentions actives à la date `now` (défaut : maintenant).
 * Tri stable : ordre d'entrée préservé.
 */
export function getIntentsActives(intents: CashIntent[], now: Date = new Date()): CashIntent[] {
  return intents.filter((i) => i.target_date === null || isOnOrAfterToday(i.target_date, now))
}

/**
 * Calcule le matelas effectif à partir du cash brut et de la liste complète
 * des intentions de l'utilisateur.
 *
 *   - `totalIntentsActives` = somme des `montant` des intents actives.
 *   - `cashEffectif`        = max(0, totalCash − totalIntentsActives).
 *
 * Si l'utilisateur déclare plus d'intentions que de cash (cas patho :
 * suppression de comptes après création), le solde est clampé à 0 — la
 * garde anti-dépassement vit côté API (POST/PUT renvoient 422).
 */
export function computeMatelasEffectif(
  totalCashEur: number,
  intents: CashIntent[],
  now: Date = new Date(),
): MatelasEffectifResult {
  const actives = getIntentsActives(intents, now)
  const total = actives.reduce((s, i) => s + (Number.isFinite(i.montant) ? i.montant : 0), 0)
  const cashEffectif = Math.max(0, totalCashEur - total)
  return {
    totalIntentsActives: round2(total),
    cashEffectif:        round2(cashEffectif),
    countIntentsActives: actives.length,
    intentsActives:      actives,
  }
}

/**
 * Âge en jours de l'intention (depuis `created_at`). Utile pour afficher
 * « créée il y a X jours » sur les intentions sans `target_date` (mitigation
 * Q3 du brief V1.2 : éviter d'oublier une intent « globale » indéfinie).
 *
 * Retourne 0 si la date n'est pas parsable.
 */
export function getIntentAgeInDays(intent: CashIntent, now: Date = new Date()): number {
  const created = Date.parse(intent.created_at)
  if (!Number.isFinite(created)) return 0
  const elapsedMs = now.getTime() - created
  if (elapsedMs <= 0) return 0
  return Math.floor(elapsedMs / 86_400_000)
}
