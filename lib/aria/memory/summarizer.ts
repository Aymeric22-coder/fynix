/**
 * Resume une conversation ARIA via un appel court a Claude.
 * Ecrit dans `aria_conversations.summary` pour injection ulterieure
 * dans le system prompt des conversations suivantes.
 *
 * Declencheur : appele par la route /api/aria/chat en fire-and-forget
 * apres le `done` SSE, si la conversation depasse SUMMARY_MIN_MESSAGES
 * et que le summary actuel est null OU date de plus de SUMMARY_TTL_MS.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const SUMMARY_MODEL = 'claude-haiku-4-5'
const SUMMARY_MAX_TOKENS = 256
const SUMMARY_MIN_MESSAGES = 5
const SUMMARY_TTL_MS = 24 * 3600 * 1000          // 24 h

const SUMMARY_SYSTEM = [
  'Tu resumes des conversations entre un utilisateur (Aymeric par exemple) et ARIA, son assistant patrimonial.',
  'Produis un resume FACTUEL en 3 a 5 phrases courtes, en francais, sans markdown :',
  '- Qu\'a demande l\'utilisateur ?',
  '- Quels chiffres / simulations / decisions sont apparus ?',
  '- Quelle suite eventuelle a ete evoquee ?',
  'Pas de salutations. Pas de meta-commentaire. Texte brut uniquement.',
].join('\n')

export interface SummarizeOptions {
  apiKey?:         string
  /** Override Anthropic model (defaut claude-haiku-4-5 — rapide + pas cher). */
  model?:          string
  /** Override seuil messages minimum. */
  minMessages?:    number
  /** Override TTL avant re-resume. */
  ttlMs?:          number
}

export interface SummarizeResult {
  /** True si un resume a ete genere et persiste. */
  generated: boolean
  /** Raison du skip si generated=false ('too_short' | 'fresh' | 'no_api_key' | 'error'). */
  reason?:   string
  /** Le resume genere (si applicable). */
  summary?:  string
}

/**
 * Decide si la conversation merite (re-)resume. Pure, testable.
 */
export function shouldSummarize(
  messagesCount: number,
  currentSummary: string | null,
  currentSummaryAge: number | null,             // ms depuis la derniere maj, null si jamais
  opts: { minMessages?: number; ttlMs?: number } = {},
): boolean {
  const minMessages = opts.minMessages ?? SUMMARY_MIN_MESSAGES
  const ttl         = opts.ttlMs ?? SUMMARY_TTL_MS
  if (messagesCount < minMessages) return false
  if (!currentSummary) return true
  if (currentSummaryAge === null) return true
  return currentSummaryAge > ttl
}

/**
 * Genere un resume via Claude et le persiste dans aria_conversations.
 * Ne throw jamais : retourne `{ generated: false, reason }` en cas d'erreur
 * (un summary rate ne doit pas casser la conversation principale).
 */
export async function summarizeConversation(params: {
  supabase:       SupabaseClient
  userId:         string
  conversationId: string
  options?:       SummarizeOptions
}): Promise<SummarizeResult> {
  const { supabase, userId, conversationId, options } = params
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { generated: false, reason: 'no_api_key' }

  try {
    // 1. Charge la conversation + count messages + dernier summary
    const { data: conv, error: convErr } = await supabase
      .from('aria_conversations')
      .select('id, summary, started_at, last_message_at')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (convErr || !conv) return { generated: false, reason: 'conversation_not_found' }

    const { data: messages, error: msgErr } = await supabase
      .from('aria_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (msgErr || !messages) return { generated: false, reason: 'messages_load_error' }

    const currentSummary = (conv.summary as string | null) ?? null
    // Age summary : on n'a pas summarized_at en DB ; approximation = age de
    // la derniere maj de la conversation (suppose que le summary est mis a
    // jour en meme temps que last_message_at lors d'un summarize precedent).
    const currentSummaryAge = currentSummary
      ? Date.now() - new Date(conv.last_message_at as string).getTime()
      : null

    if (!shouldSummarize(messages.length, currentSummary, currentSummaryAge,
      { minMessages: options?.minMessages, ttlMs: options?.ttlMs })) {
      return { generated: false, reason: 'too_short_or_fresh' }
    }

    // 2. Construit le prompt et appelle Claude (Haiku, court, pas cher)
    const transcript = messages
      .map((m) => `[${m.role}] ${m.content as string}`)
      .join('\n\n')
      .slice(0, 12_000)                                      // safety cap

    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model:      options?.model ?? SUMMARY_MODEL,
      max_tokens: SUMMARY_MAX_TOKENS,
      system:     SUMMARY_SYSTEM,
      messages:   [{ role: 'user', content: transcript }],
    })

    const summary = resp.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!summary) return { generated: false, reason: 'empty_response' }

    // 3. Persiste
    const { error: updateErr } = await supabase
      .from('aria_conversations')
      .update({ summary })
      .eq('id', conversationId)
      .eq('user_id', userId)
    if (updateErr) return { generated: false, reason: `persist_error: ${updateErr.message}` }

    return { generated: true, summary }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { generated: false, reason: `error: ${msg}` }
  }
}
