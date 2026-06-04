/* @vitest-environment jsdom */
/**
 * Tests `CashAccountsGrouped` — V1.4 Vol C (groupage Épargne / Liquidité)
 * + Vol D (badge fraîcheur, intégré).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

import { CashAccountsGrouped, type CashAccountForList } from '../cash-accounts-grouped'

afterEach(cleanup)

function acc(over: Partial<CashAccountForList>): CashAccountForList {
  return {
    id:           'a-' + Math.random().toString(36).slice(2, 8),
    account_type: 'livret_a',
    bank_name:    'BNP',
    balance:      10_000,
    interest_rate: 3.0,
    balance_date: '2026-06-01',
    asset:        { name: 'Livret A' },
    asset_id:     null,
    ...over,
  }
}

describe('CashAccountsGrouped — V1.4 Vol C groupage', () => {
  it('2 livrets + 1 CC → 2 sections « Épargne » et « Liquidité courante »', () => {
    const accounts = [
      acc({ id: 'a', account_type: 'livret_a', balance: 22_000, asset: { name: 'Livret A' } }),
      acc({ id: 'b', account_type: 'lep',      balance: 10_000, asset: { name: 'LEP' } }),
      acc({ id: 'c', account_type: 'compte_courant', balance: 3_000, interest_rate: 0, asset: { name: 'CC BNP' } }),
    ]
    render(<CashAccountsGrouped accounts={accounts} />)
    expect(screen.getByText(/^Épargne$/i)).toBeTruthy()
    expect(screen.getByText(/^Liquidité courante$/i)).toBeTruthy()
  })

  it('3 livrets seulement → uniquement « Épargne »', () => {
    const accounts = [
      acc({ id: 'a', account_type: 'livret_a' }),
      acc({ id: 'b', account_type: 'ldds' }),
      acc({ id: 'c', account_type: 'lep' }),
    ]
    render(<CashAccountsGrouped accounts={accounts} />)
    expect(screen.getByText(/^Épargne$/i)).toBeTruthy()
    expect(screen.queryByText(/^Liquidité courante$/i)).toBeNull()
  })

  it('1 CC seulement → uniquement « Liquidité courante »', () => {
    const accounts = [
      acc({ id: 'cc', account_type: 'compte_courant', balance: 2_500, interest_rate: 0 }),
    ]
    render(<CashAccountsGrouped accounts={accounts} />)
    expect(screen.queryByText(/^Épargne$/i)).toBeNull()
    expect(screen.getByText(/^Liquidité courante$/i)).toBeTruthy()
  })

  it('mini-totaux par section correctement calculés', () => {
    const accounts = [
      acc({ id: 'a', account_type: 'livret_a', balance: 22_000 }),
      acc({ id: 'b', account_type: 'lep',      balance:  8_000 }),
      acc({ id: 'c', account_type: 'compte_courant', balance: 3_000 }),
    ]
    render(<CashAccountsGrouped accounts={accounts} />)
    // 22 000 + 8 000 = 30 000 € épargne
    // Le format compact peut être « 30 k€ » sur mobile
    expect(screen.getAllByText((_t, node) =>
      node?.textContent?.includes('30') === true
      && node?.textContent?.includes('€') === true,
    ).length).toBeGreaterThan(0)
  })
})
