/**
 * Tests `computeJaugeMatelas` (Cash V1.1-POLISH).
 *
 * Vérifie les positions du curseur et les largeurs de segments pour les
 * cas-clés de l'audit, plus la robustesse face aux entrées limites.
 *
 * Cas Aymeric servant de référence :
 *   - charges 1 675 €, statut Indépendant + stab. instable → mult 9-12
 *   - cibleBasse = 1 675 × 9  = 15 075 €
 *   - cibleHaute = 1 675 × 12 = 20 100 €
 *   - domainMax  = 20 100 × 1,5 = 30 150 €
 *   - largeurs   = 50 % rouge / 16,67 % vert / 33,33 % orange
 *   - totalCash 18 578 € → curseur à ~61,6 %
 */
import { describe, it, expect } from 'vitest'
import { computeJaugeMatelas } from '../jauge'

const CASE_AYMERIC = {
  cibleBasseEur: 15_075,
  cibleHauteEur: 20_100,
}

describe('computeJaugeMatelas — position du curseur (cas Aymeric)', () => {
  it('totalCash = 0 → curseur à 0 %, non-overflow', () => {
    const r = computeJaugeMatelas({ totalCashEur: 0, ...CASE_AYMERIC })
    expect(r.cursorPct).toBe(0)
    expect(r.overflow).toBe(false)
  })

  it('totalCash = cibleBasse → curseur à 50 %', () => {
    const r = computeJaugeMatelas({ totalCashEur: 15_075, ...CASE_AYMERIC })
    expect(r.cursorPct).toBe(50)
  })

  it('totalCash = cibleHaute → curseur à ≈ 66,7 %', () => {
    const r = computeJaugeMatelas({ totalCashEur: 20_100, ...CASE_AYMERIC })
    // 20100 / (20100 × 1,5) = 1/1,5 = 0,6667
    expect(r.cursorPct).toBeCloseTo(66.67, 1)
  })

  it('totalCash = cibleHaute × 1,5 → curseur à 100 %, non-overflow', () => {
    const r = computeJaugeMatelas({ totalCashEur: 30_150, ...CASE_AYMERIC })
    expect(r.cursorPct).toBe(100)
    expect(r.overflow).toBe(false)
  })

  it('totalCash > cibleHaute × 1,5 → curseur clampé à 100 % + overflow=true', () => {
    const r = computeJaugeMatelas({ totalCashEur: 50_000, ...CASE_AYMERIC })
    expect(r.cursorPct).toBe(100)
    expect(r.overflow).toBe(true)
  })

  it('cas réel Aymeric : totalCash 18 578 € → curseur ≈ 61,6 %', () => {
    const r = computeJaugeMatelas({ totalCashEur: 18_578, ...CASE_AYMERIC })
    // 18578 / 30150 = 0,6161
    expect(r.cursorPct).toBeCloseTo(61.62, 1)
    expect(r.overflow).toBe(false)
  })
})

describe('computeJaugeMatelas — largeurs des segments (cas Aymeric)', () => {
  const r = computeJaugeMatelas({ totalCashEur: 18_578, ...CASE_AYMERIC })

  it('rouge = 50 % (0 → cibleBasse / domainMax)', () => {
    expect(r.segments.rouge.widthPct).toBe(50)
    expect(r.segments.rouge.upperBoundEur).toBe(15_075)
  })

  it('vert ≈ 16,67 % (plage cible)', () => {
    expect(r.segments.vert.widthPct).toBeCloseTo(16.67, 1)
    expect(r.segments.vert.upperBoundEur).toBe(20_100)
  })

  it('orange ≈ 33,33 % (plage excédent)', () => {
    expect(r.segments.orange.widthPct).toBeCloseTo(33.33, 1)
    expect(r.segments.orange.upperBoundEur).toBe(30_150)
  })

  it('somme des largeurs ≈ 100 %', () => {
    const sum = r.segments.rouge.widthPct
              + r.segments.vert.widthPct
              + r.segments.orange.widthPct
    expect(sum).toBeCloseTo(100, 1)
  })
})

describe('computeJaugeMatelas — graduations', () => {
  it('expose 4 graduations chiffrées + leurs positions x (%)', () => {
    const r = computeJaugeMatelas({ totalCashEur: 18_578, ...CASE_AYMERIC })
    expect(r.graduations).toEqual([0, 15_075, 20_100, 30_150])
    expect(r.graduationsPct[0]).toBe(0)
    expect(r.graduationsPct[1]).toBe(50)
    expect(r.graduationsPct[2]).toBeCloseTo(66.67, 1)
    expect(r.graduationsPct[3]).toBe(100)
  })
})

describe('computeJaugeMatelas — robustesse', () => {
  it('cibles à 0 → domaine fallback à 1, segments collapsés', () => {
    const r = computeJaugeMatelas({
      totalCashEur:  0,
      cibleBasseEur: 0,
      cibleHauteEur: 0,
    })
    expect(r.domainMaxEur).toBe(1)
    expect(r.cursorPct).toBe(0)
    expect(r.segments.rouge.widthPct).toBe(0)
    expect(r.segments.vert.widthPct).toBe(0)
    expect(r.segments.orange.widthPct).toBe(100)
  })

  it('totalCash négatif → curseur à 0 (clamp)', () => {
    const r = computeJaugeMatelas({ totalCashEur: -1_000, ...CASE_AYMERIC })
    expect(r.cursorPct).toBe(0)
  })

  it('cibleBasse > cibleHaute (input pathologique) → swap silencieux', () => {
    const r = computeJaugeMatelas({
      totalCashEur:  5_000,
      cibleBasseEur: 10_000,
      cibleHauteEur:  5_000, // < cibleBasse
    })
    // Pas de NaN, pas de largeurs négatives
    expect(r.segments.rouge.widthPct).toBeGreaterThanOrEqual(0)
    expect(r.segments.vert.widthPct).toBeGreaterThanOrEqual(0)
    expect(r.segments.orange.widthPct).toBeGreaterThanOrEqual(0)
  })
})

