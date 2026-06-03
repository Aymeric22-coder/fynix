/**
 * Spec V1.1 — Taux moyen pondéré sur la fixture `hnw-complexe` enrichie.
 *
 * Vérifie deux invariants ferment le gap V1.0 :
 *   1. La fixture multi-livrets, une fois branchée sur `computeCashYield`,
 *      produit le taux moyen pondéré attendu (≠ constante 3 %).
 *   2. Le pipeline Dashboard (`computeDashboardData`) reste fonctionnel
 *      sur cette fixture enrichie — aucune assertion existante ne casse.
 */
import { describe, it, expect } from 'vitest'
import { ALL_FIXTURES } from '../fixtures'
import { computeDashboardData } from '@/lib/analyse/dashboard-pipeline'
import { computeCashYield } from '@/lib/cash/rendement'

describe('hnw-complexe — taux moyen pondéré multi-livrets (V1.1)', () => {
  const hnw = ALL_FIXTURES.find((f) => f.id === 'hnw-complexe')!

  it('cashAccounts présents et conformes au brief V1.1', () => {
    expect(hnw.inputs.cashAccounts).toBeDefined()
    expect(hnw.inputs.cashAccounts).toHaveLength(4)
    const balances = hnw.inputs.cashAccounts!.map((a) => a.balance)
    expect(balances).toEqual([22_950, 12_000, 10_000, 8_000])
    const rates = hnw.inputs.cashAccounts!.map((a) => a.interest_rate)
    expect(rates).toEqual([3.0, 3.0, 4.0, 1.5])
    const totalBalance = balances.reduce<number>((s, b) => s + Number(b ?? 0), 0)
    expect(totalBalance).toBe(52_950)
  })

  it('taux moyen pondéré ≈ 2,96 % (et NON 3 % de la constante)', async () => {
    const accounts = hnw.inputs.cashAccounts!.map((a) => ({
      balance:       a.balance as number,
      currency:      a.currency as string,
      interest_rate: a.interest_rate as number,
    }))
    const yieldResult = await computeCashYield(accounts)
    // Σ intérêts = 22950×0,03 + 12000×0,03 + 10000×0,04 + 8000×0,015
    //            = 688,50 + 360 + 400 + 120 = 1 568,50 €
    expect(yieldResult.interetsAnnuelsTotalEur).toBeCloseTo(1_568.50, 2)
    // Taux moyen = 1568,50 / 52950 ≈ 0,029622 = 2,96 %
    expect(yieldResult.tauxMoyenPondereDecimal).toBeCloseTo(0.0296, 3)
    expect(yieldResult.tauxMoyenPonderePourcent).toBeCloseTo(2.96, 1)
    // Et différent de la constante historique 3 % (preuve du fix C14).
    expect(yieldResult.tauxMoyenPondereDecimal).toBeLessThan(0.03)
  })

  it('pipeline Dashboard reste fonctionnel sur la fixture enrichie', () => {
    // Régression sentinel : `expected.grossValueMVStrict` historique = 3 450 000.
    // L'enrichissement passe par `cashAccounts` qui dédupent a-livret-a / a-ldds
    // SANS modifier `assets[].current_value` → brut KPI inchangé.
    const data = computeDashboardData(hnw.inputs)
    expect(data.kpis.gross_value).toBe(3_450_000)
    // cashSummary reflète maintenant les cashAccounts (dédup + LEP + CEL ajoutés)
    expect(data.cashSummary.totalEur).toBe(52_950)
    expect(data.cashSummary.accountsCount).toBe(4)
  })
})
