/**
 * Bulle proactive ARIA — apparait en bas a droite quand un nudge
 * declenche (cf. useAriaProactive). Cliquer "Oui" envoie le
 * suggested_prompt comme premier message d'une nouvelle conversation.
 */
'use client'

import { Sparkles, X } from 'lucide-react'
import type { ActiveNudge } from '@/lib/aria/proactive/detector'

interface AriaProactiveNudgeProps {
  nudge:    ActiveNudge
  onAccept: (suggestedPrompt: string) => void
  onDismiss: () => void
  /** offset bottom (mobile vs desktop). */
  bottomOffsetClass?: string
}

export function AriaProactiveNudge({
  nudge, onAccept, onDismiss,
  bottomOffsetClass = 'bottom-24 lg:bottom-24',
}: AriaProactiveNudgeProps) {
  return (
    <div className={`fixed ${bottomOffsetClass} right-4 lg:right-6 z-40 max-w-sm`}>
      <div className="card p-4 shadow-2xl shadow-black/40 animate-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center">
            <Sparkles size={14} className="text-accent" />
          </div>
          <div className="flex-1 text-sm text-primary leading-snug">
            {nudge.message}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fermer (silencer 24h)"
            className="flex-shrink-0 p-0.5 rounded text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => onAccept(nudge.suggested_prompt)}
            className="flex-1 text-xs font-medium px-3 py-1.5 rounded-lg
                       bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Oui, lance ARIA
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs px-3 py-1.5 rounded-lg
                       bg-surface-2 border border-border text-secondary
                       hover:text-primary transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
