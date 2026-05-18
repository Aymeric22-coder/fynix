/**
 * Panneau ARIA principal — slide-in droite avec backdrop.
 *
 * Orchestre :
 *   - useAriaStream  : envoi + reception streaming des messages
 *   - liste des messages (AriaMessage)
 *   - AriaInput pour la saisie
 *
 * Le panneau est controle par AriaLauncher (open/onClose).
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X, RefreshCw, Plus } from 'lucide-react'
import { useAriaStream, type AriaChatMessage } from '@/hooks/use-aria-stream'
import { AriaMessage, type AriaToolCallTrace } from './AriaMessage'
import { AriaInput } from './AriaInput'

interface AriaPanelProps {
  open:           boolean
  onClose:        () => void
  /** Texte pre-rempli a envoyer automatiquement a l'ouverture (nudge). */
  initialPrompt?: string | null
  /** Reset l'initialPrompt apres usage (signal du parent). */
  onPromptConsumed?: () => void
}

function sectionFromPath(pathname: string): string | null {
  if (!pathname) return null
  const seg = pathname.split('/').filter(Boolean)[0] ?? null
  return seg
}

export function AriaPanel({ open, onClose, initialPrompt, onPromptConsumed }: AriaPanelProps) {
  const pathname = usePathname()
  const section = sectionFromPath(pathname ?? '')

  const {
    messages, isStreaming, lastError, sendMessage, cancel, reset,
  } = useAriaStream({
    ui: { section, page_url: pathname ?? null },
  })

  // Auto-scroll vers le bas a chaque nouveau message / delta
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isStreaming])

  // Echap pour fermer
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Consomme l'initialPrompt (nudge accepte) une fois le panel ouvert
  const [consumedPrompt, setConsumedPrompt] = useState<string | null>(null)
  useEffect(() => {
    if (open && initialPrompt && consumedPrompt !== initialPrompt && !isStreaming) {
      setConsumedPrompt(initialPrompt)
      sendMessage(initialPrompt)
      onPromptConsumed?.()
    }
  }, [open, initialPrompt, consumedPrompt, isStreaming, sendMessage, onPromptConsumed])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer ARIA"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Panel droit */}
      <aside
        role="dialog"
        aria-label="Assistant ARIA"
        className="relative ml-auto h-full w-full sm:w-[440px] flex flex-col
                   bg-bg border-l border-border shadow-2xl shadow-black/50
                   animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex w-7 h-7 rounded-full bg-accent-muted items-center justify-center">
              <span className="block w-2 h-2 rounded-full bg-accent" />
            </span>
            <div>
              <div className="text-sm font-semibold text-primary leading-tight">ARIA</div>
              <div className="text-[10px] text-secondary leading-tight">Assistant patrimonial · {section ?? '—'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={reset}
              aria-label="Nouvelle conversation"
              title="Nouvelle conversation"
              className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        {/* Body — messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
          {messages.length === 0 && !isStreaming && (
            <EmptyState />
          )}

          {messages.map((m, i) => (
            <AriaMessage
              key={i}
              role={m.role}
              content={m.content || (m.streaming ? '' : 'Aucune reponse generee. Reessaie ou reformule.')}
              streaming={m.streaming}
              toolCalls={toolCallsFromMessage(m)}
              messageId={m.message_id}
            />
          ))}

          {lastError && (
            <div className="text-xs text-danger bg-danger-muted border border-danger/30 rounded-lg px-3 py-2 my-2 flex items-center gap-2">
              <RefreshCw size={12} />
              {lastError}
            </div>
          )}
        </div>

        {/* Input */}
        <AriaInput
          onSubmit={sendMessage}
          onCancel={cancel}
          isStreaming={isStreaming}
        />
      </aside>
    </div>
  )
}

/**
 * Pas de tool trace cote client en Phase 6 (le hook actuel n'expose pas
 * les tool_use). Retourne undefined — la Phase 7 cablera les events
 * tool_use/tool_result via le SSE. Stub pour ne pas bloquer le build.
 */
function toolCallsFromMessage(_m: AriaChatMessage): AriaToolCallTrace[] | undefined {
  return undefined
}

function EmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex w-12 h-12 rounded-full bg-accent-muted items-center justify-center mb-4">
        <span className="block w-3 h-3 rounded-full bg-accent" />
      </div>
      <h3 className="text-sm font-semibold text-primary mb-1">Bonjour, je suis ARIA</h3>
      <p className="text-xs text-secondary leading-relaxed max-w-xs mx-auto">
        Pose-moi une question sur ton patrimoine, ta projection FIRE,
        un bien immobilier, ou demande-moi une simulation.
      </p>

      <div className="mt-6 space-y-1.5 max-w-xs mx-auto">
        {[
          'Resume-moi mon patrimoine en deux phrases.',
          'Simule un krach de -30 %.',
          'Que se passe-t-il si je passe mon DCA a 1500 €/mois ?',
        ].map((q) => (
          <div key={q} className="text-[11px] text-secondary italic">« {q} »</div>
        ))}
      </div>
    </div>
  )
}
