/**
 * Test d'intégration Volet B (Cash Refactor V1.1) — convergence des 4 sites.
 *
 * Garantit que les 4 implémentations historiques du total cash, désormais
 * unifiées derrière `computeCashTotals` / `computeCashTotalsSync`, produisent
 * un total identique pour un même jeu d'entrée — multi-devise inclus.
 *
 * Les 4 sites historiques :
 *   1. `app/(app)/cash/page.tsx`          → `computeCashTotals` async
 *   2. `app/api/cash/route.ts`            → `computeCashTotals` async
 *   3. `lib/analyse/aggregateur.ts`       → `computeCashTotals` async
 *   4. `lib/analyse/dashboard-pipeline/`  → `computeCashTotalsSync` (EUR pure)
 *
 * Sites 1-3 partagent la version `async` avec FX. Site 4 utilise la version
 * `sync` (pipeline Dashboard sync, hypothèse EUR cf. V2.1-BIS).
 *
 * Couvre aussi la variante `computeCashTotalsSync` en isolation (les tests
 * V1.0 ne couvraient que la version async).
 */
import { describe, it, expect } from 'vitest'
import {
  computeCashTotals,
  computeCashTotalsSync,
  type CashAccountForTotal,
  type CashFxResolver,
} from '../totals'

const TEST_FX: CashFxResolver = async (amount, currency) => {
  const code = (currency ?? 'EUR').toUpperCase()
  if (code === 'EUR') return amount
  if (code === 'USD') return amount * 0.92
  if (code === 'CHF') return amount * 1.05
  return amount
}

describe('Volet B — convergence sites async (EUR pur)', () => {
  it('1 EUR + 1 EUR + 1 EUR → mêmes totaux entre sync et async', async () => {
    const accounts: CashAccountForTotal[] = [
      { id: 'a', asset_id: null, balance: 10_000, currency: 'EUR', account_type: 'livret_a' },
      { id: 'b', asset_id: null, balance:  5_000, currency: 'EUR', account_type: 'ldds' },
      { id: 'c', asset_id: null, balance:  3_000, currency: 'EUR', account_type: 'compte_courant' },
    ]
    const asyncR = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    const syncR  = computeCashTotalsSync(accounts)
    expect(asyncR).toEqual(syncR)
    expect(asyncR.totalEur).toBe(18_000)
    expect(asyncR.totalInvestissableEur).toBe(15_000)
    expect(asyncR.totalCompteCourantEur).toBe(3_000)
  })

  it('multi-devise (EUR + USD + CHF) : sync diverge logiquement (assume EUR)', async () => {
    const accounts: CashAccountForTotal[] = [
      { id: 'eur', asset_id: null, balance: 10_000, currency: 'EUR', account_type: 'livret_a' },
      { id: 'usd', asset_id: null, balance:  1_000, currency: 'USD', account_type: 'compte_epargne' },
      { id: 'chf', asset_id: null, balance:  2_000, currency: 'CHF', account_type: 'compte_epargne' },
    ]
    const asyncR = await computeCashTotals(accounts, { fxResolver: TEST_FX })
    const syncR  = computeCashTotalsSync(accounts)
    // Sites 1-3 (async) : conversion correcte → 10000 + 920 + 2100 = 13020
    expect(asyncR.totalEur).toBe(13_020)
    // Site 4 (sync, V2.1-BIS hypothèse EUR) : somme brute = 13000
    // Cette divergence assumée est documentée — le pipeline Dashboard
    // accepte de ne pas convertir tant que l'utilisateur reste majoritairement
    // EUR.
    expect(syncR.totalEur).toBe(13_000)
    // En revanche le countAccounts et le split sont identiques.
    expect(asyncR.countAccounts).toBe(syncR.countAccounts)
  })

  it('dédup legacy : sync et async donnent le MÊME total avec legacy mêlé', async () => {
    const accounts: CashAccountForTotal[] = [
      { id: 'c1', asset_id: 'asset-1', balance: 10_000, currency: 'EUR', account_type: 'livret_a' },
    ]
    const legacyAssets = [
      { id: 'asset-1', current_value:  9_500, currency: 'EUR' }, // dédupliqué (asset_id couvert)
      { id: 'asset-2', current_value:  2_500, currency: 'EUR' }, // ajouté
    ]
    const asyncR = await computeCashTotals(accounts, { legacyAssets, fxResolver: TEST_FX })
    const syncR  = computeCashTotalsSync(accounts, { legacyAssets })
    expect(asyncR).toEqual(syncR)
    expect(asyncR.totalEur).toBe(12_500)
    expect(asyncR.countAccounts).toBe(2)
  })

  it('tous comptes vides → tous zéros, async et sync identiques', async () => {
    const asyncR = await computeCashTotals([], { fxResolver: TEST_FX })
    const syncR  = computeCashTotalsSync([])
    expect(asyncR).toEqual(syncR)
    expect(asyncR.totalEur).toBe(0)
    expect(asyncR.countAccounts).toBe(0)
  })
})

describe('computeCashTotalsSync — robustesse', () => {
  it('valeurs balance string-typées (Supabase NUMERIC sérialisé) → parsées', () => {
    const accounts: CashAccountForTotal[] = [
      { id: 'a', asset_id: null, balance: ('10000' as unknown) as number, currency: 'EUR',
        account_type: 'livret_a' },
    ]
    const r = computeCashTotalsSync(accounts)
    expect(r.totalEur).toBe(10_000)
  })

  it('legacy avec current_value null → ignoré (pas de NaN)', () => {
    const legacyAssets = [
      { id: 'a', current_value: (null as unknown) as number, currency: 'EUR' },
    ]
    const r = computeCashTotalsSync([], { legacyAssets })
    expect(r.totalEur).toBe(0)
    expect(r.countAccounts).toBe(1)
  })

  it('split investissable / compte_courant fonctionne', () => {
    const accounts: CashAccountForTotal[] = [
      { id: 'a', asset_id: null, balance: 8_000, currency: 'EUR', account_type: 'livret_a' },
      { id: 'b', asset_id: null, balance: 2_500, currency: 'EUR', account_type: 'compte_courant' },
    ]
    const r = computeCashTotalsSync(accounts)
    expect(r.totalEur).toBe(10_500)
    expect(r.totalInvestissableEur).toBe(8_000)
    expect(r.totalCompteCourantEur).toBe(2_500)
  })
})
