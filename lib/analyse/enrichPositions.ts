/**
 * Combine les positions du portefeuille (DB) avec les métadonnées
 * d'enrichissement ISIN (cache + Yahoo/OpenFIGI) pour produire des
 * `EnrichedPosition[]` prêts à l'agrégation sectorielle/géographique.
 *
 * Source des valeurs courantes :
 *   - quantity, average_price, currency → table positions (utilisateur)
 *   - current_price                     → soit isin_cache.current_price
 *                                         (frais ≤ 24h), soit dernière
 *                                         ligne instrument_prices
 *                                         (fallback robuste pour les
 *                                         positions sans ISIN ou les
 *                                         classes que Yahoo ne couvre pas)
 *
 * Pour les positions SANS ISIN (ex: SCPI custom, private equity), on
 * enrichit avec `asset_type='unknown'` et secteur/pays null — la vue
 * d'analyse les regroupera sous "Sans secteur" / "Non classé".
 */

import { createServerClient } from '@/lib/supabase/server'
import { toEur } from '@/lib/providers/fx'
import { enrichMultipleISIN } from './isinBatch'
import type { EnrichedPosition, AnalyseAssetType, ISINData } from '@/types/analyse'
import type { CurrencyCode } from '@/types/database.types'

interface PositionRow {
  id:               string
  quantity:         number | string | null
  average_price:    number | string | null
  currency:         string | null
  instrument:       {
    id:    string
    name:  string | null
    isin:  string | null
    ticker: string | null
    asset_class: string | null
    currency: string | null
  } | Array<{
    id: string; name: string | null; isin: string | null; ticker: string | null
    asset_class: string | null; currency: string | null
  }> | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return isFinite(n) ? n : 0
}

/**
 * Récupère pour une liste d'instrument_id le DERNIER prix connu de
 * `instrument_prices`. Une seule requête (groupe par instrument_id côté
 * code car PostgREST n'a pas de DISTINCT ON natif simple).
 */
async function fetchLatestPrices(instrumentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (instrumentIds.length === 0) return out

  const supabase = await createServerClient()
  const { data } = await supabase
    .from('instrument_prices')
    .select('instrument_id, price, priced_at')
    .in('instrument_id', instrumentIds)
    .order('priced_at', { ascending: false })

  if (!data) return out
  for (const row of data as Array<{ instrument_id: string; price: number | string }>) {
    if (!out.has(row.instrument_id)) {
      out.set(row.instrument_id, num(row.price))
    }
  }
  return out
}

/**
 * Map asset_class (taxonomie portefeuille interne) → AnalyseAssetType.
 * Utile quand on n'a pas d'ISIN et qu'on doit quand même typer l'actif.
 */
function assetClassToAnalyseType(ac: string | null | undefined): AnalyseAssetType {
  switch (ac) {
    case 'equity':      return 'stock'
    case 'etf':         return 'etf'
    case 'fund':        return 'etf'    // fonds traditionnel = même traitement qu'un ETF
    case 'crypto':
    case 'defi':        return 'crypto'
    case 'bond':
    case 'private_debt': return 'bond'
    case 'metal':       return 'metal'  // or / argent / métaux précieux physiques
    case 'scpi':
    case 'opci':
    case 'siic':
    case 'reit':        return 'scpi'   // immobilier papier → assimilé scpi pour l'agrégat
    default:            return 'unknown'
  }
}

/**
 * Enrichit toutes les positions ACTIVES de l'utilisateur authentifié.
 * À exécuter côté serveur uniquement.
 *
 * @returns liste des positions enrichies + total de la valeur de marché
 *   (utile pour calculer les pondérations).
 */
