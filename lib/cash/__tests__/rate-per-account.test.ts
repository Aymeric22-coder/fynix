/**
 * Tests du taux nominal annualisé par compte cash (V2.4 P0.7 ST3).
 *
 * Vérifie :
 *   - Mapping 1 compte = 1 ligne
 *   - Filtre minHoldingDays (défaut 90 j)
 *   - Exclusion silencieuse si createdAt manquante / NaN
 *   - extrapole = false par construction
 */
import { describe, it, expect } from 'vitest'
import {
  computeRatePerAccount,
  type CashAccountForRate,
  type CashRateResult,
} from '../rate-per-account'

const ASOF = new Date('2026-06-02')

function find(rs: CashRateResult[], id: string): CashRateResult | undefined {
  return rs.find((r) => r.accountId === id)
}

describe('computeRatePerAccount — mapping', () => {
  it('1 livret valide = 1 ligne avec taux + ancienneté', () => {
    const accounts: CashAccountForRate[] = [
      {
        accountId:       'livret-a-bourso',
        accountLabel:    'Livret A — Boursorama',
        interestRatePct: 3.0,
        createdAt:       '2024-01-15',
        balance:         22_950,
      },
    ]
    const rs = computeRatePerAccount({ accounts, asOfDate: ASOF })
    expect(rs).toHaveLength(1)
    expect(rs[0]!.interestRatePct).toBe(3.0)
    expect(rs[0]!.accountLabel).toBe('Livret A — Boursorama')
    expect(rs[0]!.holdingDays).toBeGreaterThan(800)
    expect(rs[0]!.extrapole).toBe(false)
    expect(rs[0]!.balance).toBe(22_950)
  })
})

describe('computeRatePerAccount — filtre minHoldingDays', () => {
  it('exclut un compte ouvert il y a < 90 j', () => {
    const accounts: CashAccountForRate[] = [
      { accountId: 'fresh', accountLabel: 'F', interestRatePct: 4.0, createdAt: '2026-05-03', balance: 1000 },
      { accountId: 'old',   accountLabel: 'O', interestRatePct: 3.0, createdAt: '2024-06-01', balance: 1000 },
    ]
    const rs = computeRatePerAccount({ accounts, asOfDate: ASOF })
    expect(find(rs, 'fresh')).toBeUndefined()
    expect(find(rs, 'old')).toBeDefined()
  })

  it('seuil paramétrable via minHoldingDays', () => {
    const accounts: CashAccountForRate[] = [
      { accountId: 'a', accountLabel: 'A', interestRatePct: 3.0, createdAt: '2025-12-01', balance: 1000 },
    ]
    expect(computeRatePerAccount({ accounts, asOfDate: ASOF, minHoldingDays: 200 })).toHaveLength(0)
    expect(computeRatePerAccount({ accounts, asOfDate: ASOF, minHoldingDays: 90  })).toHaveLength(1)
  })
})

describe('computeRatePerAccount — robustesse', () => {
  it('exclut un compte sans createdAt', () => {
    const accounts: CashAccountForRate[] = [
      { accountId: 'a', accountLabel: 'A', interestRatePct: 3.0, createdAt: '', balance: 1000 },
    ]
    expect(computeRatePerAccount({ accounts, asOfDate: ASOF })).toHaveLength(0)
  })

  it('exclut un compte dont interestRatePct n\'est pas un nombre fini', () => {
    const accounts: CashAccountForRate[] = [
      { accountId: 'a', accountLabel: 'A', interestRatePct: Number.NaN, createdAt: '2024-06-01', balance: 1000 },
    ]
    expect(computeRatePerAccount({ accounts, asOfDate: ASOF })).toHaveLength(0)
  })
})
