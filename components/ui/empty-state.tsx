import { type LucideIcon } from 'lucide-react'
import { EmptyStateAriaButton } from './empty-state-aria-button'

interface EmptyStateProps {
  icon:        LucideIcon
  title:       string
  description: string
  action?:     React.ReactNode
  /**
   * Quand fourni, affiche un bouton secondaire « 💬 Demander à ARIA »
   * sous l'action principale. Au clic, ouvre le panel ARIA avec ce
   * prompt pré-rempli (via l'event global `firecore:aria-open`).
   *
   * Le bouton vit dans un Client Component séparé pour qu'EmptyState
   * reste un Server Component (cf. EmptyStateAriaButton).
   */
  ariaPrompt?: string
}

/**
 * EmptyState — Server Component.
 *
 * `icon` est une `LucideIcon` (forwardRef component). Comme ce
 * composant n'est PAS 'use client', l'icône est rendue côté serveur
 * sans serialisation à travers la frontière server/client → aucun
 * risque d'erreur "Functions cannot be passed directly to Client
 * Components" (digest 1715506935).
 *
 * Si tu veux ajouter un comportement interactif, isole-le dans un
 * sous-composant 'use client' comme EmptyStateAriaButton.
 */
export function EmptyState({ icon: Icon, title, description, action, ariaPrompt }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
        <Icon size={24} className="text-muted" />
      </div>
      <p className="text-primary font-medium mb-1">{title}</p>
      <p className="text-secondary text-sm max-w-xs">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {ariaPrompt && <EmptyStateAriaButton prompt={ariaPrompt} />}
    </div>
  )
}
