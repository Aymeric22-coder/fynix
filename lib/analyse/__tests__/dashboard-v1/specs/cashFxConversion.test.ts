/**
 * Spec FX cash — conversion devise locale → EUR dans le pipeline Dashboard.
 *
 * Dette corrigée : le pipeline `computeDashboardData` est synchrone et EUR-pur
 * (`computeCashTotalsSync` + ranking `cashForTop` assimilent `balance` à de
 * l'EUR). Un compte en USD/GBP était donc compté à sa valeur faciale, créant
 * une incohérence avec `/cash` et `/analyse` qui convertissent via `toEur`.
 *
 * Correction (Approche B) : la conversion FX est appliquée dans le loader async
 * (`convertCashAccountsToEur`), AVANT le pipeline sync. `calc.ts` reste inchangé.
 *
 * Ces tests vérifient :
 *   1. un compte USD { balance: 1000 } @ USD→EUR=0.92 contribue 920 € (pas 1000)
 *   2. régression : des comptes EUR { 500 } + { 300 } donnent toujours 800 €
 */
import { describe, it, expect } from 'vitest'
import {
  computeDashboardData,
  convertCashAccountsToEur,
} from '@/lib/analyse/dashboard-pipeline'
import type {
  DashboardPipelineInputs,
  DashboardCashAccountRow,
} from '@/lib/analyse/dashboard-pipeline'

const ASOF = new Date('2026-06-02')

function makeInputs(over: Partial<DashboardPipelineInputs>): DashboardPipelineInputs {
  return {
    assets:              [],
    debts:               [],
    snapshots:           [],
    portfolioSummary: {
      totalMarketValue: 0, totalCostBasis: 0, totalCostBasisValued: 0,
      totalUnrealizedPnL: null, totalUnrealizedPnLPct: null,
      positionsCount: 0, valuedPositionsCount: 0, freshnessRatio: 0,
      allocationByClass: [],
    },
    portfolioPositions:  [],
    realEstatePortfolio: {
      properties: [], totalCapitalRemaining: 0, totalMonthlyCFYear1: 0,
    },
    cashAccounts:        [],
    envelopes:           [],
    transactionsPortefeuille: [],
    asOfDate: ASOF,
    ...over,
  }
}

function row(over: Partial<DashboardCashAccountRow>): DashboardCashAccountRow {
  return {
    id: 'c_1', asset_id: null, balance: 0, currency: 'EUR',
    account_type: 'compte_courant', interest_rate: 0, bank_name: null,
    ...over,
  }
}

/** Resolver FX déterministe pour les tests : USD → ×0.92, sinon identité. */
const fakeFx = async (amount: number, currency: string): Promise<number> => {
  const code = (currency ?? 'EUR').toUpperCase()
  if (code === 'USD') return amount * 0.92
  return amount
}

describe('FX cash — conversion devise locale → EUR (Approche B, loader async)', () => {
  it('Test 1 — compte USD { balance: 1000 } @ 0.92 contribue 920 € (pas 1000)', async () => {
    const cashAccounts = await convertCashAccountsToEur(
      [row({ id: 'c_usd', currency: 'USD', balance: 1000, account_type: 'compte_courant' })],
      fakeFx,
    )
    const data = computeDashboardData(makeInputs({ cashAccounts }))

    expect(data.cashSummary.totalEur).toBeCloseTo(920, 2)
    expect(data.cashSummary.totalEur).not.toBeCloseTo(1000, 2)
  })

  it('Test 2 — régression : comptes EUR { 500 } + { 300 } donnent toujours 800 €', async () => {
    const cashAccounts = await convertCashAccountsToEur(
      [
        row({ id: 'c_eur1', currency: 'EUR', balance: 500 }),
        row({ id: 'c_eur2', currency: 'EUR', balance: 300 }),
      ],
      fakeFx,
    )
    const data = computeDashboardData(makeInputs({ cashAccounts }))

    expect(data.cashSummary.totalEur).toBe(800)
  })
})
