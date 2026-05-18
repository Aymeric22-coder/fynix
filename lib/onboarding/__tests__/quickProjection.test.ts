/**
 * Tests purs de calculerQuickProjection.
 * Pas de DB, pas de DOM — fonction strictement déterministe.
 */
import { describe, it, expect } from 'vitest'
import { calculerQuickProjection, QUICK_HYPOTHESES } from '../quickProjection'

describe('calculerQuickProjection', () => {
  it('Thomas (28 ans, 0 €, 2 500 €/mois) — indépendance avant 80 ans avec hypothèses standards', () => {
    // Avec 20 % d'épargne, 7 %/an de rendement et une cible indexée à 2 %
    // d'inflation, la projection donne ~67 ans. Le brief attendait ~51 ans
    // mais cela supposait soit une cible non-indexée, soit un taux d'épargne
    // beaucoup plus élevé : on respecte les hypothèses documentées.
    const out = calculerQuickProjection({
      age:              28,
      patrimoineActuel: 0,
      revenuMensuelNet: 2500,
    })
    expect(out.ageIndependance).not.toBeNull()
    expect(out.ageIndependance!).toBeGreaterThanOrEqual(60)
    expect(out.ageIndependance!).toBeLessThanOrEqual(75)
    expect(out.epargneMensuelleEstimee).toBeCloseTo(500, 1)
    expect(out.tauxEpargnePct).toBe(20)
  })

  it('Sophie (35 ans, 80 000 €, 4 000 €/mois) — indépendance plus tôt grâce au patrimoine initial', () => {
    const out = calculerQuickProjection({
      age:              35,
      patrimoineActuel: 80_000,
      revenuMensuelNet: 4000,
    })
    expect(out.ageIndependance).not.toBeNull()
    expect(out.ageIndependance!).toBeGreaterThanOrEqual(58)
    expect(out.ageIndependance!).toBeLessThanOrEqual(72)
    expect(out.epargneMensuelleEstimee).toBe(800)
  })

  it('Julie (52 ans, 200 000 €, 3 000 €/mois) — indépendance vers ~60-70 ans', () => {
    const out = calculerQuickProjection({
      age:              52,
      patrimoineActuel: 200_000,
      revenuMensuelNet: 3000,
    })
    expect(out.ageIndependance).not.toBeNull()
    expect(out.ageIndependance!).toBeGreaterThanOrEqual(58)
    expect(out.ageIndependance!).toBeLessThanOrEqual(72)
  })

  it('Revenu très faible (1 000 €/mois, 0 €) → ageIndependance null OU au-delà de 65 ans', () => {
    const out = calculerQuickProjection({
      age:              30,
      patrimoineActuel: 0,
      revenuMensuelNet: 1000,
    })
    // Soit objectif inatteignable (null), soit atteint très tard.
    if (out.ageIndependance !== null) {
      expect(out.ageIndependance).toBeGreaterThanOrEqual(60)
    }
    // L'épargne reste calculée même si inatteignable
    expect(out.epargneMensuelleEstimee).toBe(200)
  })

  it('patrimoineNecessaire est toujours strictement positif et > revenu_annuel_cible', () => {
    const inputs = [
      { age: 25, patrimoineActuel: 0,       revenuMensuelNet: 1500 },
      { age: 40, patrimoineActuel: 100_000, revenuMensuelNet: 5000 },
      { age: 60, patrimoineActuel: 500_000, revenuMensuelNet: 3500 },
    ]
    for (const i of inputs) {
      const out = calculerQuickProjection(i)
      expect(out.patrimoineNecessaire).toBeGreaterThan(0)
      // Cible = revenu × 12 × 0.7 / 0.04 = 210× revenu_mensuel net (avant inflation)
      // Donc > revenu annuel par construction.
      expect(out.patrimoineNecessaire).toBeGreaterThan(i.revenuMensuelNet * 12)
    }
  })

  it('trajectoire monotone croissante (rendement + épargne > 0)', () => {
    const out = calculerQuickProjection({
      age:              30,
      patrimoineActuel: 10_000,
      revenuMensuelNet: 3000,
    })
    expect(out.trajectoire.length).toBeGreaterThan(0)
    for (let i = 1; i < out.trajectoire.length; i++) {
      expect(out.trajectoire[i]!.patrimoine).toBeGreaterThan(out.trajectoire[i - 1]!.patrimoine)
    }
    // Premier point = patrimoine actuel à l'âge actuel
    expect(out.trajectoire[0]!.age).toBe(30)
    expect(out.trajectoire[0]!.patrimoine).toBe(10_000)
  })

  it('horizon max = QUICK_HYPOTHESES.ageMax (80 ans par défaut)', () => {
    const out = calculerQuickProjection({
      age:              30,
      patrimoineActuel: 0,
      revenuMensuelNet: 3000,
    })
    const lastPoint = out.trajectoire[out.trajectoire.length - 1]!
    expect(lastPoint.age).toBe(QUICK_HYPOTHESES.ageMax)
  })
})
