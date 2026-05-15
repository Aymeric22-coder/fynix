/**
 * Bouton "chip" pour les choix multiples / sélection rapide.
 *
 * Reste fidèle au design system de l'app : surface-2 + border-border,
 * accent émeraude quand actif. Pas de gold, pas de Syne — l'app est
 * en Geist + emerald.
 */
'use client'

import { cn } from '@/lib/utils/format'

interface ChipProps {
  active?:  boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
}

export function Chip({ active, onClick, children, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-xs border transition-colors',
        active
          ? 'border-accent bg-accent-muted text-accent'
          : 'border-border bg-surface-2 text-secondary hover:border-border-2 hover:text-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}
