/**
 * Agrégations pures sur EnrichedPosition[] — secteur, géographie, type
 * d'actif, devise. Aucun appel réseau / DB ici.
 *
 * Exposé sous forme de buckets ordonnés par valeur décroissante, avec
 * libellé déjà localisé en FR (via sectorMapping / geoMapping).
 */

import { translateSector } from './sectorMapping'
import { geoZone, type GeoZone } from './geoMapping'
import type { EnrichedPosition, AnalyseAssetType } from '@/types/analyse'

export interface AllocationBucket {
  /** Clé technique (libellé brut). Stable, sert d'ID. */
  key:    string
  /** Libellé localisé prêt pour l'UI. */
  label:  string
  /** Valeur de marché agrégée (€). */
  value:  number
  /** % du portefeuille total (0-100). */
  pct:    number
  /** Nombre de positions dans ce bucket. */
  count:  number
}

const SECTOR_UNKNOWN_LABEL = 'Sans secteur'
const GEO_UNKNOWN_LABEL    = 'Non classé'

/**
 * Agrège par secteur (libellés Yahoo traduits en FR).
 * Les positions sans secteur sont regroupées dans "Sans secteur".
 */
export function aggregateBySector(positions: EnrichedPosition[]): AllocationBucket[] {
  const map = new Map<string, AllocationBucket>()
  let total = 0
  for (const p of positions) total += p.current_value

  for (const p of positions) {
    const raw   = p.sector
    const label = translateSector(raw) ?? SECTOR_UNKNOWN_LABEL
    const key   = raw ?? '__unknown__'
    const cur   = map.get(key)
    if (cur) {
      cur.value += p.current_value
      cur.count += 1
    } else {
      map.set(key, { key, label, value: p.current_value, pct: 0, count: 1 })
    }
  }

  return finalize(map, total)
}

/**
 * Agrège par zone géographique (6 zones : Am. du Nord, Europe, Asie dev/em,
 * Am. latine, Autres). Les positions sans pays vont dans "Non classé".
 */
export function aggregateByGeo(positions: EnrichedPosition[]): AllocationBucket[] {
  const map = new Map<string, AllocationBucket>()
  let total = 0
  for (const p of positions) total += p.current_value

  for (const p of positions) {
    let label: string
    if (!p.country) {
      label = GEO_UNKNOWN_LABEL
    } else {
      label = geoZone(p.country) as GeoZone
    }
    const cur = map.get(label)
    if (cur) {
      cur.value += p.current_value
      cur.count += 1
    } else {
      map.set(label, { key: label, label, value: p.current_value, pct: 0, count: 1 })
    }
  }

  return finalize(map, total)
}

const ASSET_LABEL: Record<AnalyseAssetType, string> = {
  stock:   'Actions',
  etf:     'ETF / Fonds',
  crypto:  'Crypto',
  bond:    'Obligataire',
  scpi:    'Immobilier papier',
  metal:   'Métaux précieux',
  unknown: 'Non classé',
}

/** Agrège par type d'actif (stock/etf/crypto/bond/scpi/unknown). */
export function aggregateByAssetType(positions: EnrichedPosition[]): AllocationBucket[] {
  const map = new Map<string, AllocationBucket>()
  let total = 0
  for (const p of positions) total += p.current_value

  for (const p of positions) {
    const key = p.asset_type
    const cur = map.get(key)
    if (cur) {
      cur.value += p.current_value
      cur.count += 1
    } else {
      map.set(key, { key, label: ASSET_LABEL[p.asset_type], value: p.current_value, pct: 0, count: 1 })
    }
  }

  return finalize(map, total)
}

/** Agrège par devise (EUR, USD, etc.). */
export function aggregateByCurrency(positions: EnrichedPosition[]): AllocationBucket[] {
  const map = new Map<string, AllocationBucket>()
  let total = 0
  for (const p of positions) total += p.current_value

  for (const p of positions) {
    const key = (p.currency || 'EUR').toUpperCase()
    const cur = map.get(key)
    if (cur) {
      cur.value += p.current_value
      cur.count += 1
    } else {
      map.set(key, { key, label: key, value: p.current_value, pct: 0, count: 1 })
    }
  }

  return finalize(map, total)
}

function finalize(map: Map<string, AllocationBucket>, total: number): AllocationBucket[] {
  const arr = Array.from(map.values())
  for (const b of arr) {
    b.pct = total > 0 ? (b.value / total) * 100 : 0
  }
  return arr.sort((a, b) => b.value - a.value)
}

/**
 * Top N positions par valeur de marché (descendant). Utile pour la vue
 * "Concentration" qui montre les positions les plus pondérées.
 */
export function topPositions(positions: EnrichedPosition[], n: number = 10): EnrichedPosition[] {
  return positions.slice().sort((a, b) => b.current_value - a.current_value).slice(0, n)
}
