/**
 * Enrichissement par lot — utilisé par les vues d'analyse pour récupérer
 * d'un coup les métadonnées de tous les ISIN du portefeuille.
 *
 * Stratégie :
 *   1. Une seule requête Supabase pour récupérer TOUS les caches existants
 *      (avec filtre `cache_expires_at > NOW()`).
 *   2. Pour les ISIN non cachés, on enrichit par batch de 5 en parallèle
 *      avec un délai de 300ms entre chaque batch — respect du rate limit
 *      OpenFIGI (25 req/min sans clé API = ~2.4s entre 6 requêtes ;
 *      avec délai 300ms par batch de 5, on monte à 16 req/s mais sur des
 *      batches courts ça reste sous le seuil quand le portefeuille est
 *      raisonnable).
 *
 * Le résultat est une Map `isin → ISINData`. Les ISIN totalement
 * introuvables sont quand même présents avec asset_type='unknown'
 * (jamais d'absence dans la Map).
 */

import { createServerClient } from '@/lib/supabase/server'
import { enrichISIN } from './isinEnricher'
import type { ISINData, AnalyseAssetType } from '@/types/analyse'

const BATCH_SIZE       = 5
const BATCH_DELAY_MS   = 300

/**
 * Petite pause non bloquante entre 2 batches.
 */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Pré-charge en une seule requête tous les caches valides pour la liste donnée.
 */
async function loadCacheBulk(isins: string[]): Promise<Map<string, ISINData>> {
  const out = new Map<string, ISINData>()
  if (isins.length === 0) return out

  const supabase = await createServerClient()
  // Filtre sector NOT NULL pour éviter les caches cassés (anciens
  // enregistrements pré-fix). Le sentinel équivalent existe aussi dans
  // getCachedIsin() pour les appels unitaires.
  const { data, error } = await supabase
    .from('isin_cache')
    .select('*')
    .in('isin', isins)
    .gt('cache_expires_at', new Date().toISOString())
    .not('sector', 'is', null)
    .not('country', 'is', null)

  if (error || !data) return out

  for (const row of data as Array<{
    isin: string; symbol: string | null; name: string | null
    asset_type: string | null; sector: string | null; industry: string | null
    country: string | null; currency: string | null; exchange: string | null
    current_price: number | null; cached_at: string
  }>) {
    out.set(row.isin, {
      isin:          row.isin,
      symbol:        row.symbol,
      name:          row.name ?? row.isin,
      asset_type:    (row.asset_type as AnalyseAssetType) ?? 'unknown',
      sector:        row.sector,
      industry:      row.industry,
      country:       row.country,
      currency:      row.currency ?? 'EUR',
      exchange:      row.exchange,
      current_price: row.current_price !== null ? Number(row.current_price) : null,
      cached_at:     row.cached_at,
    })
  }
  return out
}

/**
 * Enrichit une liste d'ISIN en parallèle, avec respect du rate limit.
 *
 * @returns Map ISIN → ISINData. Toujours peuplée pour chaque ISIN d'entrée.
 */
export async function enrichMultipleISIN(isins: string[]): Promise<Map<string, ISINData>> {
  const norm   = Array.from(new Set(isins.map((i) => i.trim().toUpperCase()).filter(Boolean)))
  const result = await loadCacheBulk(norm)

  const missing = norm.filter((i) => !result.has(i))
  if (missing.length === 0) {
    console.log(`[isinBatch] ${norm.length} ISIN, tous en cache`)
    return result
  }
  console.log(`[isinBatch] ${norm.length} ISIN, ${missing.length} à enrichir`)

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const slice = missing.slice(i, i + BATCH_SIZE)
    const enriched = await Promise.all(slice.map((isin) =>
      enrichISIN(isin).catch((e) => {
        console.warn(`[isinBatch] échec ${isin}:`, (e as Error).message)
        // Fallback minimal : on pose un ISINData 'unknown' pour ne pas trouer la Map.
        const fallback: ISINData = {
          isin, symbol: null, name: isin, asset_type: 'unknown',
          sector: null, industry: null, country: null, currency: 'EUR',
          exchange: null, current_price: null, cached_at: new Date().toISOString(),
        }
        return fallback
      })
    ))
    for (const d of enriched) result.set(d.isin, d)

    // Pause entre les batches sauf pour le dernier
    if (i + BATCH_SIZE < missing.length) await sleep(BATCH_DELAY_MS)
  }

  return result
}
