import { describe, it, expect } from 'vitest'
import {
  benchmarkGeoOf, benchmarkSectorOf, classifyDeviation, trackingErrorScore,
  BENCHMARK_GEO_MSCI_ACWI, BENCHMARK_SECTOR_MSCI_WORLD,
} from '../benchmarks'

describe('classifyDeviation — géo (seuils 15/30/-20)', () => {
  it('aligné : déviation ±10pts → aligned', () => {
    expect(classifyDeviation(70, 65, 'geo').status).toBe('aligned')
    expect(classifyDeviation(60, 65, 'geo').status).toBe('aligned')
  })

  it('surpondéré modéré : +20pts → overweight', () => {
    const r = classifyDeviation(35, 15, 'geo')
    expect(r.deviation).toBe(20)
    expect(r.status).toBe('overweight')
  })

  it('surpondéré fort : +35pts → overweight_strong', () => {
    const r = classifyDeviation(50, 15, 'geo')
    expect(r.status).toBe('overweight_strong')
  })

  it('sous-pondéré : −25pts → underweight', () => {
    const r = classifyDeviation(40, 65, 'geo')
    expect(r.deviation).toBe(-25)
    expect(r.status).toBe('underweight')
  })
})

describe('benchmark lookups', () => {
  it('zone connue retourne sa pondération', () => {
    expect(benchmarkGeoOf('Amérique du Nord')).toBe(65)
    expect(benchmarkGeoOf('Europe')).toBe(15)
  })

  it('zone inconnue retourne 0', () => {
    expect(benchmarkGeoOf('Atlantis')).toBe(0)
  })

  it('secteur connu retourne sa pondération', () => {
    expect(benchmarkSectorOf('Technologie')).toBe(23)
    expect(benchmarkSectorOf('Finance')).toBe(15)
  })
})

describe('trackingErrorScore', () => {
  it('portefeuille parfaitement aligné → score 100', () => {
    const buckets = Object.entries(BENCHMARK_GEO_MSCI_ACWI)
      .map(([label, pct]) => ({ label, pct }))
    expect(trackingErrorScore(buckets, BENCHMARK_GEO_MSCI_ACWI)).toBe(100)
  })

  it('portefeuille concentré 100 % USA vs benchmark 65 % → score bas', () => {
    const buckets = [{ label: 'Amérique du Nord', pct: 100 }]
    const s = trackingErrorScore(buckets, BENCHMARK_GEO_MSCI_ACWI)
    // |100−65|=35 + somme des autres benchmarks absents (35 au total)
    // = 70 → /2 = 35 → score = 65
    expect(s).toBe(65)
  })

  it('portefeuille proche du benchmark (légères surpondérations Europe + Asie ém) → score haut', () => {
    // Cas user actuel : Am. du Nord 55, Europe 24, Asie ém 10, Asie dev 7,
    // Moyen-Orient 2, Am. latine 1, Europe ém 0.5, Afrique 0.4, Autres 0.5
    const buckets = [
      { label: 'Amérique du Nord', pct: 55.3 },
      { label: 'Europe',           pct: 24.2 },
      { label: 'Asie émergente',   pct: 9.9  },
      { label: 'Asie développée',  pct: 6.6  },
      { label: 'Moyen-Orient',     pct: 1.6  },
      { label: 'Amérique latine',  pct: 1.0  },
      { label: 'Europe émergente', pct: 0.5  },
      { label: 'Autres',           pct: 0.5  },
      { label: 'Afrique',          pct: 0.4  },
    ]
    const s = trackingErrorScore(buckets, BENCHMARK_GEO_MSCI_ACWI)
    expect(s).toBeGreaterThanOrEqual(75)
  })
})

describe('cohérence des benchmarks (somme ≈ 100)', () => {
  it('MSCI ACWI géo somme ~ 100 %', () => {
    const total = Object.values(BENCHMARK_GEO_MSCI_ACWI).reduce((s, v) => s + v, 0)
    expect(total).toBeGreaterThanOrEqual(99)
    expect(total).toBeLessThanOrEqual(101)
  })

  it('MSCI World sectoriel somme ~ 100 %', () => {
    const total = Object.values(BENCHMARK_SECTOR_MSCI_WORLD).reduce((s, v) => s + v, 0)
    expect(total).toBeGreaterThanOrEqual(99)
    expect(total).toBeLessThanOrEqual(101)
  })
})
