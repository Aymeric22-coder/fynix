/**
 * Expansion sectorielle / géographique des positions du portefeuille.
 *
 * Une position d'ETF n'est PAS une exposition unique : un MSCI World
 * de 10 000 € est en réalité ~6 900 € en USA, ~1 600 € en Europe, etc.,
 * réparti en ~10 secteurs GICS. On éclate donc chaque position en
 * micro-expositions virtuelles avant l'agrégation finale.
 *
 * Règles d'éclatement :
 *
 *   1. ETF référencé dans `ETF_COMPOSITIONS` (lib/analyse/etfCompositions.ts)
 *      → éclaté selon les % de la table
 *      → identifié = oui
 *
 *   2. ETF NON référencé (asset_type='etf')
 *      → bucket "Non mappé" / "Non mappé"
 *      → identifié = non, ajouté à `unmappedEtfs`
 *
 *   3. Action (asset_type='stock') avec sector + country valides
 *      → contribue à 100 % à son secteur réel et sa zone
 *      → identifié = oui
 *
 *   4. Action sans sector/country exploitable ('Non identifié', null)
 *      → bucket "Non mappé"
 *      → identifié = non
 *
 *   5. SCPI / immo papier (asset_type='scpi')
 *      → secteur = 'Immobilier', zone = country (mappée) ou 'Europe'
 *
 *   6. Crypto, obligataire, autres
 *      → secteur = label simple, zone = 'Autres'
 *      → identifié si on a une catégorie reconnaissable
 *
 *   7. Cash : exclu de l'expansion (jamais inclus dans sector/geo).
 *      Le caller filtre en amont.
 */

import { translateSector } from './sectorMapping'
import { geoZone } from './geoMapping'
import { getEtfComposition } from './etfCompositions'
import type { EnrichedPosition, BienImmo } from '@/types/analyse'

/** Une exposition unitaire après expansion : un secteur + une valeur €. */
export interface SectorExposure {
  secteur: string
  value:   number
  /** Nom de la position-source (ex: "iShares MSCI World"). */
  source:  string
}

/** Idem pour la géographie. */
export interface GeoExposure {
  zone:   string
  value:  number
  source: string
  /** Pays brut (avant mappage en zone) — utile pour le tooltip. */
  pays:   string | null
}

export interface ExpansionResult {
  sectorExposures: SectorExposure[]
  geoExposures:    GeoExposure[]
  /** Valeur totale passée en revue. */
  totalValue:      number
  /** Valeur identifiée précisément (ETF mappé OU action avec sector/country). */
  identifiedValue: number
  /** ISIN d'ETF non présents dans ETF_COMPOSITIONS. */
  unmappedEtfs:    Array<{ isin: string; name: string; value: number }>
}

const SECTOR_FALLBACK_LABELS = new Set([
  'Sans secteur', 'Non classé', 'Autres', 'ETF Diversifié', 'Non identifié', 'Non mappé', '—',
])

/** Détecte si la valeur de secteur/pays brute est exploitable. */
function isMeaningfulSector(s: string | null | undefined): boolean {
  if (!s) return false
  return !SECTOR_FALLBACK_LABELS.has(s)
}
function isMeaningfulCountry(c: string | null | undefined): boolean {
  if (!c) return false
  return c !== 'International' && c !== 'Non identifié' && c !== 'Autres'
}

/**
 * Éclate une liste de positions du PORTEFEUILLE FINANCIER UNIQUEMENT en
 * micro-expositions sectorielles et géographiques.
 *
 * Cash et immobilier physique sont volontairement EXCLUS — ce sont des
 * classes d'actif distinctes qui ont leur propre section dans l'app
 * (vues /cash et /immobilier). Les inclure ici fausserait totalement
 * l'analyse sectorielle (un patrimoine 80 % immo afficherait "Immobilier
 * 80 %" et écraserait toute lecture des secteurs financiers).
 *
 * Le paramètre `biens` est conservé dans la signature pour rétro-compat
 * avec d'anciens tests, mais ignoré dans le calcul actuel.
 */
