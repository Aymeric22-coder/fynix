import { describe, it, expect } from 'vitest'
import { getDefaultCharges, DEFAULT_CHARGES_RATIOS } from '../defaultCharges'

describe('getDefaultCharges', () => {
  it('applique les ratios standard sur un prix de 200 000 €', () => {
    const c = getDefaultCharges(200_000)
    expect(c.taxe_fonciere).toBe(1_600)  // 200k × 0,8 %
    expect(c.insurance_pno).toBe(800)    // 200k × 0,4 %
    expect(c.maintenance).toBe(2_000)    // 200k × 1 %
    expect(c.vacancy_pct).toBe(5)
  })

  it('renvoie 0 pour les montants si prix nul / négatif / null, garde vacancy 5 %', () => {
    for (const price of [0, -100, null, undefined]) {
      const c = getDefaultCharges(price)
      expect(c.taxe_fonciere).toBe(0)
      expect(c.insurance_pno).toBe(0)
      expect(c.maintenance).toBe(0)
      expect(c.vacancy_pct).toBe(DEFAULT_CHARGES_RATIOS.VACANCY_PCT)
    }
  })

  it('arrondit les montants à l\'entier', () => {
    const c = getDefaultCharges(123_456)
    expect(Number.isInteger(c.taxe_fonciere)).toBe(true)
    expect(Number.isInteger(c.insurance_pno)).toBe(true)
    expect(Number.isInteger(c.maintenance)).toBe(true)
  })

  it('les ratios documentés sont conservateurs (somme < 3 % du prix)', () => {
    const sum =
      DEFAULT_CHARGES_RATIOS.TAXE_FONCIERE
      + DEFAULT_CHARGES_RATIOS.INSURANCE_PNO
      + DEFAULT_CHARGES_RATIOS.MAINTENANCE
    expect(sum).toBeLessThan(0.03)  // garde-fou anti-régression
    expect(sum).toBeGreaterThan(0.015)
  })
})
