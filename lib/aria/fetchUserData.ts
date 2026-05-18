/**
 * Recupere en parallele toutes les donnees patrimoniales de l'utilisateur
 * necessaires a la construction du contexte ARIA.
 *
 * Reutilise massivement `getPatrimoineComplet` qui agrege deja positions,
 * biens, comptes, scores, projection FIRE et recommandations en un seul
 * appel (regle #1 : pas de duplication de calculs).
 *
 * On y ajoute uniquement les donnees specifiques a ARIA :
 *   - snapshots wealth (table `wealth_snapshots`) pour l'evolution 30j/90j
 *   - 10 dernieres lignes de `user_activity_log`
 *
 * Les erreurs partielles ne cassent pas le retour : si une query echoue
 * on log et on substitue un fallback vide. Comportement defensif voulu :
 * ARIA reste utilisable meme avec une table indisponible.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'
import type {
  AriaActivityRow, AriaInsightType, AriaPastConversation,
  AriaPersistentInsight, AriaRawData, AriaWealthSnapshotRow,
} from './types'

/**
 * Enveloppe une promesse Supabase pour qu'une erreur n'interrompe pas
 * l'agregat global. Renvoie le fallback fourni en cas d'echec.
 */
async function safeQuery<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (e) {
    // Dev-only log (silencieux en prod). Si le projet expose un devLog
    // unifie plus tard, remplacer ici.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[aria/fetchUserData] ${label} a echoue, fallback applique`, e)
    }
    return fallback
  }
}

async function loadSnapshots(
  supabase: SupabaseClient,
  userId: string,
): Promise<AriaWealthSnapshotRow[]> {
  const { data, error } = await supabase
    .from('wealth_snapshots')
    .select('snapshot_date, patrimoine_net, patrimoine_brut, total_dettes')
    .eq('user_id', userId)
    .order('snapshot_date', { ascending: false })
    .limit(120)

  if (error) throw error
  return (data ?? []).map((row) => ({
    snapshot_date:    row.snapshot_date as string,
    patrimoine_net:   Number(row.patrimoine_net ?? 0),
    patrimoine_brut:  Number(row.patrimoine_brut ?? 0),
    total_dettes:     Number(row.total_dettes ?? 0),
  }))
}

async function loadActivites(
  supabase: SupabaseClient,
  userId: string,
): Promise<AriaActivityRow[]> {
  const { data, error } = await supabase
    .from('user_activity_log')
    .select('id, type, description, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw error
  return (data ?? []).map((row) => ({
    id:          row.id as string,
    type:        row.type as string,
    description: row.description as string,
    metadata:    (row.metadata ?? {}) as Record<string, unknown>,
    created_at:  row.created_at as string,
  }))
}

async function loadConversationsPassees(
  supabase: SupabaseClient,
  userId: string,
  excludeConversationId: string | null,
): Promise<AriaPastConversation[]> {
  // 3 dernieres conversations qui ont deja un summary, en excluant la
  // conversation courante (si on est en train de chatter dessus).
  let query = supabase
    .from('aria_conversations')
    .select('id, summary, last_message_at')
    .eq('user_id', userId)
    .not('summary', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(3)
  if (excludeConversationId) {
    query = query.neq('id', excludeConversationId)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => ({
    id:              row.id as string,
    summary:         row.summary as string,
    last_message_at: row.last_message_at as string,
  }))
}

async function loadInsightsPersistants(
  supabase: SupabaseClient,
  userId: string,
): Promise<AriaPersistentInsight[]> {
  // Top 5 par confidence DESC, tie-break sur recence (last_confirmed_at).
  const { data, error } = await supabase
    .from('aria_user_insights')
    .select('insight_type, insight, confidence, last_confirmed_at')
    .eq('user_id', userId)
    .order('confidence',        { ascending: false })
    .order('last_confirmed_at', { ascending: false })
    .limit(5)

  if (error) throw error
  return (data ?? []).map((row) => ({
    type:              row.insight_type as AriaInsightType,
    insight:           row.insight as string,
    confidence:        Number(row.confidence ?? 0),
    last_confirmed_at: row.last_confirmed_at as string,
  }))
}

/**
 * Point d'entree : recupere en parallele patrimoine complet + snapshots
 * + activites recentes + conversations passees + insights persistants.
 * Garantit un retour meme si certaines queries echouent (le `patrimoine`
 * reste obligatoire — sans lui ARIA n'a rien a dire).
 *
 * @param excludeConversationId si fourni, exclu cette conversation de la
 *   liste des "conversations passees" (utile quand on est en train de
 *   chatter dessus — on ne veut pas se citer soi-meme).
 */
export async function fetchUserData(
  supabase: SupabaseClient,
  userId: string,
  excludeConversationId: string | null = null,
): Promise<AriaRawData> {
  const [patrimoine, snapshots, activites, conversationsPassees, insightsPersistants] = await Promise.all([
    getPatrimoineComplet(userId),
    safeQuery('loadSnapshots',         loadSnapshots(supabase, userId),                                  [] as AriaWealthSnapshotRow[]),
    safeQuery('loadActivites',         loadActivites(supabase, userId),                                  [] as AriaActivityRow[]),
    safeQuery('loadConversationsPassees', loadConversationsPassees(supabase, userId, excludeConversationId), [] as AriaPastConversation[]),
    safeQuery('loadInsightsPersistants',  loadInsightsPersistants(supabase, userId),                     [] as AriaPersistentInsight[]),
  ])

  return {
    patrimoine,
    snapshots,
    activites,
    conversations_passees: conversationsPassees,
    insights_persistants:  insightsPersistants,
  }
}
