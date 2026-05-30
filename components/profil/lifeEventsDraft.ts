/**
 * Type local au wizard pour les évènements de vie en cours d'édition.
 *
 * Différence avec `LifeEventRow` (BDD) : pas d'`id` (les nouveaux n'en
 * ont pas), pas de timestamps. À la soumission finale, le state local est
 * sync'é vers la table life_events via POST /api/profile/life-events/sync
 * (wholesale replace : DELETE * + INSERT new).
 */

import type { LifeEventType } from '@/lib/profil/lifeEventsConstants'

export interface LifeEventDraft {
  /** id Postgres si l'évènement existe déjà en BDD, sinon undefined. */
  id?:             string
  type:            LifeEventType
  is_active:       boolean
  /** Format 'YYYY-MM-01' (le jour est posé à 01). */
  occurrence_date: string
  montant:         number | null
  label:           string | null
  meta:            Record<string, unknown>
}
