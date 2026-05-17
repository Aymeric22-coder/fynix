/**
 * API publique du module ARIA.
 *
 * Le point d'entree principal est `buildLiveContext({ supabase, userId, ui })`
 * qui :
 *   1. recupere toutes les donnees patrimoniales necessaires (via
 *      `fetchUserData` qui s'appuie sur `getPatrimoineComplet`),
 *   2. les transforme en un `AriaLiveContext` compact (via `buildContextFromRaw`),
 *   3. construit le system prompt final (via `buildSystemPrompt`).
 *
 * La route API `/api/aria/chat` appelle ensuite Claude avec ce system
 * prompt + l'historique des messages.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchUserData } from './fetchUserData'
import { buildContextFromRaw, type UIInput } from './computeMetrics'
import { buildSystemPrompt } from './buildSystemPrompt'
import type { AriaBuiltContext } from './types'

export async function buildLiveContext(params: {
  supabase: SupabaseClient
  userId:   string
  ui?:      UIInput | null
}): Promise<AriaBuiltContext> {
  const { supabase, userId, ui } = params
  const raw     = await fetchUserData(supabase, userId)
  const context = buildContextFromRaw(raw, ui ?? null)
  const systemPrompt = buildSystemPrompt(context)
  return { context, systemPrompt }
}

// Re-exports pratiques pour les consommateurs externes.
export { fetchUserData } from './fetchUserData'
export { buildContextFromRaw } from './computeMetrics'
export { buildSystemPrompt } from './buildSystemPrompt'
export type * from './types'
