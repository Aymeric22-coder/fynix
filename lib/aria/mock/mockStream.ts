/**
 * Handler "mock" pour /api/aria/chat — simule une session ARIA complete
 * sans aucun appel a l'API Anthropic.
 *
 *   1. Detecte l'intent depuis la derniere question utilisateur
 *   2. Si tool : execute le VRAI tool (donc chiffres reels) puis stream un
 *      commentaire genere par template
 *   3. Si texte direct : stream un texte template utilisant les vraies
 *      donnees du patrimoine
 *
 * Active via env var ARIA_MOCK_MODE=true. Permet de tester l'UX sans frais.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PatrimoineComplet } from '@/types/analyse'
import { encodeSSEFrame } from '@/lib/aria/sse'
import { executeTool, type ToolExecutionContext } from '@/lib/aria/tools'
import { detectIntent } from './intentDetector'
import { buildTextResponse, buildToolCommentary } from './responseTemplates'

const TOKEN_DELAY_MS = 25            // simule le streaming Claude (~ 40 tokens/sec)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Stream un texte word-by-word avec un petit delai pour simuler Claude.
 * Emet des frames SSE delta + accumule le texte final.
 */
async function streamText(
  controller: ReadableStreamDefaultController<Uint8Array>,
  text: string,
): Promise<void> {
  // Decoupe en "tokens" (mots + ponctuation). Pour rester realiste on
  // emet par groupe de 1-3 caracteres a la fois.
  const chunks = text.match(/.{1,4}/g) ?? [text]
  for (const chunk of chunks) {
    controller.enqueue(encodeSSEFrame({ type: 'delta', delta: chunk }))
    await sleep(TOKEN_DELAY_MS)
  }
}

export interface RunMockStreamParams {
  controller:       ReadableStreamDefaultController<Uint8Array>
  supabase:         SupabaseClient
  userId:           string
  patrimoine:       PatrimoineComplet
  conversationId:   string
  /** Derniere question utilisateur (string). */
  lastUserMessage:  string
}

export interface MockStreamResult {
  finalText: string
  toolTrace: Array<{
    tool_use_id: string
    name:        string
    input:       unknown
    result:      unknown
    success:     boolean
  }>
  /** Fake usage tokens pour la frame done (ressemble a Claude). */
  usage: { input_tokens: number; output_tokens: number }
}

export async function runMockStream(params: RunMockStreamParams): Promise<MockStreamResult> {
  const { controller, supabase, userId, patrimoine, lastUserMessage } = params

  const intent = detectIntent(lastUserMessage, patrimoine)
  const toolTrace: MockStreamResult['toolTrace'] = []
  let finalText = ''

  if (intent.kind === 'tool') {
    // 1. Emet le tool_use event (UI affiche carte expandable)
    const toolUseId = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    controller.enqueue(encodeSSEFrame({
      type:        'tool_use',
      tool_use_id: toolUseId,
      name:        intent.tool,
      input:       intent.input,
    }))

    // 2. Execute le vrai tool (resultats reels bases sur patrimoine du user)
    const ctx: ToolExecutionContext = { supabase, userId, patrimoine }
    const result = await executeTool(intent.tool, intent.input, ctx)
    toolTrace.push({
      tool_use_id: toolUseId,
      name:        intent.tool,
      input:       intent.input,
      result:      result.data,
      success:     result.success,
    })

    // 3. Emet le tool_result
    controller.enqueue(encodeSSEFrame({
      type:        'tool_result',
      tool_use_id: toolUseId,
      success:     result.success,
      data:        result.data,
    }))

    // 4. Stream un commentaire formate
    const commentary = buildToolCommentary(intent.tool, result.data, patrimoine)
    await streamText(controller, commentary)
    finalText = commentary
  } else {
    // Texte direct sans tool
    const text = buildTextResponse(intent.topic, patrimoine)
    await streamText(controller, text)
    finalText = text
  }

  return {
    finalText,
    toolTrace,
    // Estimation tokens : ~ 1 token / 4 chars (heuristique anglaise tronquee FR)
    usage: {
      input_tokens:  Math.round(lastUserMessage.length / 4),
      output_tokens: Math.round(finalText.length / 4),
    },
  }
}

export function isMockEnabled(): boolean {
  return process.env.ARIA_MOCK_MODE === 'true' || process.env.ARIA_MOCK_MODE === '1'
}
