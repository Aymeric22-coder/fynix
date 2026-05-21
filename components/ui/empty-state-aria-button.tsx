'use client'

import { MessageCircle } from 'lucide-react'
import { openAriaWithPrompt } from '@/lib/aria/openAria'

/**
 * Bouton « Demander à ARIA » utilisé par EmptyState.
 *
 * Isolé dans un Client Component séparé pour permettre à EmptyState
 * de rester un Server Component (et donc d'accepter un prop `icon`
 * de type LucideIcon — qui est techniquement une fonction forwardRef
 * que RSC refuse de sérialiser à travers la frontière server/client).
 */
export function EmptyStateAriaButton({ prompt }: { prompt: string }) {
  return (
    <button
      type="button"
      onClick={() => openAriaWithPrompt(prompt)}
      className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg
                 border border-border text-sm text-secondary hover:text-primary
                 hover:border-accent/40 hover:bg-accent/5 transition-colors"
    >
      <MessageCircle size={14} />
      💬 Demander à ARIA
    </button>
  )
}
