/**
 * V9.1 — InfoTip : bulle d'aide pédagogique (FRICTION-001).
 *
 * Pattern d'usage à côté d'un label d'indicateur :
 *   <p className="flex items-center gap-1.5">
 *     Rendement net-net
 *     <InfoTip text={getLexiqueDefinition('netNetYield', fiscalRegime)} />
 *   </p>
 *
 * Implémentation pure CSS (hover + focus) — pas de JS d'état, pas de
 * dépendance Radix. Accessible clavier (Tab → focus → bulle visible)
 * et tap (focus persistant sur mobile).
 *
 * Design tokens FIRECORE : surface-2, border, text-primary, text-muted.
 * Pas de Server / Client distinction nécessaire — pas de hook.
 */

import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils/format'

interface InfoTipProps {
  /** Définition affichée dans la bulle (1-2 phrases courtes).
   *  Utilisé pour `aria-label` même si `content` est fourni — garde
   *  l'accessibilité screen-reader fonctionnelle. */
  text:       string
  /** QW9-bis — contenu riche optionnel (liste à puces, multi-lignes, etc.).
   *  Si fourni, remplace `text` dans le rendu visuel de la bulle. `text`
   *  reste utilisé pour `aria-label`. Additif : aucun appelant existant
   *  n'est impacté. */
  content?:   React.ReactNode
  /** Position de la bulle vs l'icône. Défaut : `top`. */
  placement?: 'top' | 'bottom'
  /** Classes additionnelles sur le wrapper. */
  className?: string
  /** Taille de l'icône en px. Défaut 12 (cohérent avec un libellé `text-xs`). */
  iconSize?:  number
}

export function InfoTip({
  text,
  content,
  placement = 'top',
  className,
  iconSize  = 12,
}: InfoTipProps) {
  return (
    <button
      type="button"
      // tabIndex implicite via <button> — accessible clavier + tap mobile
      aria-label={`Aide : ${text}`}
      className={cn(
        // `group/tip` + `relative` : la bulle, enfant absolu, se positionne
        // par rapport au bouton (et est révélée via group-hover/focus-within).
        'group/tip relative inline-flex items-center justify-center align-middle cursor-help',
        'text-muted hover:text-secondary focus:text-secondary',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 rounded-sm',
        className,
      )}
    >
      <HelpCircle size={iconSize} aria-hidden="true" />
      {/* Bulle : positionnée en absolu, révélée par peer-hover / peer-focus.
          Sortie du flux pour ne pas pousser le label. */}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50',
          'w-64 max-w-[80vw] rounded-md border border-border bg-surface-2',
          'px-3 py-2 text-xs leading-relaxed text-primary normal-case tracking-normal',
          'shadow-lg whitespace-normal text-left',
          'opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          'transition-opacity duration-150',
          placement === 'top'
            ? 'bottom-full mb-2'
            : 'top-full mt-2',
        )}
      >
        {content ?? text}
      </span>
    </button>
  )
}
