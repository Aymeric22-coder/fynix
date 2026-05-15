/**
 * GET /api/enrich-isin?isin=XXXXXXXX
 *
 * Enrichit un ISIN via OpenFIGI + Yahoo Finance (cache 24h en DB).
 * Routé côté serveur pour contourner les CORS de Yahoo et masquer la
 * mécanique du cache aux clients.
 *
 * Réponse :
 *   { data: ISINData | null, error: string | null }
 *
 * Auth : nécessite un user connecté (RLS sur isin_cache exige
 * `authenticated`). On profite de withAuth pour bloquer les anonymes.
 */

import { ok, err, withAuth } from '@/lib/utils/api'
import { enrichISIN } from '@/lib/analyse/isinEnricher'

export const GET = withAuth(async (req: Request) => {
  const { searchParams } = new URL(req.url)
  const isin = searchParams.get('isin')?.trim().toUpperCase()
  if (!isin) return err('Paramètre `isin` requis')
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) {
    return err('ISIN invalide (format attendu : 2 lettres + 9 alphanum + 1 chiffre)')
  }

  const data = await enrichISIN(isin)
  return ok(data)
})
