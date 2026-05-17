/**
 * POST /api/aria/chat — endpoint Phase 1 (non-streaming).
 *
 * Body attendu :
 *   {
 *     messages: Array<{ role: 'user' | 'assistant'; content: string }>,
 *     ui?: { section?: string; page_url?: string; derniere_action_chrono?: string },
 *     conversation_id?: string,        // null/absent => nouvelle conversation
 *   }
 *
 * Reponse :
 *   { content: string, conversation_id: string, message_id: string, usage: {...} }
 *
 * Workflow :
 *   1. Auth via withAuth.
 *   2. Cree la conversation si conversation_id absent.
 *   3. Persiste le message user dans aria_messages.
 *   4. Construit le live context (buildLiveContext) en parallele.
 *   5. Appelle Claude (messages.create non-streaming).
 *   6. Persiste la reponse assistant.
 *   7. Met a jour aria_conversations.last_message_at.
 *
 * Aucune logique metier patrimoniale ici : tout passe par lib/aria/
 * qui s'appuie sur lib/analyse/aggregateur (regle #1, pas de duplication).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'
import { err, ok, withAuth } from '@/lib/utils/api'
import { buildLiveContext } from '@/lib/aria'
import type { User } from '@supabase/supabase-js'

// Modele par defaut — surchargeable via env ARIA_MODEL.
// Le spec FYNIX cible claude-sonnet-4 (May 2024). On laisse env override
// pour permettre la migration vers Sonnet 4.6/Opus 4.7 sans toucher au code.
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
  if (messages.length === 0) {
    return err('Au moins un message est requis', 400)
  }
  const lastMessage = messages[messages.length - 1]
  if (!lastMessage || lastMessage.role !== 'user') {
    return err('Le dernier message doit avoir le role "user"', 400)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return err('ANTHROPIC_API_KEY non configuree', 500)
  }

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
    // verifie que la conversation appartient bien a l'utilisateur (RLS le ferait
    // mais on prefere un 404 explicite plutot qu'un INSERT echoue ensuite).
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

  // 4. Live context + appel Claude (sequentiel : on a besoin du context d'abord)
  let systemPrompt: string
  try {
    const built = await buildLiveContext({ supabase, userId: user.id, ui: uiContext })
    systemPrompt = built.systemPrompt
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(`Construction du contexte: ${msg}`, 500)
  }

  const client = new Anthropic({ apiKey })
  const model  = process.env.ARIA_MODEL || DEFAULT_MODEL

  // Limite l'historique aux N derniers messages pour controler les tokens.
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES)

  let claudeResponse
  try {
    claudeResponse = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   trimmed.map((m) => ({ role: m.role, content: m.content })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(`Appel Claude: ${msg}`, 502)
  }

  // Extrait le texte de la reponse (concatene les blocs text).
  const responseText = claudeResponse.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  // 5. Persiste la reponse assistant
  const { data: assistantRow, error: insertAssistantErr } = await supabase
    .from('aria_messages')
    .insert({
      conversation_id: conversationId,
      user_id:         user.id,
      role:            'assistant',
      content:         responseText,
      ui_context:      uiContext,
    })
    .select('id')
    .single()
  if (insertAssistantErr || !assistantRow) {
    return err(`Persistance message assistant: ${insertAssistantErr?.message ?? 'inconnue'}`, 500)
  }

  // 6. Met a jour last_message_at
  await supabase
    .from('aria_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', user.id)

  return ok({
    content:         responseText,
    conversation_id: conversationId,
    message_id:      assistantRow.id as string,
    usage: {
      input_tokens:  claudeResponse.usage.input_tokens,
      output_tokens: claudeResponse.usage.output_tokens,
    },
    model,
  })
})
