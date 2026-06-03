/**
 * Tests du helper `computeCashTotals` (Cash Refactor V1.0).
 *
 * Vérifie :
 *   - Sommes simples mono- et multi-comptes EUR
 *   - Conversion FX via fxResolver injecté (USD, CHF)
 *   - Split investissable vs compte_courant
 *   - Dédup legacy vs cash_accounts (par `asset_id`)
 *   - Robustesse : tableau vide, arrondi final
 */
import { describe, it, expect } from 'vitest'
import {
  computeCashTotals,
  type CashAccountForTotal,
  type LegacyCashAsset,
  type CashFxResolver,
} from '../totals'

/** Resolver de test : EUR/USD à 0,92, EUR/CHF à 1,05, autres en identité. */
const TEST_FX: CashFxResolver = async (amount, currency) => {
  const code = (currency ?? 'EUR').toUpperCase()
  if (code === 'EUR') return amount
  if (code === 'USD') return amount * 0.92
  if (code === 'CHF') return amount * 1.05
  return amount
}

function makeAccount(over: Partial<CashAccountForTotal>): CashAccountForTotal {
  return {
    id:           'acc-' + Math.random().toString(36).slice(2, 8),
    asset_id:     null,
    balance:      0,
    currency:     'EUR',
    account_type: 'livret_a',
    ...over,
  }
}

describe('computeCashTotals — somme EUR', () => {
  it('1 compte EUR → total = balance', async () => {
    const accounts = [makeAccount({ balance: 12_345.67, currency: 'EUR' })]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(12_345.67)
    expect(r.totalInvestissableEur).toBe(12_345.67)
    expect(r.totalCompteCourantEur).toBe(0)
    expect(r.countAccounts).toBe(1)
  })

  it('plusieurs comptes EUR → somme correcte', async () => {
    const accounts = [
      makeAccount({ balance: 10_000, account_type: 'livret_a' }),
      makeAccount({ balance:  5_000, account_type: 'ldds'     }),
      makeAccount({ balance:  2_500, account_type: 'lep'      }),
    ]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(17_500)
    expect(r.totalInvestissableEur).toBe(17_500)
    expect(r.countAccounts).toBe(3)
  })
})

describe('computeCashTotals — conversion FX', () => {
  it('mix EUR + USD à 0,92', async () => {
    const accounts = [
      makeAccount({ balance: 10_000, currency: 'EUR' }),
      makeAccount({ balance:  1_000, currency: 'USD' }), // 920 €
    ]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(10_920)
    expect(r.totalInvestissableEur).toBe(10_920)
    expect(r.countAccounts).toBe(2)
  })

  it('mix EUR + USD + CHF', async () => {
    const accounts = [
      makeAccount({ balance: 10_000, currency: 'EUR' }),
      makeAccount({ balance:  1_000, currency: 'USD' }), //   920 €
      makeAccount({ balance:  2_000, currency: 'CHF' }), // 2 100 €
    ]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(13_020)
    expect(r.totalInvestissableEur).toBe(13_020)
    expect(r.countAccounts).toBe(3)
  })

  it('devise inconnue → identité (resolver de test)', async () => {
    const accounts = [makeAccount({ balance: 500, currency: 'XYZ' })]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(500)
  })
})

describe('computeCashTotals — split investissable vs compte_courant', () => {
  it('compte_courant exclu de totalInvestissableEur, isolé dans totalCompteCourantEur', async () => {
    const accounts = [
      makeAccount({ balance: 10_000, account_type: 'livret_a'       }),
      makeAccount({ balance:  3_000, account_type: 'compte_courant' }),
    ]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(13_000)
    expect(r.totalInvestissableEur).toBe(10_000)
    expect(r.totalCompteCourantEur).toBe(3_000)
  })

  it('uniquement compte_courant → investissable = 0', async () => {
    const accounts = [
      makeAccount({ balance: 1_500, account_type: 'compte_courant' }),
    ]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalInvestissableEur).toBe(0)
    expect(r.totalCompteCourantEur).toBe(1_500)
    expect(r.totalEur).toBe(1_500)
  })
})

