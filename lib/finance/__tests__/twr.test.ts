/**
 * Tests pédagogiques du moteur TWR pur.
 *
 * Chaque cas matérialise une propriété mathématique attendue. Les valeurs
 * cibles sont calculées à la main et documentées en commentaire.
 */
import { describe, it, expect } from 'vitest'
import { computeTwr, type TwrSegment } from '../twr'

function seg(start: string, end: string, startVal: number, endVal: number): TwrSegment {
  return {
    startDate:     new Date(start),
    endDate:       new Date(end),
    startValueEur: startVal,
    endValueEur:   endVal,
  }
}

describe('computeTwr — cas pédagogiques', () => {
  it('cas 1 : aucun flux, plus-value pure sur 1 an → TWR = +10 % annualisé', () => {
    // Calcul : 1 segment 10 000 → 11 000 sur 365 j
    //   r = (11000 − 10000) / 10000 = +10,00 %
    //   cumul = 1,10 − 1 = +10,00 %
    //   annualisé = 1,10^(365/365) − 1 = +10,00 %
    const r = computeTwr([seg('2024-01-01', '2024-12-31', 10_000, 11_000)])
    expect(r).not.toBeNull()
    expect(r!.twrCumulePct).toBeCloseTo(10, 1)
    expect(r!.twrAnnualisePct).toBeCloseTo(10, 1)
    expect(r!.extrapole).toBe(false)
    expect(r!.segmentCount).toBe(1)
  })

  it('cas 2 : apport au milieu → TWR neutralise l\'apport', () => {
    // Calcul : 2 segments
    //   Seg 1 : 10 000 → 11 000 sur 182 j (r = +10,00 %)
    //   APPORT 5 000 € (16 000 € après)
    //   Seg 2 : 16 000 → 18 000 sur 183 j (r = +12,50 %)
    //   cumul = 1,10 × 1,125 − 1 = +23,75 %
    //   totalDays = 365 → annualisé = +23,75 %
    const r = computeTwr([
      seg('2024-01-01', '2024-07-01', 10_000, 11_000),
      seg('2024-07-01', '2024-12-31', 16_000, 18_000),
    ])
    expect(r).not.toBeNull()
    expect(r!.twrCumulePct).toBeCloseTo(23.75, 1)
    expect(r!.twrAnnualisePct).toBeCloseTo(23.75, 1)
    expect(r!.segmentCount).toBe(2)
  })

  it('cas 3 : plus-value puis krach symétrique → TWR = 0 %', () => {
    // Seg 1 : 10 000 → 15 000 (r = +50 %)
    // Seg 2 : 15 000 → 10 000 (r = −33,33 %)
    // cumul = 1,5 × (10/15) − 1 = 1,5 × 0,6667 − 1 = 1,0 − 1 = 0 %
    const r = computeTwr([
      seg('2024-01-01', '2024-06-30', 10_000, 15_000),
      seg('2024-06-30', '2024-12-31', 15_000, 10_000),
    ])
    expect(r).not.toBeNull()
    expect(r!.twrCumulePct).toBeCloseTo(0, 1)
    expect(r!.twrAnnualisePct).toBeCloseTo(0, 1)
  })

  it('cas 4 : segment court (60 jours) → null (sous seuil 90 j)', () => {
    const r = computeTwr([seg('2024-01-01', '2024-03-01', 10_000, 10_500)])
    expect(r).toBeNull()
  })

  it('cas 5 : liste vide → null', () => {
    expect(computeTwr([])).toBeNull()
  })

  it('cas 6 : premier segment à 0 € → ignoré, pas d\'erreur', () => {
    // Le segment startValueEur=0 est filtré (rendement non défini).
    // Reste 1 segment 10 000 → 12 000 sur 365 j.
    const r = computeTwr([
      seg('2023-12-01', '2024-01-01', 0,      10_000),
      seg('2024-01-01', '2024-12-31', 10_000, 12_000),
    ])
    expect(r).not.toBeNull()
    expect(r!.segmentCount).toBe(1)
    expect(r!.twrCumulePct).toBeCloseTo(20, 1)
  })

  it('cas 7 : extrapolation < 365 j → flag levé', () => {
    // 180 j à +5 % cumulé → annualisé ≈ (1,05)^(365/180) − 1 ≈ +10,38 %
    const r = computeTwr([seg('2024-01-01', '2024-06-29', 10_000, 10_500)])
    expect(r).not.toBeNull()
    expect(r!.twrCumulePct).toBeCloseTo(5, 1)
    expect(r!.twrAnnualisePct).toBeCloseTo(10.38, 0.5)
    expect(r!.extrapole).toBe(true)
    expect(r!.totalDays).toBeLessThan(365)
    expect(r!.totalDays).toBeGreaterThanOrEqual(90)
  })

  it('edge case : segment avec endDate <= startDate filtré', () => {
    // Saisie incohérente (clock skew, fichier mal calibré) → segment ignoré
    const r = computeTwr([
      seg('2024-01-01', '2023-12-31', 10_000, 11_000),  // FILTRÉ (endDate < startDate)
      seg('2024-01-01', '2024-12-31', 10_000, 11_000),
    ])
    expect(r).not.toBeNull()
    expect(r!.segmentCount).toBe(1)
  })

  it('arrondi des sorties à 0,01 pp', () => {
    // 100 → 100.123456789... vérifier que le retour est arrondi proprement
    const r = computeTwr([seg('2024-01-01', '2024-12-31', 10_000, 10_012.3456)])
    expect(r).not.toBeNull()
    // r = 0.12345... → arrondi à 0,12 (avec 2 décimales sur le %)
    expect(r!.twrCumulePct).toBe(0.12)
  })
})
