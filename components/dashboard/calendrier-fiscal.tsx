/**
 * Calendrier fiscal — affiche les 3 prochains événements fiscaux
 * personnalisés sur le Dashboard, expand vers la liste complète.
 *
 * Données calculées côté serveur par `getEvenementsFiscaux` puis
 * sérialisées en `EvenementFiscalSerialisable` (Date → string ISO)
 * pour traverser la frontière Server → Client Components.
 */
'use client'

import { useState } from 'react'
import {
  Calendar, AlertTriangle, TrendingUp, Trophy, ChevronDown, ChevronUp,
  type LucideIcon,
} from 'lucide-react'
import type { CategorieEvenement, UrgenceEvenement } from '@/lib/fiscal/calendrier'

/** Variante sérialisable de EvenementFiscal (Date → ISO string). */
export interface EvenementFiscalSerialisable {
  id:           string
  titre:        string
  description:  string
  date:         string          // ISO YYYY-MM-DDT00:00:00.000Z
  recurrence:   'annuel' | 'unique'
  categorie:    CategorieEvenement
  urgence:      UrgenceEvenement
  lien_externe?: string
}

export interface CalendrierFiscalProps {
  evenements: EvenementFiscalSerialisable[]
}

const CAT_ICON: Record<CategorieEvenement, LucideIcon> = {
  declaration: Calendar,
  echeance:    AlertTriangle,
  opportunite: TrendingUp,
  jalon:       Trophy,
}

const URGENCE_STYLE: Record<UrgenceEvenement, { badge: string; label: string }> = {
  info:      { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',     label: 'Info'      },
  attention: { badge: 'bg-warning/10 text-warning border-warning/40',         label: 'Attention' },
  urgent:    { badge: 'bg-danger/10 text-danger border-danger/40',            label: 'Urgent'    },
}

const APERCU_NB = 3

export function CalendrierFiscal({ evenements }: CalendrierFiscalProps) {
  const [expanded, setExpanded] = useState(false)

  if (!evenements || evenements.length === 0) return null

  const visible = expanded ? evenements : evenements.slice(0, APERCU_NB)
  const surplus = Math.max(0, evenements.length - APERCU_NB)

  return (
    <section className="card p-5" aria-label="Calendrier fiscal personnalisé">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
          <Calendar size={14} className="text-accent" />
          📅 Échéances fiscales
        </h2>
        <span className="text-xs text-muted">{evenements.length} dans les 12 mois</span>
      </div>

      <div className="space-y-3">
        {visible.map((e) => <EvenementCard key={e.id} evt={e} />)}
      </div>

      {surplus > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="w-full inline-flex items-center justify-center gap-1.5 text-xs
                       text-secondary hover:text-primary transition-colors"
          >
            {expanded ? (
              <>
                Réduire
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                Voir tout (+{surplus})
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  )
}

function EvenementCard({ evt }: { evt: EvenementFiscalSerialisable }) {
  const Icon  = CAT_ICON[evt.categorie]
  const style = URGENCE_STYLE[evt.urgence]
  const dateObj = new Date(evt.date)
  const relativeLabel = formatRelative(dateObj, new Date())

  return (
    <article className="bg-surface-2 rounded-lg px-4 py-3 flex items-start gap-3">
      <div className="flex-shrink-0 rounded-md bg-bg/40 p-2 mt-0.5">
        <Icon size={14} className="text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <h3 className="text-sm font-medium text-primary truncate">{evt.titre}</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${style.badge}`}>
            {style.label}
          </span>
        </div>
        <p className="text-xs text-secondary leading-relaxed mb-1.5">{evt.description}</p>
        <p className="text-[10px] text-muted">
          <span className="financial-value">{relativeLabel}</span>
          <span className="mx-1.5">·</span>
          <span>{formatDateFr(dateObj)}</span>
          {evt.lien_externe && (
            <>
              <span className="mx-1.5">·</span>
              <a href={evt.lien_externe} target="_blank" rel="noopener noreferrer"
                 className="text-accent hover:underline">
                impots.gouv.fr
              </a>
            </>
          )}
        </p>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────

function formatRelative(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / 86_400_000)
  if (diffDays < 0)   return `passé de ${-diffDays} j`
  if (diffDays === 0) return 'aujourd\'hui'
  if (diffDays === 1) return 'demain'
  if (diffDays < 14)  return `dans ${diffDays} jours`
  if (diffDays < 60)  return `dans ${Math.round(diffDays / 7)} semaines`
  const diffMonths = Math.round(diffDays / 30)
  return `dans ${diffMonths} mois`
}

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day:      'numeric',
    month:    'short',
    year:     'numeric',
    timeZone: 'UTC',
  })
}
