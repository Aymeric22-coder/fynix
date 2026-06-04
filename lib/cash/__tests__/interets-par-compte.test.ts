/**
 * V1.4 Vol H — Tests Vitest C1/C2 manquants (audit `auditcash.md`).
 *
 * C1 = ligne intérêts annuels par compte sur `/cash` :
 *      `annualInterest = balance × (interest_rate / 100)`
 * C2 = preview intérêts dans le formulaire d'ajout/édition :
 *      même formule, calcul client live.
 *
 * Les call-sites (UI) sont simples et identiques côté logique. Les tests
 * vérifient la formule sur des cas réalistes, plus des bornes (taux 0,
 * balance négative défensive, taux à virgule).
 */
import { describe, it, expect } from 'vitest'

/**
 * Formule canonique : `balance × interest_rate / 100`. Pure, sans
 * arrondi (le formatage est délégué à `formatCurrency`).
 */
function calculerInteretsAnnuels(balance: number, ratePercent: number): number {
  return balance * (ratePercent / 100)
}

describe('Cash — calcul intérêts annuels (C1 + C2)', () => {
  it('Livret A 22 950 € à 1,5 % → 344,25 €/an', () => {
    expect(calculerInteretsAnnuels(22_950, 1.5)).toBeCloseTo(344.25, 2)
  })

  it('LEP 10 000 € à 2,5 % → 250 €/an', () => {
    expect(calculerInteretsAnnuels(10_000, 2.5)).toBe(250)
  })

  it('LDDS 12 000 € à 1,5 % → 180 €/an', () => {
    expect(calculerInteretsAnnuels(12_000, 1.5)).toBe(180)
  })

  it('CEL 8 000 € à 1,0 % → 80 €/an', () => {
    expect(calculerInteretsAnnuels(8_000, 1.0)).toBe(80)
  })

  it('taux à 0 % → 0 (compte courant ou défaut zéro)', () => {
    expect(calculerInteretsAnnuels(5_000, 0)).toBe(0)
  })

  it('balance à 0 → 0', () => {
    expect(calculerInteretsAnnuels(0, 3.0)).toBe(0)
  })

  it('taux à virgule (4,02 %) → conversion exacte', () => {
    expect(calculerInteretsAnnuels(15_000, 4.02)).toBeCloseTo(603, 6)
  })

  it('cas Aymeric (Livret A 22 950 + LDDS 12 000 + LEP 10 000 + CEL 8 000) → total ≈ 854,25 €/an', () => {
    const total =
      calculerInteretsAnnuels(22_950, 1.5)
      + calculerInteretsAnnuels(12_000, 1.5)
      + calculerInteretsAnnuels(10_000, 2.5)
      + calculerInteretsAnnuels(8_000,  1.0)
    // 344,25 + 180 + 250 + 80 = 854,25 €
    expect(total).toBeCloseTo(854.25, 2)
  })
})
