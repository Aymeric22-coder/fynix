/**
 * Actions de ce mois — propositions concrètes affichées sur le Dashboard.
 *
 * La logique métier vit dans `lib/analyse/recoMensuelles.ts` (fonction
 * pure `genererActionsMensuelles`). Ce composant ne fait que l'affichage.
 *
 * Server Component : on reçoit la liste déjà calculée depuis la page.
 *
 * V2.2 — Le prop `filter` permet de séparer les actions fiscales (rendues
 * dans la zone Fiscalité repliable) des actions non-fiscales (rendues dans
 * la zone Pilotage). Cf. architecture Dashboard V2.
 */

import Link from 'next/link'
import {
  RotateCw, Coffee, CalendarClock, Receipt, ArrowRight, type LucideIcon,
} from 'lucide-react'
import type { ActionMensuelle, ActionMensuelleType } from '@/lib/analyse/recoMensuelles'
import { actionSignature } from '@/lib/analyse/recoMensuelles'
import { DismissButton } from './dismiss-button'

/**
 * Filtre des actions à afficher :
 *   - `'all'` (défaut, rétrocompat) : toutes les actions, encart « tout est en ordre »
 *     si la liste est vide.
 *   - `'fiscal-only'` : seulement `type === 'fiscal'`. `return null` si vide.
 *   - `'non-fiscal'`  : tout sauf `type === 'fiscal'`. `return null` si vide.
 */
export type ActionFilter = 'all' | 'fiscal-only' | 'non-fiscal'

interface Props {
  actions: ActionMensuelle[]
  filter?: ActionFilter
}

const ICON_BY_TYPE: Record<ActionMensuelleType, LucideIcon> = {
  rebalance:   RotateCw,
  invest_cash: Coffee,
  dca_retard:  CalendarClock,
  fiscal:      Receipt,
}

function applyFilter(actions: ActionMensuelle[], filter: ActionFilter): ActionMensuelle[] {
  switch (filter) {
    case 'fiscal-only': return actions.filter((a) => a.type === 'fiscal')
    case 'non-fiscal':  return actions.filter((a) => a.type !== 'fiscal')
    case 'all':
    default:            return actions
  }
}

export function ActionsDuMois({ actions, filter = 'all' }: Props) {
  const visible = applyFilter(actions, filter)

  // V2.2 — Pour les modes filtrés, on masque entièrement le widget si vide
  // (pas d'encart « rien à signaler » qui prendrait de la place pour rien
  // dans une zone composite type Pilotage / Fiscalité).
  if (filter !== 'all' && visible.length === 0) return null

  // Sous-titre adapté au mode.
  const subtitle = visible.length > 0
    ? `${visible.length} action${visible.length > 1 ? 's' : ''} priorisée${visible.length > 1 ? 's' : ''} d'après vos dérives constatées`
    : 'Aucune dérive détectée — rien à corriger ce mois'

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-primary">Actions de ce mois</h2>
          <p className="text-xs text-secondary mt-0.5">{subtitle}</p>
        </div>
        <Link
          href="/analyse?tab=optimiser"
          className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
        >
          Voir toutes les recommandations
          <ArrowRight size={11} />
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-primary">Tout est en ordre ce mois-ci 🎯</p>
          <p className="text-xs text-secondary mt-1">
            Pas de cash dormant, pas de drift d&apos;allocation, et votre DCA suit son rythme.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {visible.map((a, idx) => (
            <ActionRow key={a.id} action={a} index={idx + 1} />
          ))}
        </ol>
      )}
    </section>
  )
}

function ActionRow({ action, index }: { action: ActionMensuelle; index: number }) {
  const Icon = ICON_BY_TYPE[action.type]
  return (
    <li className="flex items-start gap-3 bg-surface-2 border border-border rounded-lg px-4 py-3">
      {/* Badge numéroté */}
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-xs font-semibold financial-value">
        {index}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={13} className="text-accent flex-shrink-0" />
          <p className="text-sm text-primary font-medium flex-1">{action.titre}</p>
          {/* V2.2-BIS — masquage individuel de la reco. */}
          <DismissButton
            signature={actionSignature(action)}
            preview={action.titre}
            kind="reco"
          />
        </div>
        <p className="text-xs text-secondary leading-relaxed">{action.description}</p>
      </div>
    </li>
  )
}
