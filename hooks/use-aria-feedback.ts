/**
 * Hook client pour envoyer un feedback +1/-1 sur un message ARIA.
 *
 *   const { sendFeedback, isSending, lastError } = useAriaFeedback()
 *   await sendFeedback({ messageId, rating: 1 })
 *
 * Phase 6 cablera ce hook sur les boutons 👍/👎 sous chaque AriaMessage.
 */
'use client'

import { useCallback, useState } from 'react'

export interface SendFeedbackInput {
  messageId: string
  rating:    1 | -1
  reason?:   string
}

export interface UseAriaFeedbackResult {
  sendFeedback: (input: SendFeedbackInput) => Promise<{ ok: boolean; error?: string }>
  isSending:    boolean
  lastError:    string | null
}

export function useAriaFeedback(endpoint = '/api/aria/feedback'): UseAriaFeedbackResult {
  const [isSending, setIsSending] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const sendFeedback = useCallback(async (input: SendFeedbackInput) => {
    setIsSending(true)
    setLastError(null)
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message_id: input.messageId,
          rating:     input.rating,
          reason:     input.reason ?? null,
        }),
      })
      const json = await res.json().catch(() => ({})) as { data?: unknown; error?: string }
      if (!res.ok) {
        const msg = json.error ?? `HTTP ${res.status}`
        setLastError(msg)
        return { ok: false, error: msg }
      }
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLastError(msg)
      return { ok: false, error: msg }
    } finally {
      setIsSending(false)
    }
  }, [endpoint])

  return { sendFeedback, isSending, lastError }
}
