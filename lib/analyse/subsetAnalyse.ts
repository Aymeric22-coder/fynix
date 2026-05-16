/**
 * Helper pour ré-exécuter l'analyse sectorielle/géo sur un SUBSET de
 * positions (ex: uniquement les actions, uniquement les ETF...).
 *
 * Évite la duplication entre PortefeuilleAnalyse > BourseAnalyse,
 * > ETFAnalyse, etc., qui ont tous besoin du même pipeline
 * expansion + bucketsBySector + classifyDeviation.
 */

import { expandPositions, bucketsBySector, bucketsByZone } from './expandETF'
import { classifyDeviation, benchmarkSectorOf, benchmarkGeoOf, trackingErrorScore, BENCHMARK_SECTOR_MSCI_WORLD, BENCHMARK_GEO_MSCI_ACWI } from './benchmarks'
import type { EnrichedPosition, SecteurAlloc, GeoAlloc, AnalyseFiabilite } from '@/types/analyse'

export interface SubsetAnalyseResult {
  secteur:          SecteurAlloc[]
  geo:              GeoAlloc[]
  fiabilite:        AnalyseFiabilite
  scoreSectoriel:   number
  scoreGeo:         number
  totalValue:       number
  /** Valeur identifiée (avec data exploitable). */
  identifiedValue:  number
  /** Positions du subset (entrée pour faciliter le passage aux sous-composants). */
  positions:        EnrichedPosition[]
}

/**
 * Calcule sectorielle + géo + fiabilité sur un sous-ensemble de positions.
 * Renvoie également les scores tracking error MSCI.
 */
export function analyseSubset(positions: EnrichedPosition[]): SubsetAnalyseResult {
  const exp = expandPositions(positions)
  const secB = bucketsBySector(exp.sectorExposures, exp.totalValue, { excludeUnmapped: true })
  const geoB = bucketsByZone(exp.geoExposures, exp.totalValue, { excludeUnmapped: true })

  const secteur: SecteurAlloc[] = secB.map((b) => {
    const benchmark = benchmarkSectorOf(b.secteur)
    const { deviation, status } = classifyDeviation(b.pct, benchmark, 'sector')
    return {
      secteur:     b.secteur,
      valeur:      b.value,
      pourcentage: b.pct,
      benchmark, deviation, status,
      positions:   b.sources,
      alerte:      status === 'overweight' || status === 'overweight_strong',
    }
  })

  const geo: GeoAlloc[] = geoB.map((b) => {
    const benchmark = benchmarkGeoOf(b.zone)
    const { deviation, status } = classifyDeviation(b.pct, benchmark, 'geo')
    return {
      zone:        b.zone,
      valeur:      b.value,
      pourcentage: b.pct,
      benchmark, deviation, status,
      pays:        b.pays,
      alerte:      status === 'overweight' || status === 'overweight_strong',
    }
  })

  const pct = exp.totalValue > 0 ? Math.round((exp.identifiedValue / exp.totalValue) * 100) : 0
  const fiabilite: AnalyseFiabilite =
    pct >= 90 ? { pct, niveau: 'vert',   label: 'Analyse fiable' } :
    pct >= 70 ? { pct, niveau: 'orange', label: 'Analyse partiellement fiable' } :
                { pct, niveau: 'rouge',  label: 'Données insuffisantes' }

  return {
    secteur, geo, fiabilite,
    scoreSectoriel: trackingErrorScore(
      secteur.map((s) => ({ label: s.secteur, pct: s.pourcentage })),
      BENCHMARK_SECTOR_MSCI_WORLD,
    ),
    scoreGeo: trackingErrorScore(
      geo.map((g) => ({ label: g.zone, pct: g.pourcentage })),
      BENCHMARK_GEO_MSCI_ACWI,
    ),
    totalValue:      exp.totalValue,
    identifiedValue: exp.identifiedValue,
    positions,
  }
}

/**
 * Calcule la concentration par titre (1 position > N % de l'ensemble).
 * Renvoie : top position, sa part, score concentration.
 */
export function calculerConcentration(positions: EnrichedPosition[]): {
  topName: string | null
  topPct:  number
  score:   number    // 0-100, plus haut = mieux diversifié
} {
  if (positions.length === 0) return { topName: null, topPct: 0, score: 100 }
  const total = positions.reduce((s, p) => s + p.current_value, 0)
  if (total <= 0) return { topName: null, topPct: 0, score: 100 }

  let topPct = 0
  let topName: string | null = null
  for (const p of positions) {
    const pct = (p.current_value / total) * 100
    if (pct > topPct) { topPct = pct; topName = p.name }
  }
  // Indice Herfindahl-Hirschman (HHI) normalisé : 100 = parfaitement réparti
  const hhi = positions.reduce((s, p) => {
    const pct = (p.current_value / total) * 100
    return s + pct * pct
  }, 0)
  const score = Math.max(0, Math.min(100, Math.round(100 - hhi / 100)))
  return { topName, topPct, score }
}