describe('computeCashTotals — dédup legacy assets', () => {
  it('legacy asset dont id == account.asset_id → SKIPPÉ (pas de double comptage)', async () => {
    const accounts: CashAccountForTotal[] = [
      makeAccount({ asset_id: 'asset-1', balance: 10_000 }),
    ]
    const legacy: LegacyCashAsset[] = [
      { id: 'asset-1', current_value: 10_000, currency: 'EUR' },
    ]
    const r = await computeCashTotals(accounts, { legacyAssets: legacy, fxResolver: TEST_FX })
    expect(r.totalEur).toBe(10_000)
    expect(r.countAccounts).toBe(1) // legacy dédupliqué ne compte pas
  })

  it('legacy asset sans correspondance → AJOUTÉ', async () => {
    const accounts: CashAccountForTotal[] = [
      makeAccount({ asset_id: 'asset-1', balance: 10_000 }),
    ]
    const legacy: LegacyCashAsset[] = [
      { id: 'asset-99-orphan', current_value: 2_500, currency: 'EUR' },
    ]
    const r = await computeCashTotals(accounts, { legacyAssets: legacy, fxResolver: TEST_FX })
    expect(r.totalEur).toBe(12_500)
    expect(r.totalInvestissableEur).toBe(12_500) // legacy → investissable par défaut
    expect(r.countAccounts).toBe(2)
  })

  it('legacy mix : 1 dédupliqué, 1 conservé', async () => {
    const accounts: CashAccountForTotal[] = [
      makeAccount({ asset_id: 'asset-1', balance: 5_000 }),
      makeAccount({ asset_id: 'asset-2', balance: 3_000 }),
    ]
    const legacy: LegacyCashAsset[] = [
      { id: 'asset-2',  current_value: 3_000, currency: 'EUR' }, // dédupliqué
      { id: 'asset-99', current_value: 1_200, currency: 'EUR' }, // ajouté
    ]
    const r = await computeCashTotals(accounts, { legacyAssets: legacy, fxResolver: TEST_FX })
    expect(r.totalEur).toBe(9_200)
    expect(r.countAccounts).toBe(3)
  })

  it('asset_id null sur un compte → pas de dédup possible, legacy ajouté', async () => {
    const accounts: CashAccountForTotal[] = [
      makeAccount({ asset_id: null, balance: 5_000 }),
    ]
    const legacy: LegacyCashAsset[] = [
      { id: 'asset-1', current_value: 1_000, currency: 'EUR' },
    ]
    const r = await computeCashTotals(accounts, { legacyAssets: legacy, fxResolver: TEST_FX })
    expect(r.totalEur).toBe(6_000)
    expect(r.countAccounts).toBe(2)
  })
})

describe('computeCashTotals — robustesse', () => {
  it('tableau vide → tous zéros, pas d\'erreur', async () => {
    const r = await computeCashTotals([], { fxResolver: TEST_FX })
    expect(r).toEqual({
      totalEur:              0,
      totalInvestissableEur: 0,
      totalCompteCourantEur: 0,
      countAccounts:         0,
    })
  })

  it('legacy vide explicite → identique à sans legacy', async () => {
    const accounts = [makeAccount({ balance: 1_000 })]
    const r1 = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    const r2 = await computeCashTotals(accounts, { legacyAssets: [], fxResolver: TEST_FX })
    expect(r1).toEqual(r2)
  })

  it('arrondi final au centime sur USD avec décimales infinies', async () => {
    // 333.33 USD × 0.92 = 306.6636 → arrondi 306.66 €
    const accounts = [makeAccount({ balance: 333.33, currency: 'USD' })]
    const r = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    expect(r.totalEur).toBe(306.66)
  })

  it('balance NaN → ignorée silencieusement (resolver retournerait NaN)', async () => {
    const fxNaN: CashFxResolver = async () => Number.NaN
    const accounts = [
      makeAccount({ balance: 1_000, currency: 'XXX' }),
      makeAccount({ balance: 2_000, currency: 'EUR' }),
    ]
    const r = await computeCashTotals(accounts, { fxResolver: fxNaN })
    // Les deux résoudraient NaN → total = 0
    expect(r.totalEur).toBe(0)
    expect(r.countAccounts).toBe(2) // count basé sur la longueur, pas le filtre
  })
})
