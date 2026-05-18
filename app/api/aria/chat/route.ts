/**
 * POST /api/aria/chat — endpoint Phase 3 (streaming SSE + tool calls).
 *
 * Body attendu :
 *   {
 *     messages: Array<{ role: 'user' | 'assistant'; content: string }>,
 *     ui?: { section?: string; page_url?: string; derniere_action_chrono?: string },
 *     conversation_id?: string,        // null/absent => nouvelle conversation
 *   }
 *
 * Reponse : flux Server-Sent Events (text/event-stream). Events :
 *   { type: 'meta',        conversation_id }
 *   { type: 'delta',       delta }                        // tokens texte
 *   { type: 'tool_use',    tool_use_id, name, input }     // ARIA invoque un tool
 *   { type: 'tool_result', tool_use_id, success, data }   // resultat du tool
 *   { type: 'done',        message_id, usage }            // fin OK
 *   { type: 'error',       message }                      // fin KO
 *
 * Boucle tool_use : si Claude termine un tour avec stop_reason='tool_use',
 * on execute les tools, on renvoie les tool_result via un nouveau tour
 * d'appel, et on continue jusqu'a stop_reason='end_turn' OU jusqu'a la
 * limite MAX_TOOL_ITERATIONS (anti boucle infinie).
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { err, withAuth } from '@/lib/utils/api'
import { buildLiveContext } from '@/lib/aria'
import { encodeSSEFrame, type AriaSSEEvent } from '@/lib/aria/sse'
import { ARIA_TOOLS, executeTool, type ToolExecutionContext } from '@/lib/aria/tools'
import { summarizeConversation } from '@/lib/aria/memory/summarizer'
import { extractAndPersistInsights } from '@/lib/aria/memory/insights'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'
import type { User } from '@supabase/supabase-js'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2048
const MAX_HISTORY_MESSAGES = 30
const MAX_TOOL_ITERATIONS = 5

// ─────────────────────────────────────────────────────────────────
// Types body
// ─────────────────────────────────────────────────────────────────

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
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-store, must-revalidate',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: Request, user: User) => {
  // 1. Parse + validation body
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

  // 2. Conversation
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

  // 4. Live context (et patrimoine complet, partage avec les executors de tools)
  let systemPrompt: string
  let patrimoineForTools
  try {
    patrimoineForTools = await getPatrimoineComplet(user.id)
    const built = await buildLiveContext({
      supabase,
      userId:                user.id,
      ui:                    uiContext,
      excludeConversationId: conversationId,
    })
    systemPrompt = built.systemPrompt
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return sseErrorResponse(`Construction du contexte: ${msg}`, 500)
  }

  // 5. Stream + boucle tool_use
  const client = new Anthropic({ apiKey })
  const model  = process.env.ARIA_MODEL || DEFAULT_MODEL
  const finalConversationId = conversationId

  const toolCtx: ToolExecutionContext = {
    supabase,
    userId:     user.id,
    patrimoine: patrimoineForTools,
  }

  // Historique a envoyer a Claude — sera enrichi avec les tour de tool_use.
  const conversationMessages: Anthropic.MessageParam[] = messages
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }))

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseEncode({ type: 'meta', conversation_id: finalConversationId }))

      let finalText = ''
      const toolTrace: Array<{ tool_use_id: string; name: string; input: unknown; result: unknown; success: boolean }> = []
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let stoppedByTool = false

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          stoppedByTool = false
          const stream = client.messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system:     systemPrompt,
            messages:   conversationMessages,
            tools:      [...ARIA_TOOLS],
          })

          let iterText = ''
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const delta = event.delta.text
              iterText += delta
              controller.enqueue(sseEncode({ type: 'delta', delta }))
            }
          }

          const finalMsg = await stream.finalMessage()
          totalInputTokens  += finalMsg.usage.input_tokens
          totalOutputTokens += finalMsg.usage.output_tokens

          if (iterText) finalText = iterText                 // dernier tour visible = reponse

          const toolUseBlocks = finalMsg.content.filter(
            (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
          )

          if (finalMsg.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
            // Fin normale
            break
          }

          stoppedByTool = true

          // Execute tous les tool_use du tour
          const toolResultsForClaude: Anthropic.ToolResultBlockParam[] = []
          for (const block of toolUseBlocks) {
            controller.enqueue(sseEncode({
              type:        'tool_use',
              tool_use_id: block.id,
              name:        block.name,
              input:       block.input,
            }))

            const result = await executeTool(block.name, block.input, toolCtx)
            toolTrace.push({
              tool_use_id: block.id,
              name:        block.name,
              input:       block.input,
              result:      result.data,
              success:     result.success,
            })

            controller.enqueue(sseEncode({
              type:        'tool_result',
              tool_use_id: block.id,
              success:     result.success,
              data:        result.data,
            }))

            toolResultsForClaude.push({
              type:        'tool_result',
              tool_use_id: block.id,
              content:     JSON.stringify(result.data),
              is_error:    !result.success,
            })
          }

          // Boucle pour un nouveau tour : ajoute assistant content + tool_result user
          conversationMessages.push({ role: 'assistant', content: finalMsg.content })
          conversationMessages.push({ role: 'user',      content: toolResultsForClaude })
        }

        // Si on est sorti par limite d'iterations alors qu'on attendait encore un tool
        if (stoppedByTool) {
          finalText = (finalText + '\n\n[ARIA a atteint la limite d\'iterations tool — reponse partielle]').trim()
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        controller.enqueue(sseEncode({ type: 'error', message: `Stream Claude: ${msg}` }))
        controller.close()
        return
      }

      // Persistance du message assistant (avec trace des tools si presente)
      const insertPayload: Record<string, unknown> = {
        conversation_id: finalConversationId,
        user_id:         user.id,
        role:            'assistant',
        content:         finalText.trim(),
        ui_context:      uiContext,
      }
      if (toolTrace.length > 0) {
        insertPayload.tool_calls   = toolTrace.map((t) => ({ tool_use_id: t.tool_use_id, name: t.name, input: t.input }))
        insertPayload.tool_results = toolTrace.map((t) => ({ tool_use_id: t.tool_use_id, success: t.success, data: t.result }))
      }

      const { data: assistantRow, error: insertErr } = await supabase
        .from('aria_messages')
        .insert(insertPayload)
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

      controller.enqueue(sseEncode({
        type:       'done',
        message_id: assistantRow.id as string,
        usage:      { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
        model,
      }))
      controller.close()

      // Phase 4 — fire-and-forget : resume + insights, n'attendent pas
      // la fin du stream et ne bloquent jamais la reponse user.
      void summarizeConversation({ supabase, userId: user.id, conversationId: finalConversationId })
        .catch(() => { /* silencieux : un summary rate n'est pas une erreur visible */ })
      void extractAndPersistInsights({ supabase, userId: user.id, conversationId: finalConversationId })
        .catch(() => { /* idem */ })
    },

    cancel() { /* coupe propre cote client, rien a faire */ },
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
