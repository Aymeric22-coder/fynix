/**
 * Actions de ce mois — 3 propositions concrètes affichées en tête du
 * Dashboard, juste après le FIRE Progress Hero.
 *
 * La logique métier vit dans `lib/analyse/recoMensuelles.ts` (fonction
 * pure `genererActionsMensuelles`). Ce composant ne fait que l'affichage.
 *
 * Server Component : on reçoit la liste déjà calculée depuis la page.
 */

import Link from 'next/link'
import {
  RotateCw, Coffee, CalendarClock, ArrowRight, type LucideIcon,
} from 'lucide-react'
import type { ActionMensuelle, ActionMensuelleType } from '@/lib/analyse/recoMensuelles'

interface Props {
  actions: ActionMensuelle[]
}

const ICON_BY_TYPE: Record<ActionMensuelleType, LucideIcon> = {
  rebalance:   RotateCw,
  invest_cash: Coffee,
  dca_retard:  CalendarClock,
}

export function ActionsDuMois({ actions }: Props) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-primary">Actions de ce mois</h2>
          <p className="text-xs text-secondary mt-0.5">
            {actions.length > 0
              ? `${actions.length} action${actions.length > 1 ? 's' : ''} priorisée${actions.length > 1 ? 's' : ''} d'après vos dérives constatées`
              : 'Aucune dérive détectée — rien à corriger ce mois'}
          </p>
        </div>
        <Link
          href="/analyse?tab=recos"
          className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
        >
          Voir toutes les recommandations
          <ArrowRight size={11} />
        </Link>
      </div>

      {actions.length === 0 ? (
        <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-6 text-center">
          <p className="text-sm text-primary">Tout est en ordre ce mois-ci 🎯</p>
          <p className="text-xs text-secondary mt-1">
            Pas de cash dormant, pas de drift d&apos;allocation, et votre DCA suit son rythme.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, idx) => (
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
          <p className="text-sm text-primary font-medium">{action.titre}</p>
        </div>
        <p className="text-xs text-secondary leading-relaxed">{action.description}</p>
      </div>
    </li>
  )
}
