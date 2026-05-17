/**
 * POST /api/analyse/snapshot — UPSERT du snapshot patrimoine du jour
 *
 * Workflow :
 *  1. Si body JSON contient `patrimoineComplet`, on l'utilise tel quel
 *     pour eviter une double agregation (Sprint 1 — B8). Sinon on rappelle
 *     getPatrimoineComplet pour preserver la compat (cas appels directs
 *     hors hook usePatrimoineAnalyse).
 *  2. Derive les 7 valeurs cles (brut/net/portefeuille/immo/cash/dettes/passif)
 *  3. UPSERT dans wealth_snapshots (clé : user_id + snapshot_date du jour UTC)
 *
 * Anti-rebond : si un snapshot a deja ete enregistre il y a moins de 30 s
 * pour ce user, on renvoie { skipped: true } sans toucher Supabase. Sert a
 * absorber les rafales d'events Realtime qui re-declenchent le hook.
 *
 * Pas de body obligatoire. Si une erreur survient (table absente, RLS), on
 * renvoie le detail — c'est juste de l'historique, l'app ne dépend pas du
 * snapshot pour son rendu courant.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'
import {
  shouldSkipSnapshot, markSnapshot, createMemoryStore,
} from '@/lib/analyse/snapshotDebounce'
import type { PatrimoineComplet } from '@/types/analyse'
import type { User } from '@supabase/supabase-js'

// Store en memoire au scope module (partage entre invocations sur la meme
// instance serverless). Cas degrade (plusieurs instances) : un doublon par
// instance toutes les 30 s, acceptable.
const debounceStore = createMemoryStore()

export const POST = withAuth(async (req: Request, user: User) => {
  // Anti-rebond serveur : evite la double agregation si le hook spam.
  if (shouldSkipSnapshot(user.id, Date.now(), debounceStore)) {
    return ok({ skipped: true })
  }

  // Lit le body si JSON ; supporte l'absence de body (compat).
  let bodyPatrimoine: PatrimoineComplet | undefined
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const json = await req.json() as { patrimoineComplet?: PatrimoineComplet }
      if (json && typeof json === 'object' && json.patrimoineComplet) {
        bodyPatrimoine = json.patrimoineComplet
      }
    }
  } catch {
    // body invalide → on retombe sur le fallback agregateur
  }

  // Si le client n'a pas envoye patrimoineComplet → fallback historique.
  const p: PatrimoineComplet = bodyPatrimoine ?? await getPatrimoineComplet(user.id)

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
  markSnapshot(user.id, Date.now(), debounceStore)
  return ok(data)
})

function round2(n: number): number { return Math.round(n * 100) / 100 }
