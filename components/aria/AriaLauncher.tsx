/**
 * Bouton flottant global ARIA — present sur toutes les pages auth.
 *
 * Orchestre :
 *   - bouton lance-feu en bas a droite (decalage mobile pour ne pas
 *     overlaper le burger sidebar)
 *   - panneau AriaPanel a l'ouverture
 *   - nudge proactif AriaProactiveNudge (cf. Phase 5 / useAriaProactive)
 *
 * Le bouton pulse legerement quand un nudge est actif (signal visuel).
 */
'use client'

import { useCallback, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { useAriaProactive } from '@/hooks/use-aria-proactive'
import { AriaPanel } from './AriaPanel'
import { AriaProactiveNudge } from './AriaProactiveNudge'

function sectionFromPath(pathname: string): string | null {
  if (!pathname) return null
  const seg = pathname.split('/').filter(Boolean)[0] ?? null
  return seg
}

export function AriaLauncher() {
  const pathname = usePathname()
  const section = sectionFromPath(pathname ?? '')

  const [open, setOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const {
    activeNudge, acceptNudge, dismissNudge,
  } = useAriaProactive({ section })

  const handleAcceptNudge = useCallback((prompt: string) => {
    setPendingPrompt(prompt)
    setOpen(true)
    acceptNudge()
  }, [acceptNudge])

  // Pulse subtil si un nudge attend, mais pas tant que le panel est ouvert.
  const showPulse = !!activeNudge && !open

  return (
    <>
      {/* Bouton launcher — en bas a droite, decale au-dessus du burger mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir ARIA, assistant patrimonial"
        title="ARIA"
        className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-30
                    inline-flex h-12 w-12 items-center justify-center rounded-full
                    bg-accent text-white shadow-lg shadow-black/40
                    hover:bg-accent-hover transition-colors
                    ${showPulse ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg animate-pulse' : ''}`}
      >
        <Sparkles size={18} />
      </button>

      {/* Nudge proactif (cache si panel ouvert) */}
      {activeNudge && !open && (
        <AriaProactiveNudge
          nudge={activeNudge}
          onAccept={handleAcceptNudge}
          onDismiss={dismissNudge}
        />
      )}

      {/* Panel */}
      <AriaPanel
        open={open}
        onClose={() => { setOpen(false); setPendingPrompt(null) }}
        initialPrompt={pendingPrompt}
        onPromptConsumed={() => setPendingPrompt(null)}
      />
    </>
  )
}
