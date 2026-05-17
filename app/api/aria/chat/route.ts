/**
 * POST /api/aria/chat — endpoint Phase 2 (streaming SSE).
 *
 * Body attendu :
 *   {
 *     messages: Array<{ role: 'user' | 'assistant'; content: string }>,
 *     ui?: { section?: string; page_url?: string; derniere_action_chrono?: string },
 *     conversation_id?: string,        // null/absent => nouvelle conversation
 *   }
 *
 * Reponse : flux Server-Sent Events (text/event-stream). Chaque ligne
 * commence par "data: " et contient un JSON avec un champ `type` :
 *   { type: 'meta',  conversation_id }            // emis en premier
 *   { type: 'delta', delta }                      // un token / chunk de texte
 *   { type: 'done',  message_id, usage }          // fin du stream
 *   { type: 'error', message }                    // erreur (terminal)
 *
 * Workflow :
 *   1. Auth via withAuth.
 *   2. Validation body.
 *   3. Cree la conversation si conversation_id absent.
 *   4. Persiste le message user dans aria_messages.
 *   5. Construit le live context (buildLiveContext).
 *   6. Ouvre un stream Anthropic, retourne immediatement un ReadableStream
 *      SSE. Le message assistant final est persiste DANS le start() de
 *      ce stream, juste avant l'evenement done.
 *
 * Aucune logique metier patrimoniale ici : tout passe par lib/aria/.
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { err, withAuth } from '@/lib/utils/api'
import { buildLiveContext } from '@/lib/aria'
import { encodeSSEFrame, type AriaSSEEvent } from '@/lib/aria/sse'
import type { User } from '@supabase/supabase-js'

// Modele par defaut — surchargeable via env ARIA_MODEL.
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024
const MAX_HISTORY_MESSAGES = 30

interface UIBody {
  section?:                string | null
  page_url?:               string | null
  derniere_action_chrono?: string | null
}

interface ChatBody {
  messages?:         Array<{ role?: string; content?: string }>
  ui?:               UIBody
  conversation_id?:  string | null
}

function isClientMessage(m: unknown): m is { role: 'user' | 'assistant'; content: string } {
  if (!m || typeof m !== 'object') return false
  const obj = m as Record<string, unknown>
  return (obj.role === 'user' || obj.role === 'assistant')
    && typeof obj.content === 'string'
    && obj.content.length > 0
}

// ─────────────────────────────────────────────────────────────────
// Helpers SSE
// ─────────────────────────────────────────────────────────────────

function sseEncode(payload: AriaSSEEvent): Uint8Array {
  return encodeSSEFrame(payload)
}

/**
 * Construit un Response SSE qui renvoie immediatement une seule frame
 * d'erreur puis ferme. Sert aux echecs survenus AVANT l'ouverture du
 * stream Anthropic (validation, auth, persistance initiale).
 */
function sseErrorResponse(message: string, status: number): NextResponse {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sseEncode({ type: 'error', message }))
      controller.close()
    },
  })
  return new NextResponse(stream, {
    status,
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: Request, user: User) => {
  // 1. Parse body
  let body: ChatBody
  try {
    body = await req.json() as ChatBody
  } catch {
    return err('Body JSON invalide', 400)
  }

  const messagesRaw = body.messages ?? []
  const messages = messagesRaw.filter(isClientMessage)
  if (messages.length === 0) return err('Au moins un message est requis', 400)
  const lastMessage = messages[messages.length - 1]
  if (!lastMessage || lastMessage.role !== 'user') {
    return err('Le dernier message doit avoir le role "user"', 400)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return err('ANTHROPIC_API_KEY non configuree', 500)

  // 2. Conversation : creer si absente
  const supabase = await createServerClient()
  let conversationId = body.conversation_id ?? null

  if (!conversationId) {
    const { data, error } = await supabase
      .from('aria_conversations')
      .insert({ user_id: user.id })
      .select('id')
      .single()
    if (error || !data) return err(`Creation conversation: ${error?.message ?? 'inconnue'}`, 500)
    conversationId = data.id as string
  } else {
    const { data, error } = await supabase
      .from('aria_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return err(`Lecture conversation: ${error.message}`, 500)
    if (!data) return err('Conversation introuvable', 404)
  }

  // 3. Persiste le message user
  const uiContext = body.ui ?? null
  const { error: insertUserErr } = await supabase
    .from('aria_messages')
    .insert({
      conversation_id: conversationId,
      user_id:         user.id,
      role:            'user',
      content:         lastMessage.content,
      ui_context:      uiContext,
    })
  if (insertUserErr) return err(`Persistance message user: ${insertUserErr.message}`, 500)

  // 4. Live context
  let systemPrompt: string
  try {
    const built = await buildLiveContext({ supabase, userId: user.id, ui: uiContext })
    systemPrompt = built.systemPrompt
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return sseErrorResponse(`Construction du contexte: ${msg}`, 500)
  }

  // 5. Stream Anthropic + relais SSE
  const client = new Anthropic({ apiKey })
  const model  = process.env.ARIA_MODEL || DEFAULT_MODEL
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content }))
  const finalConversationId = conversationId

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // En premier : meta avec conversation_id pour que le client sache
      // ou rattacher la conversation des le premier byte.
      controller.enqueue(sseEncode({ type: 'meta', conversation_id: finalConversationId }))

      let stream: Awaited<ReturnType<typeof client.messages.stream>>
      try {
        stream = client.messages.stream({
          model,
          max_tokens: MAX_TOKENS,
          system:     systemPrompt,
          messages:   trimmed,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(sseEncode({ type: 'error', message: `Appel Claude: ${msg}` }))
        controller.close()
        return
      }

      let fullText = ''
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const delta = event.delta.text
            fullText += delta
            controller.enqueue(sseEncode({ type: 'delta', delta }))
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(sseEncode({ type: 'error', message: `Stream Claude: ${msg}` }))
        controller.close()
        return
      }

      // Persiste la reponse assistant + met a jour last_message_at
      const finalText = fullText.trim()
      const { data: assistantRow, error: insertErr } = await supabase
        .from('aria_messages')
        .insert({
          conversation_id: finalConversationId,
          user_id:         user.id,
          role:            'assistant',
          content:         finalText,
          ui_context:      uiContext,
        })
        .select('id')
        .single()

      if (insertErr || !assistantRow) {
        controller.enqueue(sseEncode({
          type:    'error',
          message: `Persistance message assistant: ${insertErr?.message ?? 'inconnue'}`,
        }))
        controller.close()
        return
      }

      await supabase
        .from('aria_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', finalConversationId)
        .eq('user_id', user.id)

      // Recupere les usage tokens depuis le message final
      let usage: { input_tokens: number; output_tokens: number } | null = null
      try {
        const finalMsg = await stream.finalMessage()
        usage = { input_tokens: finalMsg.usage.input_tokens, output_tokens: finalMsg.usage.output_tokens }
      } catch {
        // pas bloquant
      }

      controller.enqueue(sseEncode({
        type:       'done',
        message_id: assistantRow.id as string,
        usage,
        model,
      }))
      controller.close()
    },

    cancel() {
      // Si le client coupe la connexion, on n'a rien de plus a faire :
      // les messages user + assistant peuvent etre incomplets, c'est
      // accepte (Phase 2). La Phase 5 ajoutera un retry / completion.
    },
  })

  return new NextResponse(responseStream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-store, must-revalidate',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