export function expandPositions(
  positions: ReadonlyArray<EnrichedPosition>,
  _biens:    ReadonlyArray<BienImmo> = [],
): ExpansionResult {
  const sectorExposures: SectorExposure[] = []
  const geoExposures:    GeoExposure[]    = []
  const unmappedEtfs: Array<{ isin: string; name: string; value: number }> = []
  let totalValue      = 0
  let identifiedValue = 0

  for (const pos of positions) {
    const v = pos.current_value
    if (v <= 0) continue
    totalValue += v

    // ── Cas 1 : ETF référencé → expansion par % ────────────────────
    const compo = pos.isin ? getEtfComposition(pos.isin) : null
    if (compo) {
      identifiedValue += v
      const sumS = Object.values(compo.sectors).reduce((s, p) => s + p, 0) || 100
      const sumZ = Object.values(compo.zones).reduce((s, p) => s + p, 0) || 100
      for (const [secteur, pct] of Object.entries(compo.sectors)) {
        sectorExposures.push({ secteur, value: v * (pct / sumS), source: pos.name })
      }
      for (const [zone, pct] of Object.entries(compo.zones)) {
        geoExposures.push({ zone, value: v * (pct / sumZ), source: pos.name, pays: null })
      }
      continue
    }

    // ── Cas 2 : ETF NON référencé → bucket Non mappé ──────────────
    if (pos.asset_type === 'etf') {
      unmappedEtfs.push({ isin: pos.isin, name: pos.name, value: v })
      sectorExposures.push({ secteur: 'Non mappé', value: v, source: pos.name })
      geoExposures.push({ zone: 'Non mappé', value: v, source: pos.name, pays: null })
      continue
    }

    // ── Cas 5 : SCPI / immo papier ────────────────────────────────
    if (pos.asset_type === 'scpi') {
      identifiedValue += v
      sectorExposures.push({ secteur: 'Immobilier', value: v, source: pos.name })
      const z = pos.country ? (geoZone(pos.country) as string) : 'Europe'
      geoExposures.push({ zone: z, value: v, source: pos.name, pays: pos.country })
      continue
    }

    // ── Cas 3/4 : action avec / sans données exploitables ─────────
    if (pos.asset_type === 'stock') {
      const secteurRaw = isMeaningfulSector(pos.sector) ? pos.sector : null
      const paysRaw    = isMeaningfulCountry(pos.country) ? pos.country : null
      if (secteurRaw && paysRaw) {
        identifiedValue += v
        sectorExposures.push({
          secteur: translateSector(secteurRaw) ?? secteurRaw,
          value: v, source: pos.name,
        })
        geoExposures.push({ zone: geoZone(paysRaw) as string, value: v, source: pos.name, pays: paysRaw })
      } else {
        sectorExposures.push({ secteur: 'Non mappé', value: v, source: pos.name })
        geoExposures.push({ zone: 'Non mappé', value: v, source: pos.name, pays: null })
      }
      continue
    }

    // ── Cas 6 : crypto / obligataire / unknown ────────────────────
    if (pos.asset_type === 'crypto') {
      identifiedValue += v
      sectorExposures.push({ secteur: 'Crypto', value: v, source: pos.name })
      geoExposures.push({ zone: 'Autres', value: v, source: pos.name, pays: null })
      continue
    }
    if (pos.asset_type === 'bond') {
      identifiedValue += v
      sectorExposures.push({ secteur: 'Obligations souveraines', value: v, source: pos.name })
      geoExposures.push({ zone: 'Europe', value: v, source: pos.name, pays: pos.country })
      continue
    }

    // Catch-all : non identifié
    sectorExposures.push({ secteur: 'Non mappé', value: v, source: pos.name })
    geoExposures.push({ zone: 'Non mappé', value: v, source: pos.name, pays: null })
  }

  // L'immobilier physique (paramètre `_biens`) est volontairement IGNORÉ
  // ici : c'est une classe d'actif distincte avec sa propre vue.

  return { sectorExposures, geoExposures, totalValue, identifiedValue, unmappedEtfs }
}

/**
 * Reduce les expositions sectorielles en buckets agrégés triés
 * (valeur décroissante), avec liste des sources contributrices et
 * pourcentage du total. Filtre optionnel des "Non mappé" (utile pour
 * exclure des graphiques principaux).
 */
export function bucketsBySector(
  exposures: SectorExposure[],
  totalValue: number,
  options: { excludeUnmapped?: boolean } = {},
): Array<{ secteur: string; value: number; pct: number; sources: string[] }> {
  const map = new Map<string, { value: number; sources: Set<string> }>()
  for (const e of exposures) {
    if (options.excludeUnmapped && e.secteur === 'Non mappé') continue
    const cur = map.get(e.secteur) ?? { value: 0, sources: new Set<string>() }
    cur.value += e.value
    cur.sources.add(e.source)
    map.set(e.secteur, cur)
  }
  return Array.from(map.entries())
    .map(([secteur, { value, sources }]) => ({
      secteur, value,
      pct:     totalValue > 0 ? (value / totalValue) * 100 : 0,
      sources: Array.from(sources).slice(0, 10),
    }))
    .sort((a, b) => b.value - a.value)
}

/** Idem pour les zones géographiques. */
export function bucketsByZone(
  exposures: GeoExposure[],
  totalValue: number,
  options: { excludeUnmapped?: boolean } = {},
): Array<{ zone: string; value: number; pct: number; pays: string[]; sources: string[] }> {
  const map = new Map<string, { value: number; pays: Set<string>; sources: Set<string> }>()
  for (const e of exposures) {
    if (options.excludeUnmapped && e.zone === 'Non mappé') continue
    const cur = map.get(e.zone) ?? { value: 0, pays: new Set<string>(), sources: new Set<string>() }
    cur.value += e.value
    if (e.pays) cur.pays.add(e.pays)
    cur.sources.add(e.source)
    map.set(e.zone, cur)
  }
  return Array.from(map.entries())
    .map(([zone, { value, pays, sources }]) => ({
      zone, value,
      pct:     totalValue > 0 ? (value / totalValue) * 100 : 0,
      pays:    Array.from(pays),
      sources: Array.from(sources).slice(0, 10),
    }))
    .sort((a, b) => b.value - a.value)
}
