/**
 * Source unique de vérité pour les libellés humains des motifs d'intention
 * cash (V1.2). Consommé par l'UI `/cash`, le composant matelas (futur)
 * et les tests E.
 */
import type { CashIntentMotif } from './intents'

export const CASH_INTENT_MOTIFS: readonly CashIntentMotif[] = [
  'apport_immo',
  'achat_planifie',
  'voyage',
  'precaution_assumee',
  'autre',
] as const

export const CASH_INTENT_MOTIF_LABEL: Record<CashIntentMotif, string> = {
  apport_immo:        'Apport immobilier',
  achat_planifie:     'Achat planifié',
  voyage:             'Voyage',
  precaution_assumee: 'Précaution assumée',
  autre:              'Autre',
}

/** Texte hint « créée il y a X » à partir d'un nombre de jours. */
export function formatCreatedAgo(days: number): string {
  if (days < 1)   return 'créée aujourd\'hui'
  if (days === 1) return 'créée hier'
  if (days < 31)  return `créée il y a ${days} jours`
  if (days < 365) {
    const m = Math.round(days / 30)
    return `créée il y a ${m} mois`
  }
  const y = Math.round(days / 365)
  return y === 1 ? 'créée il y a 1 an' : `créée il y a ${y} ans`
}
