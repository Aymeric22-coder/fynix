import { describe, it, expect } from 'vitest'
import {
  computeTWR, computeMWR, computeMWRDetailed, computeDrawdown, computeVolatility,
  computeSharpe, annualizeReturn, TRADING_DAYS_PER_YEAR,
  MWR_ANNUALIZATION_THRESHOLD_DAYS,
} from '../analytics'

/** Renvoie la date ISO yyyy-MM-dd décalée de `days` jours (UTC). */
function isoPlusDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── TWR ────────────────────────────────────────────────────────────────

describe('computeTWR', () => {
  it('renvoie null si la série est trop courte', () => {
    expect(computeTWR([])).toBeNull()
    expect(computeTWR([{ date: '2025-01-01', value: 100 }])).toBeNull()
  })

  it('calcule un rendement simple sans cash-flow', () => {
    // 100 → 110 = +10%
    const twr = computeTWR([
      { date: '2025-01-01', value: 100 },
      { date: '2025-12-31', value: 110 },
    ])
    expect(twr).toBeCloseTo(0.10, 6)
  })

  it('chaîne géométriquement plusieurs sous-périodes', () => {
    // +10% puis -5% : (1.10 × 0.95) - 1 = 0.045
    const twr = computeTWR([
      { date: '2025-01-01', value: 100 },
      { date: '2025-06-30', value: 110 },
      { date: '2025-12-31', value: 104.5 },
    ])
    expect(twr).toBeCloseTo(0.045, 6)
  })

  it('neutralise un apport : un dépôt ne crée pas de fausse perf', () => {
    // J0: 100 → J1: 110 (+10%) → apport 50 → J2: 165 (+5% depuis 160)
    // TWR pur = (1.10 × 1.03125) - 1 ≈ 0.134375
    const twr = computeTWR(
      [
        { date: '2025-01-01', value: 100 },
        { date: '2025-06-30', value: 110 },
        { date: '2025-12-31', value: 165 },
      ],
      [{ date: '2025-12-31', amount: 50 }],
    )
    expect(twr).toBeCloseTo(1.10 * (165 / 160) - 1, 6)
  })

  it('renvoie null si une valeur ajustée devient ≤ 0', () => {
    const twr = computeTWR(
      [
        { date: '2025-01-01', value: 100 },
        { date: '2025-06-30', value: 100 },
      ],
      [{ date: '2025-06-30', amount: -150 }],  // retrait > valeur précédente
    )
    expect(twr).toBeNull()
  })

  it('tri implicite : ordre des inputs ne change pas le résultat', () => {
    const ordered   = computeTWR([
      { date: '2025-01-01', value: 100 },
      { date: '2025-06-30', value: 110 },
      { date: '2025-12-31', value: 121 },
    ])
    const shuffled  = computeTWR([
      { date: '2025-12-31', value: 121 },
      { date: '2025-01-01', value: 100 },
      { date: '2025-06-30', value: 110 },
    ])
    expect(ordered).toBeCloseTo(shuffled!, 8)
  })
})

describe('annualizeReturn', () => {
  it('annualise correctement un rendement total', () => {
    // +21% sur 2 ans → ~10% annualisé
    expect(annualizeReturn(0.21, 730)).toBeCloseTo(Math.sqrt(1.21) - 1, 4)
  })

  it('renvoie 0 pour days ≤ 0', () => {
    expect(annualizeReturn(0.10, 0)).toBe(0)
    expect(annualizeReturn(0.10, -5)).toBe(0)
  })
})

// ─── MWR / IRR ──────────────────────────────────────────────────────────

