/**
 * Extraction d'insights persistants en fin de conversation ARIA.
 *
 * Demande a Claude d'identifier jusqu'a 3 insights (preoccupation /
 * objectif / preference) dans la transcription. Les persiste dans
 * `aria_user_insights` avec une confidence initiale, en mergeant
 * les doublons (via uniq index user_id+type+lower(insight)).
 *
 * Appel fire-and-forget en fin de stream (apres le summarizer).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const INSIGHTS_MODEL = 'claude-haiku-4-5'
const INSIGHTS_MAX_TOKENS = 384
const INSIGHTS_MIN_MESSAGES = 5
const INSIGHTS_DEFAULT_CONFIDENCE = 0.6

const INSIGHTS_SYSTEM = [
  'Tu analyses des conversations entre un utilisateur et son assistant patrimonial ARIA.',
  '',
  'Identifie jusqu\'a 3 INSIGHTS PERSISTANTS sur l\'utilisateur — des observations utiles a memoriser pour les conversations futures.',
  '',
  'Categories :',
  '- "preoccupation" : ce qui inquiete l\'utilisateur (ex: "Stresse sur la securite")',
  '- "objectif"      : ce que l\'utilisateur cherche a atteindre (ex: "Vise un FIRE lean a 50 ans")',
  '- "preference"    : ses gouts, styles d\'investissement (ex: "Prefere ETF ESG", "Refuse les SCPI")',
  '',
  'Reponds STRICTEMENT en JSON sous cette forme, sans markdown :',
  '{ "insights": [ { "type": "preoccupation|objectif|preference", "insight": "phrase courte FR", "confidence": 0.6 } ] }',
  '',
  'Regles :',
  '- 0 a 3 insights maximum, prends seulement les plus solides.',
  '- Confidence entre 0.4 (mention vague) et 0.9 (l\'utilisateur l\'a explicitement dit).',
  '- N\'invente RIEN qui ne soit pas dans la conversation.',
  '- Pas d\'insight purement chronologique ("a parle de X aujourd\'hui").',
  '- Si rien d\'utile, renvoie { "insights": [] }.',
].join('\n')

export type InsightType = 'preoccupation' | 'objectif' | 'preference'

export interface ExtractedInsight {
  type:       InsightType
  insight:    string
  confidence: number
}

export interface ExtractInsightsResult {
  /** True si au moins 1 insight a ete persiste (ou maj). */
  persisted: boolean
  /** Insights extraits (apres validation). */
  insights:  ExtractedInsight[]
  /** Raison du skip si persisted=false. */
  reason?:   string
}

export interface ExtractInsightsOptions {
  apiKey?:      string
  model?:       string
  minMessages?: number
}

/**
 * Parse la reponse JSON de Claude, tolere les imperfections (texte
 * autour du JSON, JSON dans bloc markdown). Renvoie un tableau vide
 * si ininterpretable.
 */
export function parseInsightsResponse(raw: string): ExtractedInsight[] {
  if (!raw) return []
  // Extrait le premier objet JSON valide
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []
  try {
    const obj = JSON.parse(match[0]) as { insights?: unknown }
    if (!Array.isArray(obj.insights)) return []
    const valid: ExtractedInsight[] = []
    for (const raw of obj.insights) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as { type?: unknown; insight?: unknown; confidence?: unknown }
      if (r.type !== 'preoccupation' && r.type !== 'objectif' && r.type !== 'preference') continue
      if (typeof r.insight !== 'string' || r.insight.trim().length < 3) continue
      const conf = typeof r.confidence === 'number' && isFinite(r.confidence)
        ? Math.max(0, Math.min(1, r.confidence))
        : INSIGHTS_DEFAULT_CONFIDENCE
      valid.push({ type: r.type, insight: r.insight.trim().slice(0, 280), confidence: conf })
      if (valid.length >= 3) break
    }
    return valid
  } catch {
    return []
  }
}

/**
 * Persiste un insight en mergeant les doublons. Utilise l'index unique
 * (user_id, type, lower(insight)) pour eviter d'inserer 2 fois la meme
 * observation : on met simplement a jour `last_confirmed_at` et on
 * remonte la `confidence` (moyenne ponderee avec l'existante).
 */
async function persistInsight(
  supabase: SupabaseClient,
  userId:   string,
  insight:  ExtractedInsight,
): Promise<void> {
  const lower = insight.insight.toLowerCase()
  const { data: existing } = await supabase
    .from('aria_user_insights')
    .select('id, confidence')
    .eq('user_id', userId)
    .eq('insight_type', insight.type)
    .ilike('insight', lower)
    .maybeSingle()

  if (existing) {
    const prevConf = Number(existing.confidence ?? 0.5)
    const newConf  = Math.min(1, prevConf * 0.6 + insight.confidence * 0.4 + 0.05)
    await supabase
      .from('aria_user_insights')
      .update({ confidence: newConf, last_confirmed_at: new Date().toISOString() })
      .eq('id', existing.id as string)
    return
  }

  await supabase
    .from('aria_user_insights')
    .insert({
      user_id:           userId,
      insight_type:      insight.type,
      insight:           insight.insight,
      confidence:        insight.confidence,
      last_confirmed_at: new Date().toISOString(),
    })
}

export async function extractAndPersistInsights(params: {
  supabase:       SupabaseClient
  userId:         string
  conversationId: string
  options?:       ExtractInsightsOptions
}): Promise<ExtractInsightsResult> {
  const { supabase, userId, conversationId, options } = params
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { persisted: false, insights: [], reason: 'no_api_key' }

  try {
    const { data: messages, error } = await supabase
      .from('aria_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error || !messages) return { persisted: false, insights: [], reason: 'messages_load_error' }

    const minMessages = options?.minMessages ?? INSIGHTS_MIN_MESSAGES
    if (messages.length < minMessages) {
      return { persisted: false, insights: [], reason: 'too_short' }
    }

    const transcript = messages
      .map((m) => `[${m.role}] ${m.content as string}`)
      .join('\n\n')
      .slice(0, 12_000)

    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model:      options?.model ?? INSIGHTS_MODEL,
      max_tokens: INSIGHTS_MAX_TOKENS,
      system:     INSIGHTS_SYSTEM,
      messages:   [{ role: 'user', content: transcript }],
    })

    const text = resp.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text).join('\n')

    const insights = parseInsightsResponse(text)
    if (insights.length === 0) {
      return { persisted: false, insights: [], reason: 'no_insights_detected' }
    }

    // Persistance sequentielle (faible volume, on s'en moque)
    for (const i of insights) await persistInsight(supabase, userId, i)

    return { persisted: true, insights }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { persisted: false, insights: [], reason: `error: ${msg}` }
  }
}
