import { describe, it, expect } from 'vitest'
import { computeHistoricalAnalytics } from '../historical-analytics'
import type { CashFlow } from '../analytics'

describe('computeHistoricalAnalytics avec cash flows', () => {
  it('cashFlowsCount = 0 si pas de cash flow', () => {
    const r = computeHistoricalAnalytics([
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2026-12-31', total_market_value: 1100 },
    ])
    expect(r.cashFlowsCount).toBe(0)
    expect(r.moneyWeightedReturn).toBeNull()  // pas de MWR sans flux
  })

  it('calcule un MWR distinct du TWR quand il y a un apport intermediaire', () => {
    const snapshots = [
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2026-12-31', total_market_value: 1500 },
    ]
    const flows: CashFlow[] = [
      { date: '2026-06-30', amount: 300 },  // apport de 300 en juin
    ]
    const r = computeHistoricalAnalytics(snapshots, flows)
    expect(r.cashFlowsCount).toBe(1)
    // MWR (IRR) doit etre defini et inferieur au TWR brut (50%) car
    // une partie de la valeur finale provient de l'apport tardif, pas
    // de la performance des actifs
    expect(r.moneyWeightedReturn).not.toBeNull()
    expect(r.totalReturn).not.toBeNull()
    expect(r.moneyWeightedReturn!).toBeLessThan(r.totalReturn!)
  })

  it('TWR avec cash flow neutralise correctement l\'apport (convention begin-of-period)', () => {
    // 3 snapshots : 1000 → 1200 → 1500, flow de 300 le jour du 2e snapshot
    // Convention "beginning of period" : le flow du 2026-06-30 est applique
    // au DEBUT de la periode qui se termine le 2026-06-30.
    //
    // Periode 1 (jan→jun) : start=1000+300=1300, end=1200, r=1200/1300-1=-0.0769
    // Periode 2 (jun→dec) : start=1200, end=1500, r=+0.25
    // TWR = (1 - 0.0769) * 1.25 - 1 = 0.1538
    const snapshots = [
      { snapshot_date: '2026-01-01', total_market_value: 1000 },
      { snapshot_date: '2026-06-30', total_market_value: 1200 },
      { snapshot_date: '2026-12-31', total_market_value: 1500 },
    ]
    const flows: CashFlow[] = [
      { date: '2026-06-30', amount: 300 },
    ]
    const r = computeHistoricalAnalytics(snapshots, flows)
    expect(r.totalReturn).toBeCloseTo(0.1538, 3)
    // Sans flow, le TWR aurait ete 1500/1000-1 = 0.5 → la neutralisation
    // a bien retire l'effet de l'apport
    expect(r.totalReturn!).toBeLessThan(0.5)
  })

  it('filtre les cash flows hors fenêtre de snapshots', () => {
    const snapshots = [
      { snapshot_date: '2026-06-01', total_market_value: 1000 },
      { snapshot_date: '2026-12-31', total_market_value: 1100 },
    ]
    const flows: CashFlow[] = [
      { date: '2025-12-01', amount: 500 },  // hors fenetre (avant)
      { date: '2026-08-15', amount: 100 },  // dans fenetre
      { date: '2027-01-15', amount: 200 },  // hors fenetre (apres)
    ]
    const r = computeHistoricalAnalytics(snapshots, flows)
    expect(r.cashFlowsCount).toBe(1)  // seul le flux d'aout compte
  })

  it('renvoie cashFlowsCount même si pointsCount < 2', () => {
    const r = computeHistoricalAnalytics(
      [{ snapshot_date: '2026-01-01', total_market_value: 1000 }],
      [{ date: '2026-01-01', amount: 100 }],
    )
    expect(r.pointsCount).toBe(1)
    expect(r.cashFlowsCount).toBe(1)
    expect(r.totalReturn).toBeNull()
  })
})