describe('computeMWR', () => {
  it('renvoie ~0% si on récupère exactement ce qu\'on a investi', () => {
    const mwr = computeMWR([
      { date: '2025-01-01', value: 1000 },
      { date: '2025-12-31', value: 1000 },
    ])
    expect(mwr).toBeCloseTo(0, 4)
  })

  it('calcule l\'IRR sur un investissement simple en lump sum', () => {
    // 1000 → 1100 sur 1 an = 10% IRR
    const mwr = computeMWR([
      { date: '2025-01-01', value: 1000 },
      { date: '2026-01-01', value: 1100 },
    ])
    expect(mwr).toBeCloseTo(0.10, 3)
  })

  it('intègre un apport intermédiaire', () => {
    // 1000 au J0, +500 à mi-parcours, valeur finale 1700 à 1 an
    // L'IRR doit refléter la pondération temporelle
    const mwr = computeMWR(
      [
        { date: '2025-01-01', value: 1000 },
        { date: '2026-01-01', value: 1700 },
      ],
      [{ date: '2025-07-01', amount: 500 }],
    )
    // Vérifie uniquement la cohérence : doit être positif et plausible
    expect(mwr).not.toBeNull()
    expect(mwr!).toBeGreaterThan(0)
    expect(mwr!).toBeLessThan(0.20)
  })

  it('renvoie un taux négatif sur perte', () => {
    const mwr = computeMWR([
      { date: '2025-01-01', value: 1000 },
      { date: '2026-01-01', value: 800 },
    ])
    expect(mwr).toBeCloseTo(-0.20, 3)
  })

  it('renvoie null si la série est trop courte', () => {
    expect(computeMWR([])).toBeNull()
    expect(computeMWR([{ date: '2025-01-01', value: 100 }])).toBeNull()
  })
})

// ─── MWR détaillé (SPRINT 2) ────────────────────────────────────────────

describe('computeMWRDetailed', () => {
  it('seuil exporté = 180 jours', () => {
    expect(MWR_ANNUALIZATION_THRESHOLD_DAYS).toBe(180)
  })

  // Lump sum 1000 → 1050 (+5% absolu). On choisit un gain modéré pour que
  // l'IRR annualisé reste dans la plage de bissection même à 14 j (≈ +257%).
  // Frontières demandées : 14 / 60 / 179 / 180 / 365 / 730 j.
  for (const N of [14, 60, 179, 180, 365, 730]) {
    it(`fenêtre ${N} j : periodDays exact, absolute ≈ +5%, annualized recomposé`, () => {
      const r = computeMWRDetailed([
        { date: '2025-01-01', value: 1000 },
        { date: isoPlusDays('2025-01-01', N), value: 1050 },
      ])
      expect(r).not.toBeNull()
      expect(r!.periodDays).toBe(N)
      // Rendement absolu d'un lump sum = VT/V0 − 1, indépendant de N.
      expect(r!.absolute).toBeCloseTo(0.05, 4)
      // IRR annualisé analytique = 1.05^(365/N) − 1.
      expect(r!.annualized).toBeCloseTo(Math.pow(1.05, 365 / N) - 1, 3)
      // Cohérence interne : re-composer l'annualisé sur la durée redonne l'absolu.
      expect(Math.pow(1 + r!.annualized, N / 365) - 1).toBeCloseTo(r!.absolute, 6)
    })
  }

  it('sur une fenêtre longue (≥ 1 an), annualized < absolute (composé)', () => {
    const r = computeMWRDetailed([
      { date: '2025-01-01', value: 1000 },
      { date: isoPlusDays('2025-01-01', 730), value: 1210 },  // +21% sur 2 ans
    ])
    expect(r).not.toBeNull()
    expect(r!.absolute).toBeCloseTo(0.21, 3)
    expect(r!.annualized).toBeLessThan(r!.absolute)  // ~10% annualisé
    expect(r!.annualized).toBeCloseTo(Math.sqrt(1.21) - 1, 3)
  })

  it('< 2 points → null', () => {
    expect(computeMWRDetailed([])).toBeNull()
    expect(computeMWRDetailed([{ date: '2025-01-01', value: 100 }])).toBeNull()
  })

  it('computeMWR est le wrapper annualisé de computeMWRDetailed', () => {
    const values = [
      { date: '2025-01-01', value: 1000 },
      { date: '2026-01-01', value: 1100 },
    ]
    expect(computeMWR(values)).toBeCloseTo(computeMWRDetailed(values)!.annualized, 8)
  })
})