// ──────────────────────────────────────────────────────────────────────
// V1.2-POLISH — Double marqueur (curseur effectif + marker brut)
// ──────────────────────────────────────────────────────────────────────
describe('computeJaugeMatelas — V1.2-POLISH double marqueur', () => {
  // Cas Aymeric stable 3-6 mois (cibleBasse 5025, cibleHaute 10050).
  // Cap = 15 075. (Cibles inférieures au cas Aymeric instable 9-12.)
  const AYMERIC_STABLE = {
    cibleBasseEur:  5_025,
    cibleHauteEur: 10_050,
  }

  it('pas d\'intent (cashBrutEur === totalCashEur) → showBrutMarker = false', () => {
    const r = computeJaugeMatelas({
      totalCashEur:  18_578,
      cashBrutEur:   18_578,
      ...AYMERIC_STABLE,
    })
    expect(r.showBrutMarker).toBe(false)
    expect(r.cursorEffectifPct).toBe(r.cursorBrutPct)
  })

  it('cashBrutEur omis → showBrutMarker = false (rétro-compat V1.1)', () => {
    const r = computeJaugeMatelas({
      totalCashEur:  18_578,
      ...AYMERIC_STABLE,
    })
    expect(r.showBrutMarker).toBe(false)
    // Alias V1.2-POLISH = champs V1.1
    expect(r.cursorEffectifPct).toBe(r.cursorPct)
    expect(r.cursorEffectifOverflow).toBe(r.overflow)
  })

  it('Aymeric stable, brut 18 578 € + intent 8 000 € → 2 curseurs distincts', () => {
    // cap = 15 075. Effectif 10 578 → ≈ 70,2 %. Brut 18 578 → overflow (100 %).
    const r = computeJaugeMatelas({
      totalCashEur:  10_578,
      cashBrutEur:   18_578,
      ...AYMERIC_STABLE,
    })
    expect(r.cursorEffectifPct).toBeCloseTo(70.2, 1)
    expect(r.cursorEffectifOverflow).toBe(false)
    expect(r.cursorBrutPct).toBe(100)
    expect(r.cursorBrutOverflow).toBe(true)
    expect(r.showBrutMarker).toBe(true)
  })

  it('intent ramenant l\'effectif en zone verte, brut clampé à droite', () => {
    // cap = 15 075. Effectif 7 000 → ≈ 46,4 %. Brut 18 578 → overflow.
    const r = computeJaugeMatelas({
      totalCashEur:  7_000,
      cashBrutEur:   18_578,
      ...AYMERIC_STABLE,
    })
    expect(r.cursorEffectifPct).toBeCloseTo(46.4, 1)
    expect(r.cursorEffectifOverflow).toBe(false)
    expect(r.cursorBrutPct).toBe(100)
    expect(r.cursorBrutOverflow).toBe(true)
    expect(r.showBrutMarker).toBe(true)
  })

  it('petite intent (écart < 2 % du cap) → showBrutMarker = false', () => {
    // cap = 15 075. Écart visuel cible < 2 % → ≤ 301,5 €.
    // Effectif 10 000, brut 10 200 (écart 200 € = 1,33 % → trop proche).
    const r = computeJaugeMatelas({
      totalCashEur:  10_000,
      cashBrutEur:   10_200,
      ...AYMERIC_STABLE,
    })
    expect(Math.abs(r.cursorBrutPct - r.cursorEffectifPct)).toBeLessThan(2)
    expect(r.showBrutMarker).toBe(false)
  })

  it('grosse intent amenant effectif à 0 → cursorEffectifPct = 0, marker brut visible', () => {
    const r = computeJaugeMatelas({
      totalCashEur:  0,
      cashBrutEur:   18_578,
      ...AYMERIC_STABLE,
    })
    expect(r.cursorEffectifPct).toBe(0)
    expect(r.cursorEffectifOverflow).toBe(false)
    expect(r.cursorBrutOverflow).toBe(true)
    expect(r.showBrutMarker).toBe(true)
  })

  it('cap exact 15 075 € (cas Aymeric stable) : effectif 10 578 → ≈ 70,2 %', () => {
    const r = computeJaugeMatelas({
      totalCashEur:  10_578,
      cashBrutEur:   18_578,
      ...AYMERIC_STABLE,
    })
    expect(r.domainMaxEur).toBe(15_075)
    expect(r.cursorEffectifPct).toBeCloseTo(70.2, 1)
    expect(r.cursorBrutOverflow).toBe(true)
  })

  it('cashBrutEur < totalCashEur (cas patho : intent négative théorique) → toujours évité par computeMatelasEffectif, garde défensive ici', () => {
    // Si on appelle directement avec brut < effectif, on doit quand
    // même retourner un résultat cohérent (pas de NaN).
    const r = computeJaugeMatelas({
      totalCashEur:  10_000,
      cashBrutEur:    5_000,
      ...AYMERIC_STABLE,
    })
    expect(r.cursorEffectifPct).toBeGreaterThanOrEqual(0)
    expect(r.cursorBrutPct).toBeGreaterThanOrEqual(0)
    // L'écart absolu reste affiché si > MIN_GAP_PCT.
    expect(r.showBrutMarker).toBe(true)
  })
})
