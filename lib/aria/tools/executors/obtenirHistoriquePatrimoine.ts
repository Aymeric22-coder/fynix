/**
 * Tool : retourne l'historique du patrimoine net (max 120 jours).
 * Lit directement wealth_snapshots via le client supabase passe au
 * dispatcher. RLS s'assure que le user ne voit que ses propres lignes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ObtenirHistoriquePatrimoineArgs {
  jours?: number
}

export interface HistoriquePoint {
  date:            string         // ISO YYYY-MM-DD
  patrimoine_net:  number
  patrimoine_brut: number
  total_dettes:    number
}

export interface ObtenirHistoriquePatrimoineResult {
  ok:                       boolean
  raison?:                  string
  jours_demandes:           number
  nb_points:                number
  premier_point?:           HistoriquePoint
  dernier_point?:           HistoriquePoint
  variation_eur?:           number
  variation_pct?:           number | null
  /** Echantillon trie du plus ancien au plus recent (max 20 points). */
  points:                   HistoriquePoint[]
}

export async function executeObtenirHistoriquePatrimoine(
  supabase: SupabaseClient,
  userId: string,
  args: ObtenirHistoriquePatrimoineArgs,
): Promise<ObtenirHistoriquePatrimoineResult> {
  const jours = Math.min(120, Math.max(1, Number(args.jours) || 30))
  const sinceMs = Date.now() - jours * 86_400_000
  const sinceDate = new Date(sinceMs).toISOString().slice(0, 10)        // YYYY-MM-DD

  const { data, error } = await supabase
    .from('wealth_snapshots')
    .select('snapshot_date, patrimoine_net, patrimoine_brut, total_dettes')
    .eq('user_id', userId)
    .gte('snapshot_date', sinceDate)
    .order('snapshot_date', { ascending: true })

  if (error) {
    return {
      ok: false,
      raison: `Lecture wealth_snapshots: ${error.message}`,
      jours_demandes: jours,
      nb_points: 0,
      points: [],
    }
  }

  const rows = (data ?? []).map((r) => ({
    date:            r.snapshot_date as string,
    patrimoine_net:  Number(r.patrimoine_net ?? 0),
    patrimoine_brut: Number(r.patrimoine_brut ?? 0),
    total_dettes:    Number(r.total_dettes ?? 0),
  }))

  if (rows.length === 0) {
    return { ok: true, jours_demandes: jours, nb_points: 0, points: [] }
  }

  const premier = rows[0]!
  const dernier = rows[rows.length - 1]!
  const variation = dernier.patrimoine_net - premier.patrimoine_net
  const variationPct = premier.patrimoine_net !== 0
    ? (variation / Math.abs(premier.patrimoine_net)) * 100
    : null

  // Echantillonnage (max 20 points repartis)
  const sampleSize = Math.min(20, rows.length)
  const step = Math.max(1, Math.floor(rows.length / sampleSize))
  const sample: HistoriquePoint[] = []
  for (let i = 0; i < rows.length; i += step) sample.push(rows[i]!)
  if (sample[sample.length - 1] !== dernier) sample.push(dernier)

  return {
    ok: true,
    jours_demandes: jours,
    nb_points:      rows.length,
    premier_point:  premier,
    dernier_point:  dernier,
    variation_eur:  Math.round(variation),
    variation_pct:  variationPct !== null ? Math.round(variationPct * 100) / 100 : null,
    points:         sample,
  }
}
