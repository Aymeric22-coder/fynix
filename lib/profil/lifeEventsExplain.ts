/**
 * CS5 — Explainers d'évènements de vie (pattern QW9-bis).
 *
 * Helpers texte pour les surfaces UI/email qui doivent rendre VISIBLE
 * l'impact des évènements sur la projection FIRE. Le pattern QW9-bis
 * (cf. `lib/profil/cibleFamille.ts`) prouve qu'afficher l'ajustement
 * comme tooltip + sous-texte évite la "magic black box".
 *
 * Anti-pattern à éviter : afficher les évènements sans expliquer leur
 * effet → on retombe dans QW1 (capter sans utiliser visiblement).
 */

import type { LifeEventRow } from '@/types/database.types'
import {
  LIFE_EVENT_LABELS,
  LIFE_EVENT_EMOJI,
  lifeEventDateToYearMonth,
  type LifeEventType,
} from './lifeEventsConstants'

/**
 * True si l'utilisateur a au moins un évènement actif à afficher.
 * Utilisé comme garde-conditionnel : aucune mention si pas d'event.
 */
export function hasActiveLifeEvents(events: ReadonlyArray<LifeEventRow>): boolean {
  return events.some((e) => e.is_active)
}

/**
 * Résumé court d'un évènement (sans année), pour les chips ReferenceLine.
 * Ex : "🏖 Retraite", "💰 Héritage", "🏠 RP future", "👶 Naissance".
 */
export function summarizeEventShort(evt: LifeEventRow): string {
  const emoji = LIFE_EVENT_EMOJI[evt.type as LifeEventType]
  if (evt.type === 'capital_exceptionnel') {
    return `${emoji} ${evt.label ?? 'Capital exceptionnel'}`
  }
  if (evt.type === 'achat_rp') {
    return `${emoji} RP future`
  }
  return `${emoji} ${LIFE_EVENT_LABELS[evt.type as LifeEventType]}`
}

/**
 * Résumé moyen avec année — pour les sous-textes Hero / ProjectionFIRE
 * tooltip / Email.
 * Ex : "🏖 Retraite en 2031", "💰 Héritage en 2034 (+80 k€)".
 */
export function summarizeEventMedium(evt: LifeEventRow): string {
  const short = summarizeEventShort(evt)
  const { year } = lifeEventDateToYearMonth(evt.occurrence_date)
  const yearPart = year ? ` en ${year}` : ''
  if (evt.type === 'capital_exceptionnel' && typeof evt.montant === 'number' && evt.montant > 0) {
    const k = Math.round(evt.montant / 1000)
    return `${short}${yearPart} (+${k} k€)`
  }
  if (evt.type === 'retraite' && typeof evt.montant === 'number' && evt.montant > 0) {
    return `${short}${yearPart} (pension ${evt.montant} €/m)`
  }
  return `${short}${yearPart}`
}

/**
 * Construit la phrase de transparence à afficher sous le Hero
 * /analyse "Âge FIRE estimé".
 *
 * Ex : "tient compte de : 🏖 Retraite en 2031, 💰 Héritage en 2034 (+80 k€)"
 */
export function buildLifeEventAriaLabel(events: ReadonlyArray<LifeEventRow>): string {
  const actives = events.filter((e) => e.is_active)
  if (actives.length === 0) return ''
  const parts = actives.map(summarizeEventMedium)
  return `tient compte de : ${parts.join(', ')}`
}

/**
 * Variant email — sans emoji, formulation plus formelle.
 *
 * Ex : "Projection ajustée pour : retraite 2031, héritage 2034 (+80 k€)"
 */
export function buildLifeEventEmailLabel(events: ReadonlyArray<LifeEventRow>): string {
  const actives = events.filter((e) => e.is_active)
  if (actives.length === 0) return ''
  const parts = actives.map((e) => {
    const { year } = lifeEventDateToYearMonth(e.occurrence_date)
    const yearPart = year ? ` ${year}` : ''
    if (e.type === 'capital_exceptionnel') {
      const label = (e.label ?? 'capital exceptionnel').toLowerCase()
      const k = typeof e.montant === 'number' && e.montant > 0
        ? ` (+${Math.round(e.montant / 1000)} k€)` : ''
      return `${label}${yearPart}${k}`
    }
    if (e.type === 'retraite') {
      return `retraite${yearPart}`
    }
    if (e.type === 'achat_rp') {
      return `achat RP${yearPart}`
    }
    if (e.type === 'naissance') {
      const nb = (e.meta as { nb_enfants?: number } | null | undefined)?.nb_enfants ?? 1
      return `${nb > 1 ? `${nb} naissances` : 'naissance'}${yearPart}`
    }
    return `${e.type}${yearPart}`
  })
  return `Projection ajustée pour : ${parts.join(', ')}.`
}

/**
 * Décomposition par évènement, pour les surfaces de détail
 * (modal Progression FIRE, ProfilCard).
 */
export interface LifeEventBreakdown {
  type:    LifeEventType
  emoji:   string
  label:   string
  year:    number | null
  amount:  number | null
  text:    string  // ligne prête à afficher
}

export function buildLifeEventBreakdown(events: ReadonlyArray<LifeEventRow>): LifeEventBreakdown[] {
  return events.filter((e) => e.is_active).map((e) => {
    const { year } = lifeEventDateToYearMonth(e.occurrence_date)
    return {
      type:   e.type as LifeEventType,
      emoji:  LIFE_EVENT_EMOJI[e.type as LifeEventType],
      label:  e.label ?? LIFE_EVENT_LABELS[e.type as LifeEventType],
      year,
      amount: e.montant,
      text:   summarizeEventMedium(e),
    }
  })
}
