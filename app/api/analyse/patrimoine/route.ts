/**
 * GET /api/analyse/patrimoine
 *
 * Renvoie le PatrimoineComplet de l'utilisateur connecté. Tout est
 * calculé côté serveur (FX, enrichissement ISIN, agrégations) pour
 * éviter d'envoyer de la logique métier au client.
 *
 * Coût : 4 requêtes Supabase en parallèle (positions, immo, cash,
 * profil) + cache ISIN (généralement HIT 24h). Comptez 100-300 ms si
 * cache chaud, 2-5 s à froid sur un portefeuille de ~20 lignes.
 */

import { ok, err, withAuth } from '@/lib/utils/api'
import { getPatrimoineComplet } from '@/lib/analyse/aggregateur'
import type { User } from '@supabase/supabase-js'

export const GET = withAuth(async (_req: Request, user: User) => {
  try {
    const data = await getPatrimoineComplet(user.id)
    return ok(data)
  } catch (e) {
    console.error('[api/analyse/patrimoine]', e)
    return err('Échec du calcul du patrimoine', 500)
  }
})