export async function getEnrichedPositions(userId: string): Promise<{
  positions: EnrichedPosition[]
  totalValue: number
}> {
  const supabase = await createServerClient()

  // 1. Charge les positions + instruments en une requête (jointure relationnelle)
  const { data: rows, error } = await supabase
    .from('positions')
    .select(`
      id, quantity, average_price, currency,
      instrument:instruments!instrument_id (
        id, name, isin, ticker, asset_class, currency
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error || !rows) {
    console.warn('[enrichPositions] échec chargement positions:', error?.message)
    return { positions: [], totalValue: 0 }
  }

  // 2. Normalise et extrait les ISIN + instrument_ids
  const positions = (rows as PositionRow[]).map((r) => {
    const inst = Array.isArray(r.instrument) ? r.instrument[0] : r.instrument
    return {
      positionId:   r.id,
      quantity:     num(r.quantity),
      pru:          num(r.average_price),
      currency:     (r.currency ?? inst?.currency ?? 'EUR') as string,
      instrumentId: inst?.id ?? null,
      isin:         inst?.isin ?? null,
      name:         inst?.name ?? '—',
      assetClass:   inst?.asset_class ?? null,
    }
  })

  const isins        = Array.from(new Set(positions.map((p) => p.isin).filter((x): x is string => !!x)))
  const instrumentIds = Array.from(new Set(positions.map((p) => p.instrumentId).filter((x): x is string => !!x)))

  // 3. Enrichit en parallèle : ISIN cache + dernier prix DB
  const [isinMap, lastPrices] = await Promise.all([
    enrichMultipleISIN(isins),
    fetchLatestPrices(instrumentIds),
  ])

  // 4. Construit les EnrichedPosition + convertit en EUR via FX si besoin
  let totalValue = 0
  const enriched: EnrichedPosition[] = await Promise.all(positions.map(async (p) => {
    const isinData = p.isin ? isinMap.get(p.isin) : null
    // Priorité prix :
    //  1) isin_cache.current_price (Yahoo)
    //  2) dernier prix DB (sources internes)
    //  3) PRU (fallback marqué price_estimated=true)
    const yahooPrice = isinData?.current_price ?? null
    const dbPrice    = p.instrumentId ? lastPrices.get(p.instrumentId) ?? null : null
    const cur        = yahooPrice ?? dbPrice ?? p.pru
    const estimated  = yahooPrice === null && dbPrice === null

    const currentValueLocal = p.quantity * cur
    const fromCcy = (isinData?.currency ?? p.currency).toUpperCase() as CurrencyCode
    const currentValueEur = await toEur(currentValueLocal, fromCcy).catch(() => currentValueLocal)
    totalValue += currentValueEur

    return makeEnriched(p, isinData, cur, currentValueEur, currentValueLocal, estimated)
  }))

  // 5. Calcule les pondérations (% du portefeuille)
  for (const ep of enriched) {
    ep.weight_in_portfolio = totalValue > 0 ? (ep.current_value / totalValue) * 100 : 0
  }

  return { positions: enriched, totalValue }
}

function makeEnriched(
  p: { quantity: number; pru: number; currency: string; isin: string | null; name: string; assetClass: string | null },
  isinData: ISINData | null | undefined,
  currentPrice: number,
  currentValueEur: number,
  currentValueLocal: number,
  estimated: boolean,
): EnrichedPosition {
  // Détermination de l'asset_type : priorité à isin_cache MAIS uniquement
  // si la valeur est utile (≠ 'unknown'). Sinon on retombe sur l'asset_class
  // déclarée par l'utilisateur (DB) — sans ça une SCPI manuelle ou un
  // certificat structuré dont Yahoo n'a pas reconnu le ticker reste bloqué
  // en 'unknown' alors que la DB sait que c'est une SCPI.
  const cachedType = isinData?.asset_type
  const finalAssetType: AnalyseAssetType =
    cachedType && cachedType !== 'unknown'
      ? cachedType
      : assetClassToAnalyseType(p.assetClass)
  // Le PRU est dans la devise locale, pareil que current_price.
  // P&L est calculé EN EUR : on convertit linéairement avec le même ratio
  // (currentValueEur / currentValueLocal) — approximation acceptable pour
  // l'affichage. Pour un vrai calcul P&L FX-aware, il faudrait stocker la
  // devise de l'achat ET le taux historique, ce qu'on ne fait pas ici.
  const fxRatio  = currentValueLocal > 0 ? currentValueEur / currentValueLocal : 1
  const costEur  = p.quantity * p.pru * fxRatio
  const gainLoss = currentValueEur - costEur
  const gainLossPct = costEur > 0 ? (gainLoss / costEur) * 100 : 0

  return {
    isin:          p.isin ?? '',
    name:          isinData?.name ?? p.name,
    quantity:      p.quantity,
    pru:           p.pru,
    current_price: currentPrice,
    current_value: currentValueEur,
    current_value_local: currentValueLocal,
    gain_loss:     gainLoss,
    gain_loss_pct: gainLossPct,
    asset_type:    finalAssetType,
    sector:        isinData?.sector ?? null,
    country:       isinData?.country ?? null,
    currency:      isinData?.currency ?? p.currency,
    price_estimated: estimated,
    weight_in_portfolio: 0,  // rempli après en post-pass (besoin du total)
  }
}
