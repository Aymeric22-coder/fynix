/**
 * Tests : detectDriftAlerts
 *  - aucune alerte si no_data
 *  - rent_below_target / rent_above_target
 *  - charges_overrun avec sévérité critique
 *  - cashflow_drift cumulé
 *  - no_loan_payment quand simulated > 0 et actual = 0
 *  - tri par sévérité
 *  - seuils customisables
 */

import { describe, it, expect } from 'vitest'
import { detectDriftAlerts } from '../insights'
import type { ComparisonResult, YearComparison } from '../compare'

// ─── Helper ──────────────────────────────────────────────────────────

function makeYearComparison(year: number, p: Partial<YearComparison> = {}): YearComparison {
  const defaults: YearComparison = {
    year,
    simYearIndex: 1,
    rent:      { simulated: 0, actual: 0, variance: 0, variancePct: null },
    charges:   { simulated: 0, actual: 0, variance: 0, variancePct: null },
    loan:      { simulated: 0, actual: 0, variance: 0, variancePct: null },
    cashFlow:  { simulated: 0, actual: 0, variance: 0, variancePct: null },
    valuation: { simulated: 0, actual: null, variance: null, variancePct: null },
  }
  return { ...defaults, ...p }
}

function makeComparison(years: YearComparison[], totalsOverride: Partial<ComparisonResult['totals']> = {}, status: ComparisonResult['status'] = 'tracked'): ComparisonResult {
  return {
    years,
    totals: {
      rentVariance:     years.reduce((s, y) => s + y.rent.variance, 0),
      chargesVariance:  years.reduce((s, y) => s + y.charges.variance, 0),
      loanVariance:     years.reduce((s, y) => s + y.loan.variance, 0),
      cashFlowVariance: years.reduce((s, y) => s + y.cashFlow.variance, 0),
      ...totalsOverride,
    },
    status,
    elapsedYears: years.length,
    trackedYears: years.length,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('detectDriftAlerts — no_data', () => {
  it('renvoie [] si status no_data', () => {
    const c = makeComparison([], {}, 'no_data')
    expect(detectDriftAlerts(c)).toEqual([])
  })
})

describe('detectDriftAlerts — loyers', () => {

  it('signale rent_below_target avec severity warning si écart > 10 % et > 500 €', () => {
    const y = makeYearComparison(2025, {
      rent: { simulated: 12_000, actual: 10_000, variance: -2_000, variancePct: -16.67 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    const r = alerts.find((a) => a.type === 'rent_below_target')
    expect(r).toBeDefined()
    expect(r!.severity).toBe('warning')
    expect(r!.year).toBe(2025)
    expect(r!.impactEUR).toBe(-2_000)
  })

  it('escalade en critical si écart >= 25 %', () => {
    const y = makeYearComparison(2025, {
      rent: { simulated: 12_000, actual: 8_000, variance: -4_000, variancePct: -33.33 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts.find((a) => a.type === 'rent_below_target')!.severity).toBe('critical')
  })

  it('signale rent_above_target en info (pas alarmant)', () => {
    const y = makeYearComparison(2025, {
      rent: { simulated: 12_000, actual: 13_500, variance: 1_500, variancePct: 12.5 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    const r = alerts.find((a) => a.type === 'rent_above_target')
    expect(r).toBeDefined()
    expect(r!.severity).toBe('info')
  })

  it('aucune alerte si écart < seuils', () => {
    const y = makeYearComparison(2025, {
      rent: { simulated: 12_000, actual: 12_300, variance: 300, variancePct: 2.5 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts.find((a) => a.type === 'rent_below_target' || a.type === 'rent_above_target')).toBeUndefined()
  })
})

describe('detectDriftAlerts — charges', () => {

  it('signale charges_overrun en warning (1500 € de dépassement à 50 %)', () => {
    const y = makeYearComparison(2025, {
      charges: { simulated: 3_000, actual: 4_500, variance: 1_500, variancePct: 50 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    const c = alerts.find((a) => a.type === 'charges_overrun')
    expect(c).toBeDefined()
    // Logique AND : 50 % critique mais 1500 € < 3000 € → warning seulement
    expect(c!.severity).toBe('warning')
    expect(c!.impactEUR).toBe(-1_500)
  })

  it('escalade charges_overrun en critical si écart >= 3000 € ET >= 25 %', () => {
    const y = makeYearComparison(2025, {
      charges: { simulated: 5_000, actual: 9_000, variance: 4_000, variancePct: 80 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts.find((a) => a.type === 'charges_overrun')!.severity).toBe('critical')
  })

  it('signale charges_below_target en info', () => {
    const y = makeYearComparison(2025, {
      charges: { simulated: 3_000, actual: 2_000, variance: -1_000, variancePct: -33.33 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    const c = alerts.find((a) => a.type === 'charges_below_target')
    expect(c).toBeDefined()
    expect(c!.severity).toBe('info')
  })
})

describe('detectDriftAlerts — cashflow_drift cumulé', () => {

  it('signale cashflow_drift négatif quand cumul < -seuil', () => {
    const y1 = makeYearComparison(2024, { cashFlow: { simulated: 2_000, actual: 1_000, variance: -1_000, variancePct: -50 } })
    const y2 = makeYearComparison(2025, { cashFlow: { simulated: 2_100, actual:    500, variance: -1_600, variancePct: -76 } })
    const alerts = detectDriftAlerts(makeComparison([y1, y2]))
    const cf = alerts.find((a) => a.type === 'cashflow_drift')
    expect(cf).toBeDefined()
    expect(cf!.severity).toBe('warning')
    expect(cf!.impactEUR).toBe(-2_600)
  })

  it('aucune alerte cashflow_drift si cumul < seuil €', () => {
    const y = makeYearComparison(2025, { cashFlow: { simulated: 1_000, actual: 800, variance: -200, variancePct: -20 } })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts.find((a) => a.type === 'cashflow_drift')).toBeUndefined()
  })
})

describe('detectDriftAlerts — mensualité crédit', () => {

  it('signale no_loan_payment si simulated > 0 et actual = 0', () => {
    const y = makeYearComparison(2025, { loan: { simulated: 7_000, actual: 0, variance: -7_000, variancePct: -100 } })
    const alerts = detectDriftAlerts(makeComparison([y]))
    const noPayment = alerts.find((a) => a.type === 'no_loan_payment')
    expect(noPayment).toBeDefined()
    expect(noPayment!.severity).toBe('warning')
    expect(noPayment!.title).toContain('2025')
  })
})

describe('detectDriftAlerts — valorisation', () => {

  it('signale valuation_depreciation en warning si dérapage modéré', () => {
    // Pour rester en warning : pct >= 10 mais < 25, et eur >= 500 mais < 3000
    const y = makeYearComparison(2025, {
      valuation: { simulated: 220_000, actual: 218_000, variance: -2_000, variancePct: -10.5 },
    })
    // Avec les seuils par défaut (eur 500/3000, pct 10/25) : 2000 € + 10.5 % = warning
    const alerts = detectDriftAlerts(makeComparison([y]), {
      pctThreshold: 10, eurThreshold: 500,
      criticalPctThreshold: 25, criticalEurThreshold: 3_000,
    })
    const v = alerts.find((a) => a.type === 'valuation_depreciation')
    expect(v).toBeDefined()
    expect(v!.severity).toBe('warning')
  })

  it('escalade en critical pour une dépréciation forte', () => {
    const y = makeYearComparison(2025, {
      valuation: { simulated: 220_000, actual: 150_000, variance: -70_000, variancePct: -31.8 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts.find((a) => a.type === 'valuation_depreciation')!.severity).toBe('critical')
  })

  it('signale valuation_appreciation en info', () => {
    const y = makeYearComparison(2025, {
      valuation: { simulated: 220_000, actual: 260_000, variance: 40_000, variancePct: 18.18 },
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts.find((a) => a.type === 'valuation_appreciation')!.severity).toBe('info')
  })
})

describe('detectDriftAlerts — tri & seuils', () => {

  it('trie critical avant warning avant info', () => {
    const y = makeYearComparison(2025, {
      rent:    { simulated: 12_000, actual:  6_000, variance: -6_000, variancePct: -50 },   // critical
      charges: { simulated:  3_000, actual:  3_700, variance:    700, variancePct: 23.3 },  // warning
      loan:    { simulated:  7_000, actual:  7_700, variance:    700, variancePct: 10 },    // info
    })
    const alerts = detectDriftAlerts(makeComparison([y]))
    expect(alerts[0]!.severity).toBe('critical')
    // Warning avant info dans le reste
    const sevs = alerts.map((a) => a.severity)
    const warnIdx = sevs.indexOf('warning')
    const infoIdx = sevs.indexOf('info')
    if (warnIdx !== -1 && infoIdx !== -1) {
      expect(warnIdx).toBeLessThan(infoIdx)
    }
  })

  it('thresholds customisables — seuil bas révèle plus d\'alertes', () => {
    const y = makeYearComparison(2025, {
      rent: { simulated: 1_000, actual: 850, variance: -150, variancePct: -15 },
    })
    const defaultAlerts  = detectDriftAlerts(makeComparison([y]))
    const lowAlerts      = detectDriftAlerts(makeComparison([y]), {
      pctThreshold: 5, eurThreshold: 100,
      criticalPctThreshold: 30, criticalEurThreshold: 5_000,
    })
    expect(defaultAlerts.find((a) => a.type === 'rent_below_target')).toBeUndefined()
    expect(lowAlerts.find((a) => a.type === 'rent_below_target')).toBeDefined()
  })

  it('signale partial_tracking si plus d\'une année non suivie', () => {
    const y = makeYearComparison(2025)
    const c: ComparisonResult = {
      ...makeComparison([y]),
      status: 'partial',
      elapsedYears: 3,
      trackedYears: 1,
    }
    const alerts = detectDriftAlerts(c)
    expect(alerts.find((a) => a.type === 'partial_tracking')).toBeDefined()
  })
})
