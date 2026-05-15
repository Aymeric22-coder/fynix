/**
 * GET /api/portfolio/resolve?isin=...&ticker=...&exchCode=...
 *
 * Résout un identifiant (ISIN priorité, ticker fallback) en métadonnées
 * riches via OpenFIGI : nom complet, ticker natif, asset_class, place
 * de cotation, FIGI.
 *
 * Utilisé par le formulaire d'ajout de position pour pré-remplir les
 * champs Nom / Classe d'actif / Ticker dès que l'utilisateur tape un
 * ISIN. NE crée AUCUNE entrée DB.
 *
 * Réponse :
 *   200 { data: { name, ticker, isin, assetClass, exchCode, figi, source, confidence } }
 *   200 { data: null }  ← aucun résultat trouvé
 *   400 si ni isin ni ticker fourni
 */

import { ok, err, withAuth } from '@/lib/utils/api'
import { resolveInstrument } from '@/lib/portfolio/resolve'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withAuth(async (req: Request, _user: User) => {
  const { searchParams } = new URL(req.url)
  const isin     = searchParams.get('isin')?.trim()     || null
  const ticker   = searchParams.get('ticker')?.trim()   || null
  const exchCode = searchParams.get('exchCode')?.trim() || null

  if (!isin && !ticker) {
    return err('?isin= or ?ticker= required')
  }

  try {
    const apiKey = process.env.OPENFIGI_API_KEY
    const result = await resolveInstrument({ isin, ticker, exchCode }, apiKey)
    return ok(result)
  } catch (e) {
    console.error('[resolve] failed:', e)
    return err('Resolution failed', 500)
  }
})
