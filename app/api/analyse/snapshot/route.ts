/**
 * POST /api/analyse/snapshot — UPSERT du snapshot patrimoine du jour
 *
 * Workflow :
 *  1. Calcule getPatrimoineComplet(userId)
 *  2. Derive les 7 valeurs cles (brut/net/portefeuille/immo/cash/dettes/passif)
 *  3. UPSERT dans wealth_snapshots (clé : user_id + snapshot_date du jour UTC)
 *
 * Appele automatiquement en fire-and-forget par usePatrimoineAnalyse apres
 * chaque fetch reussi. Aucun cron requis : si l'utilisateur consulte son
 * analyse au moins une fois par jour, son historique se construit tout seul.
 *
 * Pas de body necessaire. Si une erreur survient (table absente, RLS), on
 * renvoie le detail — c'est juste de l'historique, l'app ne dépend pas du
 * snapshot pour son rendu courant.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'
import type { User } from '@supabase/supabase-js'

export const POST = withAuth(async (_req: Request, user: User) => {
  const p = await getPatrimoineComplet(user.id)

  // Date du jour en UTC pour cohérence avec portfolio_snapshots.
  const today = new Date()
  const snapshotDate = `${today.getUTCFullYear()}-`
                     + `${String(today.getUTCMonth() + 1).padStart(2, '0')}-`
                     + `${String(today.getUTCDate()).padStart(2, '0')}`

  // Progression FIRE : patrimoine_net / cible × 100. Null si pas de cible.
  const cibleFire = (p.fireInputs.revenu_passif_cible ?? 0) * 12 * 25
  const progressionFirePct = cibleFire > 0
    ? Math.round((p.totalNet / cibleFire) * 100 * 10000) / 10000
    : null

  const row = {
    user_id:                user.id,
    snapshot_date:          snapshotDate,
    patrimoine_brut:        round2(p.totalBrut),
    patrimoine_net:         round2(p.totalNet),
    total_portefeuille:     round2(p.totalPortefeuille),
    total_immo:             round2(p.totalImmo),
    total_cash:             round2(p.totalCash),
    total_dettes:           round2(p.totalDettes),
    revenu_passif_mensuel:  round2(p.revenuPassifActuel),
    progression_fire_pct:   progressionFirePct,
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('wealth_snapshots')
    .upsert(row, { onConflict: 'user_id,snapshot_date' })
    .select()
    .single()

  if (error) return err(error.message, 500)
  return ok(data)
})

function round2(n: number): number { return Math.round(n * 100) / 100 }
