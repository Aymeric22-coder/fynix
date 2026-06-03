/**
 * Tests du helper `computeCashYield` (Cash Refactor V1.0).
 *
 * Vérifie :
 *   - Intérêts annuels par compte (formule balance × rate / 100)
 *   - Taux moyen pondéré par les soldes (en EUR)
 *   - Robustesse : Σ balance = 0, tous comptes à 0 %, devise non-EUR
 *   - Cas dégénérés (aucune division par zéro, pas de NaN qui fuit)
 */
import { describe, it, expect } from 'vitest'
import {
  computeCashYield,
  type CashAccountForYield,
  type CashFxResolver,
} from '../rendement'

const TEST_FX: CashFxResolver = async (amount, currency) => {
  const code = (currency ?? 'EUR').toUpperCase()
  if (code === 'EUR') return amount
  if (code === 'USD') return amount * 0.92
  return amount
}

describe('computeCashYield — cas simples', () => {
  it('1 compte 10 000 € à 3 % → intérêts 300 €, taux moyen 3 %', async () => {
    const accounts: CashAccountForYield[] = [
      { balance: 10_000, currency: 'EUR', interest_rate: 3 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.interetsAnnuelsTotalEur).toBe(300)
    expect(r.tauxMoyenPondereDecimal).toBeCloseTo(0.03, 10)
    expect(r.tauxMoyenPonderePourcent).toBe(3)
  })

  it('2 comptes 10 000 € à 3 % + 5 000 € à 4 % → intérêts 500 €, taux moyen ≈ 3,333 %', async () => {
    const accounts: CashAccountForYield[] = [
      { balance: 10_000, currency: 'EUR', interest_rate: 3 },
      { balance:  5_000, currency: 'EUR', interest_rate: 4 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    // 10000 × 0.03 + 5000 × 0.04 = 300 + 200 = 500
    expect(r.interetsAnnuelsTotalEur).toBe(500)
    // 500 / 15000 = 0.03333…
    expect(r.tauxMoyenPondereDecimal).toBeCloseTo(500 / 15_000, 10)
    expect(r.tauxMoyenPonderePourcent).toBe(3.33)
  })
})

describe('computeCashYield — taux 0 inclus dans le dénominateur', () => {
  it('tous comptes à 0 % → intérêts 0, taux moyen 0 (pas de NaN)', async () => {
    const accounts: CashAccountForYield[] = [
      { balance: 10_000, currency: 'EUR', interest_rate: 0 },
      { balance:  5_000, currency: 'EUR', interest_rate: 0 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.interetsAnnuelsTotalEur).toBe(0)
    expect(r.tauxMoyenPondereDecimal).toBe(0)
    expect(r.tauxMoyenPonderePourcent).toBe(0)
    expect(Number.isNaN(r.tauxMoyenPondereDecimal)).toBe(false)
  })

  it('compte à 0 % ne gonfle PAS le taux moyen (reste dans le dénominateur)', async () => {
    // 10 000 € à 3 % + 10 000 € à 0 % :
    //   Σ rate × balance = 300
    //   Σ balance = 20 000
    //   → taux moyen 1,5 % (et non 3 % comme on aurait avec dénominateur biaisé)
    const accounts: CashAccountForYield[] = [
      { balance: 10_000, currency: 'EUR', interest_rate: 3 },
      { balance: 10_000, currency: 'EUR', interest_rate: 0 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.interetsAnnuelsTotalEur).toBe(300)
    expect(r.tauxMoyenPonderePourcent).toBe(1.5)
  })
})

describe('computeCashYield — robustesse', () => {
  it('accounts vide → tous zéros', async () => {
    const r = await computeCashYield([], TEST_FX)
    expect(r).toEqual({
      interetsAnnuelsTotalEur:  0,
      tauxMoyenPondereDecimal:  0,
      tauxMoyenPonderePourcent: 0,
    })
  })

  it('Σ balance = 0 → tous zéros, pas de division par zéro', async () => {
    const accounts: CashAccountForYield[] = [
      { balance: 0, currency: 'EUR', interest_rate: 3 },
      { balance: 0, currency: 'EUR', interest_rate: 4 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.tauxMoyenPondereDecimal).toBe(0)
    expect(r.interetsAnnuelsTotalEur).toBe(0)
    expect(Number.isFinite(r.tauxMoyenPondereDecimal)).toBe(true)
  })

  it('interest_rate NaN traité comme 0 %', async () => {
    const accounts: CashAccountForYield[] = [
      { balance: 10_000, currency: 'EUR', interest_rate: Number.NaN },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.interetsAnnuelsTotalEur).toBe(0)
    expect(r.tauxMoyenPondereDecimal).toBe(0)
  })
})

describe('computeCashYield — devise non-EUR', () => {
  it('compte USD à 5 % converti en EUR (resolver 0.92)', async () => {
    // 1 000 USD × 0.92 = 920 € ; intérêts = 920 × 5 % = 46 €
    const accounts: CashAccountForYield[] = [
      { balance: 1_000, currency: 'USD', interest_rate: 5 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.interetsAnnuelsTotalEur).toBe(46)
    expect(r.tauxMoyenPonderePourcent).toBe(5) // ratio invariant à la devise
  })

  it('mix EUR + USD → taux moyen pondéré par les soldes EUR', async () => {
    // 10 000 € à 3 % + 1 000 USD (920 €) à 4 %
    //   Σ intérêts = 300 + 920×0.04 = 300 + 36.8 = 336.8
    //   Σ balance  = 10 920
    //   taux moyen ≈ 3.0843 %
    const accounts: CashAccountForYield[] = [
      { balance: 10_000, currency: 'EUR', interest_rate: 3 },
      { balance:  1_000, currency: 'USD', interest_rate: 4 },
    ]
    const r = await computeCashYield(accounts, TEST_FX)
    expect(r.interetsAnnuelsTotalEur).toBeCloseTo(336.8, 2)
    expect(r.tauxMoyenPonderePourcent).toBe(3.08)
  })
})