// ─── Drawdown ───────────────────────────────────────────────────────────

describe('computeDrawdown', () => {
  it('renvoie 0/0 sur une série vide', () => {
    const r = computeDrawdown([])
    expect(r.current).toBe(0)
    expect(r.max).toBe(0)
  })

  it('calcule un drawdown courant nul si on est au plus haut', () => {
    const r = computeDrawdown([
      { date: '2025-01-01', value: 100 },
      { date: '2025-06-30', value: 90 },
      { date: '2025-12-31', value: 110 },  // nouveau plus haut
    ])
    expect(r.current).toBe(0)
    expect(r.max).toBeCloseTo(-0.10, 6)  // -10% à mi-parcours
  })

  it('détecte le pic et le creux du max DD', () => {
    const r = computeDrawdown([
      { date: '2025-01-01', value: 100 },
      { date: '2025-03-01', value: 120 },  // pic
      { date: '2025-06-01', value: 90 },   // creux : -25% depuis 120
      { date: '2025-12-31', value: 110 },
    ])
    expect(r.max).toBeCloseTo(-0.25, 6)
    expect(r.peakDate).toBe('2025-03-01')
    expect(r.troughDate).toBe('2025-06-01')
    expect(r.current).toBeCloseTo(-(120 - 110) / 120, 6)
  })

  it('drawdown courant négatif si on est sous le pic', () => {
    const r = computeDrawdown([
      { date: '2025-01-01', value: 100 },
      { date: '2025-06-30', value: 150 },
      { date: '2025-12-31', value: 120 },
    ])
    expect(r.current).toBeCloseTo(-0.20, 6)
    expect(r.max).toBeCloseTo(-0.20, 6)
  })
})

// ─── Volatilité ─────────────────────────────────────────────────────────

describe('computeVolatility', () => {
  it('renvoie null si moins de 2 rendements calculables', () => {
    expect(computeVolatility([{ date: '2025-01-01', value: 100 }])).toBeNull()
    expect(computeVolatility([
      { date: '2025-01-01', value: 100 },
      { date: '2025-01-02', value: 100 },
    ])).toBeNull()  // 1 seul rendement → variance impossible (n-1 = 0)
  })

  it('renvoie 0 si tous les rendements sont identiques', () => {
    // +1% chaque jour
    const values = Array.from({ length: 10 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      value: 100 * Math.pow(1.01, i),
    }))
    const vol = computeVolatility(values)
    expect(vol).toBeCloseTo(0, 6)
  })

  it('annualise correctement (std × sqrt(252))', () => {
    // Série fabriquée avec rendements alternés ±1%
    const returns: number[] = []
    let v = 100
    const values: { date: string; value: number }[] = [{ date: '2025-01-01', value: v }]
    for (let i = 1; i <= 20; i++) {
      const r = i % 2 === 0 ? 0.01 : -0.01
      returns.push(r)
      v *= 1 + r
      values.push({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, value: v })
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance =
      returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1)
    const expected = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR)

    const got = computeVolatility(values)
    expect(got).toBeCloseTo(expected, 6)
  })
})

// ─── Sharpe ─────────────────────────────────────────────────────────────

describe('computeSharpe', () => {
  it('renvoie null sur série constante (vol = 0)', () => {
    const values = Array.from({ length: 10 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      value: 100,
    }))
    expect(computeSharpe(values)).toBeNull()
  })

  it('renvoie un Sharpe positif sur une perf > rf avec volatilité', () => {
    const values: { date: string; value: number }[] = [
      { date: '2025-01-01', value: 100 },
    ]
    let v = 100
    for (let i = 1; i <= 30; i++) {
      const r = (i % 3 === 0 ? -0.005 : 0.012)  // moyenne positive
      v *= 1 + r
      values.push({ date: `2025-01-${String(i + 1).padStart(2, '0')}`, value: v })
    }
    const sharpe = computeSharpe(values, [], 0.02)
    expect(sharpe).not.toBeNull()
    expect(sharpe!).toBeGreaterThan(0)
  })
})
