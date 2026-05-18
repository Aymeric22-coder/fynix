/**
 * Hook client pour le chat ARIA en streaming SSE.
 *
 *   const {
 *     messages, conversationId, isStreaming, lastError,
 *     sendMessage, cancel, reset,
 *   } = useAriaStream({ conversationId: existingId, ui: { section } })
 *
 * - Maintient l'etat des messages (user + assistant) cote client.
 * - `sendMessage(text)` ouvre un POST /api/aria/chat, lit le ReadableStream
 *   ligne par ligne, applique les events SSE :
 *     meta  -> renseigne conversationId
 *     delta -> append au dernier message assistant
 *     done  -> renseigne lastMessageId, isStreaming=false
 *     error -> renseigne lastError, isStreaming=false
 * - `cancel()` abort le fetch en cours (si streaming).
 * - `reset()` vide la conversation cote client (pas DB).
 *
 * Pas de cache disque : reload de page = conversation rechargee a vide.
 * La persistance DB sert pour l'historique entre sessions (Phase 4).
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createSSEParser, type AriaSSEEvent } from '@/lib/aria/sse'

export type AriaChatRole = 'user' | 'assistant'

export interface AriaChatMessage {
  role:        AriaChatRole
  content:     string
  /** ID DB une fois le message persiste (assistant uniquement, apres done). */
  message_id?: string
  /** True pendant que les deltas arrivent encore. */
  streaming?:  boolean
}

export interface AriaUIInput {
  section?:                string | null
  page_url?:               string | null
  derniere_action_chrono?: string | null
}

export interface UseAriaStreamOptions {
  /** Reprendre une conversation existante (sinon nouvelle conversation). */
  conversationId?: string | null
  /** Contexte UI envoye a chaque message (section active, etc.). */
  ui?:             AriaUIInput | null
  /** Override de l'endpoint (utile pour tests). */
  endpoint?:       string
}

export interface UseAriaStreamResult {
  messages:       AriaChatMessage[]
  conversationId: string | null
  isStreaming:    boolean
  lastError:      string | null
  sendMessage:    (text: string) => Promise<void>
  cancel:         () => void
  reset:          () => void
}

export function useAriaStream(options: UseAriaStreamOptions = {}): UseAriaStreamResult {
  const { endpoint = '/api/aria/chat' } = options
  const [messages, setMessages] = useState<AriaChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(options.conversationId ?? null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const uiRef    = useRef<AriaUIInput | null>(options.ui ?? null)
  uiRef.current  = options.ui ?? null

  // Cleanup : abort si unmount pendant streaming
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    setMessages([])
    setConversationId(null)
    setLastError(null)
  }, [cancel])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    setLastError(null)

    // 1. Append user message + placeholder assistant immediatement (UX)
    const userMsg: AriaChatMessage = { role: 'user', content: trimmed }
    const assistantMsg: AriaChatMessage = { role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    // 2. Construit l'historique a envoyer (sans le placeholder vide)
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))

    let response: Response
    try {
      response = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages:        history,
          ui:              uiRef.current,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const msg = e instanceof Error ? e.message : String(e)
      setLastError(msg)
      setIsStreaming(false)
      return
    }

    if (!response.ok) {
      // Erreur HTTP : essaye de lire le JSON {error}, sinon message generique
      let errMsg = `HTTP ${response.status}`
      try {
        const txt = await response.text()
        try {
          const j = JSON.parse(txt) as { error?: string }
          if (j.error) errMsg = j.error
        } catch {
          if (txt.trim().length > 0 && txt.length < 300) errMsg = txt.trim()
        }
      } catch { /* ignore */ }
      setLastError(errMsg)
      setIsStreaming(false)
      // Retire le placeholder assistant vide pour ne pas afficher une bulle fantome
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]!
        if (last.role === 'assistant' && last.content === '') return prev.slice(0, -1)
        return prev
      })
      abortRef.current = null
      return
    }

    if (!response.body) {
      setLastError('Reponse sans corps')
      setIsStreaming(false)
      return
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    const parser  = createSSEParser(applyEvent)

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        const msg = e instanceof Error ? e.message : String(e)
        setLastError(msg)
      }
    } finally {
      setIsStreaming(false)
      // Marque le dernier assistant comme non-streaming
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]!
        if (last.role !== 'assistant' || !last.streaming) return prev
        return [...prev.slice(0, -1), { ...last, streaming: false }]
      })
      abortRef.current = null
    }

    function applyEvent(evt: AriaSSEEvent) {
      switch (evt.type) {
        case 'meta':
          setConversationId(evt.conversation_id)
          return
        case 'delta':
          setMessages((prev) => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]!
            if (last.role !== 'assistant') return prev
            return [...prev.slice(0, -1), { ...last, content: last.content + evt.delta }]
          })
          return
        case 'done':
          setMessages((prev) => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]!
            if (last.role !== 'assistant') return prev
            return [...prev.slice(0, -1), { ...last, message_id: evt.message_id, streaming: false }]
          })
          return
        case 'error':
          setLastError(evt.message)
          return
      }
    }
  }, [conversationId, endpoint, isStreaming, messages])

  return { messages, conversationId, isStreaming, lastError, sendMessage, cancel, reset }
}
