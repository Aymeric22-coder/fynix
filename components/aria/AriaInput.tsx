/**
 * Zone de saisie pour envoyer un message a ARIA.
 *
 * - Auto-grow vertical (max 6 lignes)
 * - Submit a Cmd/Ctrl + Enter, Shift+Enter = nouvelle ligne
 * - Bouton envoyer (icone Send) desactive si vide ou en cours de stream
 * - Bouton stop visible pendant le streaming (calls onCancel)
 */
'use client'

import { useRef, useEffect, useState } from 'react'
import { Send, Square } from 'lucide-react'

interface AriaInputProps {
  onSubmit:    (text: string) => void
  onCancel?:   () => void
  isStreaming: boolean
  placeholder?: string
  initialValue?: string
  /** Si fourni, le composant re-rend quand cette ref change (pour reset). */
  resetKey?: unknown
}

export function AriaInput({
  onSubmit, onCancel, isStreaming,
  placeholder = 'Pose ta question a ARIA…',
  initialValue = '',
  resetKey,
}: AriaInputProps) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`
  }, [value])

  // Reset externe (ex: changement de conversation)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue, resetKey])

  function submit() {
    const text = value.trim()
    if (!text || isStreaming) return
    onSubmit(text)
    setValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={isStreaming}
          className="flex-1 resize-none bg-surface-2 border border-border rounded-lg
                     px-3 py-2 text-sm text-primary placeholder:text-muted
                     focus:border-accent focus:outline-none disabled:opacity-50
                     max-h-36 overflow-y-auto"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Interrompre"
            className="flex-shrink-0 h-9 w-9 inline-flex items-center justify-center
                       rounded-lg bg-surface-2 border border-border text-secondary
                       hover:text-danger hover:border-danger/40 transition-colors"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Envoyer"
            className="flex-shrink-0 h-9 w-9 inline-flex items-center justify-center
                       rounded-lg bg-accent text-white hover:bg-accent-hover
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        )}
      </div>

      <div className="text-[10px] text-muted mt-1.5 text-right">
        Entree pour envoyer · Maj+Entree pour nouvelle ligne
      </div>
    </div>
  )
}
