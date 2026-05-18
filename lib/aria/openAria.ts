/**
 * Mécanisme léger pour ouvrir ARIA depuis n'importe où dans l'app sans
 * partager de state React (pas de context provider à ajouter au layout).
 *
 * Pattern : un CustomEvent global dispatché sur `window`. AriaLauncher
 * y abonne un listener et ouvre son panneau avec le prompt fourni.
 *
 * Utilisation côté caller (ex: empty states, KPI cards, nudges ad-hoc) :
 *
 *   import { openAriaWithPrompt } from '@/lib/aria/openAria'
 *   <button onClick={() => openAriaWithPrompt('Explique mon score…')} />
 *
 * Côté AriaLauncher : `window.addEventListener(ARIA_OPEN_EVENT, …)`.
 */

export const ARIA_OPEN_EVENT = 'fynix:aria-open'

export interface AriaOpenDetail {
  prompt: string
}

/** Ouvre le panneau ARIA et envoie automatiquement le prompt fourni. */
export function openAriaWithPrompt(prompt: string): void {
  if (typeof window === 'undefined') return
  const event = new CustomEvent<AriaOpenDetail>(ARIA_OPEN_EVENT, {
    detail: { prompt },
  })
  window.dispatchEvent(event)
}
