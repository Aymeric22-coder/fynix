/**
 * Boutons 👍/👎 sous un message assistant. 👎 ouvre une mini-prompt
 * inline pour saisir une raison optionnelle.
 *
 * Utilise useAriaFeedback (Phase 5) qui pose le POST /api/aria/feedback.
 */
'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { useAriaFeedback } from '@/hooks/use-aria-feedback'

interface AriaFeedbackButtonsProps {
  messageId: string
}

export function AriaFeedbackButtons({ messageId }: AriaFeedbackButtonsProps) {
  const { sendFeedback, isSending } = useAriaFeedback()
  const [sent, setSent] = useState<'up' | 'down' | null>(null)
  const [showReason, setShowReason] = useState(false)
  const [reason, setReason] = useState('')

  async function thumbsUp() {
    if (isSending || sent) return
    const r = await sendFeedback({ messageId, rating: 1 })
    if (r.ok) setSent('up')
  }

  async function thumbsDown() {
    if (isSending || sent) return
    setShowReason(true)
  }

  async function submitDown() {
    const r = await sendFeedback({ messageId, rating: -1, reason: reason.trim() || undefined })
    if (r.ok) {
      setSent('down')
      setShowReason(false)
    }
  }

  if (sent) {
    return (
      <div className="text-[11px] text-secondary mt-1">
        Merci pour ton retour {sent === 'up' ? '👍' : '👎'}
      </div>
    )
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={thumbsUp}
          aria-label="Reponse utile"
          disabled={isSending}
          className="p-1 rounded text-secondary hover:text-accent hover:bg-surface-2 transition-colors disabled:opacity-40"
        >
          <ThumbsUp size={12} />
        </button>
        <button
          type="button"
          onClick={thumbsDown}
          aria-label="Reponse a ameliorer"
          disabled={isSending}
          className="p-1 rounded text-secondary hover:text-danger hover:bg-surface-2 transition-colors disabled:opacity-40"
        >
          <ThumbsDown size={12} />
        </button>
      </div>

      {showReason && (
        <div className="mt-2 flex gap-1.5">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Pourquoi (optionnel) ?"
            maxLength={500}
            className="flex-1 text-xs bg-surface-2 border border-border rounded px-2 py-1 text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={submitDown}
            disabled={isSending}
            className="text-xs px-2 py-1 rounded bg-surface-2 border border-border text-primary hover:border-accent transition-colors disabled:opacity-40"
          >
            Envoyer
          </button>
        </div>
      )}
    </div>
  )
}
