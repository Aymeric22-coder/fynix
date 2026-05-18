'use client'

import { MessageCircle, type LucideIcon } from 'lucide-react'
import { openAriaWithPrompt } from '@/lib/aria/openAria'

interface EmptyStateProps {
  icon:        LucideIcon
  title:       string
  description: string
  action?:     React.ReactNode
  /**
   * Quand fourni, affiche un bouton secondaire « 💬 Demander à ARIA »
   * sous l'action principale. Au clic, ouvre le panel ARIA avec ce
   * prompt pré-rempli (via l'event global `fynix:aria-open`).
   *
   * Le bouton n'est rendu que côté client (composant 'use client').
   */
  ariaPrompt?: string
}

export function EmptyState({ icon: Icon, title, description, action, ariaPrompt }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
        <Icon size={24} className="text-muted" />
      </div>
      <p className="text-primary font-medium mb-1">{title}</p>
      <p className="text-secondary text-sm max-w-xs">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {ariaPrompt && (
        <button
          type="button"
          onClick={() => openAriaWithPrompt(ariaPrompt)}
          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg
                     border border-border text-sm text-secondary hover:text-primary
                     hover:border-accent/40 hover:bg-accent/5 transition-colors"
        >
          <MessageCircle size={14} />
          💬 Demander à ARIA
        </button>
      )}
    </div>
  )
}
