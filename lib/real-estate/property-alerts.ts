/**
 * V11 — CAS-DASH-001 / INTEG-003 : agrégation des impayés non résolus par bien.
 *
 * Source : `property_events` (migration 041) filtrés sur :
 *   - kind === 'rent_unpaid'
 *   - is_resolved === false
 *
 * Modèle EXPLICITE : un impayé est SAISI par l'utilisateur via la modal
 * « Loyer impayé » (add-event-modal.tsx). Jamais déduit d'absence
 * d'encaissement — ce serait piégeux (saisie manuelle en retard = faux
 * positif). Donc 1 event suffit à déclencher une alerte (pas de seuil
 * "2 mois consécutifs" qui retarderait l'affichage).
 *
 * Sévérité progressive (validée produit) :
 *   - `info`     : 1 impayé non résolu < 30 jours
 *   - `warning`  : ≥ 30 jours OU ≥ 2 events non résolus sur le bien
 *                  (1ʳᵉ relance amiable)
 *   - `critical` : > 60 jours OU ≥ 3 events non résolus sur le bien
 *                  (seuil GLI / commandement de payer)
 *
 * Pure function (pas d'I/O, pas de date "now" injectée par défaut côté test).
 */

import type { PropertyEvent } from '@/types/database.types'

/** Sous-ensemble minimal de `PropertyEvent` lu par le helper. */
export type UnpaidRentEventLike = Pick<
  PropertyEvent,
  'property_id' | 'kind' | 'is_resolved' | 'event_date' | 'amount_eur'
>

export type UnpaidRentSeverity = 'info' | 'warning' | 'critical'

export interface UnpaidRentSummary {
  propertyId:       string
  /** Nombre d'events `rent_unpaid` non résolus sur le bien. ≥ 1. */
  count:            number
  /**
   * Somme des montants impayés en EUR, en VALEUR POSITIVE.
   * `amount_eur` est stocké négatif en DB (perte) — on l'absolutise ici
   * pour que les consommateurs UI puissent afficher « X € impayés » sans
   * avoir à manipuler le signe.
   */
  totalUnpaidEur:   number
  /** Date ISO du plus ancien impayé non résolu (`event_date`). */
  oldestUnpaidDate: string
  /** Nb de jours entre `oldestUnpaidDate` et `today` (≥ 0). */
  daysSinceOldest:  number
  severity:         UnpaidRentSeverity
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Seuils — exportés pour permettre aux tests de pinner la sémantique. */
export const UNPAID_RENT_WARNING_DAYS  = 30
export const UNPAID_RENT_CRITICAL_DAYS = 60
export const UNPAID_RENT_WARNING_COUNT = 2
export const UNPAID_RENT_CRITICAL_COUNT = 3

function daysBetween(fromIso: string, today: Date): number {
  const from = new Date(fromIso).getTime()
  if (Number.isNaN(from)) return 0
  return Math.max(0, Math.floor((today.getTime() - from) / DAY_MS))
}

function severityFor(daysSinceOldest: number, count: number): UnpaidRentSeverity {
  if (daysSinceOldest > UNPAID_RENT_CRITICAL_DAYS || count >= UNPAID_RENT_CRITICAL_COUNT) {
    return 'critical'
  }
  if (daysSinceOldest >= UNPAID_RENT_WARNING_DAYS || count >= UNPAID_RENT_WARNING_COUNT) {
    return 'warning'
  }
  return 'info'
}

/**
 * Agrège les events `rent_unpaid` non résolus par bien et calcule la
 * sévérité de l'alerte associée.
 *
 * @param events Tous les events lus en DB (filtrés ou pas — le helper
 *               re-filtre par sécurité sur `kind` et `is_resolved`).
 * @param today  Date de référence pour le calcul d'ancienneté.
 * @returns Un summary par bien CONCERNÉ (biens sans impayé non résolu
 *          sont absents du résultat — pas de slot vide). Ordre non garanti.
 */
export function computeUnpaidRentAlerts(
  events: UnpaidRentEventLike[],
  today:  Date = new Date(),
): UnpaidRentSummary[] {
  const byProp = new Map<string, UnpaidRentEventLike[]>()
  for (const e of events) {
    if (e.kind !== 'rent_unpaid' || e.is_resolved) continue
    const arr = byProp.get(e.property_id) ?? []
    arr.push(e)
    byProp.set(e.property_id, arr)
  }

  const summaries: UnpaidRentSummary[] = []
  for (const [propertyId, evts] of byProp) {
    if (evts.length === 0) continue

    const totalUnpaidEur = evts.reduce(
      (s, e) => s + Math.abs(Number(e.amount_eur ?? 0)),
      0,
    )
    // Plus ancien event_date (string ISO YYYY-MM-DD se compare lexicographiquement).
    const oldestUnpaidDate = evts.reduce(
      (oldest, e) => (e.event_date < oldest ? e.event_date : oldest),
      evts[0]!.event_date,
    )
    const daysSinceOldest = daysBetween(oldestUnpaidDate, today)

    summaries.push({
      propertyId,
      count: evts.length,
      totalUnpaidEur,
      oldestUnpaidDate,
      daysSinceOldest,
      severity: severityFor(daysSinceOldest, evts.length),
    })
  }

  return summaries
}
