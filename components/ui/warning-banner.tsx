/**
 * Shell visuel commun à tous les bandeaux d'avertissement (variant warning).
 * Source unique de vérité pour la bordure, le fond, l'icône et la typo :
 * tout changement de tokens design ne touche que ce fichier.
 *
 * Consommé par :
 *  - components/ui/charges-warning-banner.tsx
 *  - components/real-estate/wizard-warning-banner.tsx
 */
'use client'

import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

export const WARNING_BANNER_CLASSES = {
  container: 'flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3',
  icon:      'text-warning flex-shrink-0 mt-0.5',
  body:      'flex-1 text-xs text-warning leading-relaxed',
  rightSlot: 'flex-shrink-0',
} as const

interface Props {
  children:   ReactNode
  rightSlot?: ReactNode
  className?: string
}

export function WarningBannerShell({ children, rightSlot, className }: Props) {
  return (
    <div
      role="alert"
      className={[WARNING_BANNER_CLASSES.container, className ?? ''].join(' ').trim()}
    >
      <AlertTriangle size={16} className={WARNING_BANNER_CLASSES.icon} />
      <div className={WARNING_BANNER_CLASSES.body}>{children}</div>
      {rightSlot && <div className={WARNING_BANNER_CLASSES.rightSlot}>{rightSlot}</div>}
    </div>
  )
}
