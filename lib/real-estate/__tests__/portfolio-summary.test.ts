import { describe, it, expect } from 'vitest'
import {
  computePortfolioSummary,
  type PropertySummary,
} from '../portfolio-summary'
import type { PropertyUsageType } from '@/types/database.types'
import type { FiscalRegimeKind } from '../types'

function mk(p: Partial<PropertySummary> & { id: string; name: string }): PropertySummary {
  return {
    id:                  p.id,
    name:                p.name,
    city:                p.city ?? null,
    usageType:           p.usageType  ?? ('long_term_rental' as PropertyUsageType),
    // Si la cle est presente (meme avec null) on prefere la valeur fournie
    fiscalRegime:        ('fiscalRegime' in p ? p.fiscalRegime : 'lmnp_reel') as FiscalRegimeKind | null,
    currentValue:        p.currentValue        ?? 0,
    totalCost:           p.totalCost           ?? 0,
    remainingCapital:    p.remainingCapital    ?? 0,
    netWorth:            (p.currentValue ?? 0) - (p.remainingCapital ?? 0),
    latentCapitalGain:   (p.currentValue ?? 0) - (p.totalCost ?? 0),
    monthlyRent:         p.monthlyRent         ?? 0,
    monthlyCharges:      p.monthlyCharges      ?? 0,
    monthlyLoanPayment:  p.monthlyLoanPayment  ?? 0,
    monthlyNetCashFlow:  p.monthlyNetCashFlow  ?? 0,
    grossYieldPct:       p.grossYieldPct       ?? 0,
    netNetYieldPct:      p.netNetYieldPct      ?? 0,
    hasAlerts:           p.hasAlerts           ?? false,
    alertCount:          p.alertCount          ?? 0,
    isShortTerm:         p.isShortTerm         ?? false,
    // V11 — propagation du résumé impayés (optionnel).
    ...(p.unpaidRent ? { unpaidRent: p.unpaidRent } : {}),
  }
}

describe('computePortfolioSummary', () => {
  it('Test 1 — portefeuille vide : tous les totaux a 0', () => {
    const s = computePortfolioSummary([])
    expect(s.totalProperties).toBe(0)
    expect(s.byUsageType).toEqual({
      primaryResidence: 0, secondaryResidence: 0,
      longTermRental: 0, shortTermRental: 0, mixedUse: 0,
    })
    expect(s.totalCurrentValue).toBe(0)
    expect(s.totalAcquisitionCost).toBe(0)
    expect(s.totalRemainingCapital).toBe(0)
    expect(s.totalNetWorth).toBe(0)
    expect(s.totalLatentGain).toBe(0)
    expect(s.totalLatentGainPct).toBe(0)
    expect(s.totalMonthlyRent).toBe(0)
    expect(s.totalMonthlyCashFlow).toBe(0)
    expect(s.weightedGrossYieldPct).toBe(0)
    expect(s.weightedNetNetYieldPct).toBe(0)
    expect(s.loanToValuePct).toBe(0)
    expect(s.debtServiceRatioPct).toBe(0)
    expect(s.alerts).toEqual([])
  })

  it('Test 2 — 1 seul bien locatif : totaux = valeurs + weightedGross = grossYield du bien', () => {
    const p = mk({
      id: 'p1', name: 'Studio',
      currentValue: 200_000, totalCost: 220_000,
      monthlyRent: 800, monthlyNetCashFlow: 150,
      grossYieldPct: 4.36, netNetYieldPct: 2.5,
    })
    const s = computePortfolioSummary([p])
    expect(s.totalProperties).toBe(1)
    expect(s.totalCurrentValue).toBe(200_000)
    expect(s.totalAcquisitionCost).toBe(220_000)
    expect(s.totalMonthlyRent).toBe(800)
    expect(s.totalMonthlyCashFlow).toBe(150)
    expect(s.weightedGrossYieldPct).toBeCloseTo(4.36, 2)
    expect(s.weightedNetNetYieldPct).toBeCloseTo(2.5, 2)
    expect(s.byUsageType.longTermRental).toBe(1)
  })

  it('Test 3 — 2 biens rendements pondérés par totalCost', () => {
    // A : prix 200k, rdt 5 % ; B : prix 100k, rdt 7 %
    // Attendu : (5×200 + 7×100) / 300 = 5,67 %
    const a = mk({ id: 'a', name: 'A', totalCost: 200_000, grossYieldPct: 5,  netNetYieldPct: 2 })
    const b = mk({ id: 'b', name: 'B', totalCost: 100_000, grossYieldPct: 7,  netNetYieldPct: 4 })
    const s = computePortfolioSummary([a, b])
    expect(s.weightedGrossYieldPct).toBeCloseTo(5.67, 2)
    // (2×200 + 4×100) / 300 = 800/300 = 2.667
    expect(s.weightedNetNetYieldPct).toBeCloseTo(2.667, 2)
  })

  it('Test 4 — LTV > 85 % => alerte high_debt_ratio', () => {
    const p = mk({
      id: 'p1', name: 'Bien endette',
      currentValue: 300_000, remainingCapital: 260_000, totalCost: 290_000,
    })
    const s = computePortfolioSummary([p])
    expect(s.loanToValuePct).toBeCloseTo(86.67, 2)
    const ltvAlert = s.alerts.find(a => a.kind === 'high_debt_ratio')
    expect(ltvAlert).toBeDefined()
    expect(ltvAlert!.severity).toBe('warning')
  })

  it('Test 5 — cash-flow global negatif => savingsEffort > 0', () => {
    const a = mk({ id: 'a', name: 'A', monthlyNetCashFlow:  500 })
    const b = mk({ id: 'b', name: 'B', monthlyNetCashFlow: -700 })
    const s = computePortfolioSummary([a, b])
    expect(s.totalMonthlyCashFlow).toBe(-200)
    expect(s.totalMonthlySavingsEffort).toBe(200)
    // Bien B genere une alerte negative_cashflow (< -100 EUR)
    const cfAlert = s.alerts.find(a => a.kind === 'negative_cashflow')
    expect(cfAlert).toBeDefined()
    expect(cfAlert!.propertyId).toBe('b')
  })

  it('Test 6 — regime fiscal manquant => alerte avec actionUrl /edit', () => {
    const p = mk({
      id: 'p1', name: 'Sans regime',
      fiscalRegime: null,
      usageType: 'long_term_rental',
    })
    const s = computePortfolioSummary([p])
    const alert = s.alerts.find(a => a.kind === 'fiscal_regime_missing')
    expect(alert).toBeDefined()
    expect(alert!.actionUrl).toBe('/immobilier/p1/edit')
    expect(alert!.actionLabel).toBe('Compléter')
  })

  it('Test 6b — regime manquant sur RP => PAS d\'alerte (locatif uniquement)', () => {
    const p = mk({
      id: 'p1', name: 'RP',
      fiscalRegime: null,
      usageType: 'primary_residence',
    })
    const s = computePortfolioSummary([p])
    expect(s.alerts.filter(a => a.kind === 'fiscal_regime_missing')).toEqual([])
  })

  it('Test 7 — RP exclue des loyers ; mensualite RP impacte le CF global', () => {
    const rp = mk({
      id: 'rp', name: 'Maison RP', usageType: 'primary_residence',
      currentValue: 350_000, totalCost: 350_000,
      monthlyRent: 0, monthlyLoanPayment: 1_200,
      monthlyNetCashFlow: 0,
    })
    const loc = mk({
      id: 'loc', name: 'Studio', usageType: 'long_term_rental',
      currentValue: 100_000, totalCost: 100_000,
      monthlyRent: 800, monthlyLoanPayment: 600,
      monthlyNetCashFlow: 150,
    })
    const s = computePortfolioSummary([rp, loc])
    // Loyers : seulement le locatif
    expect(s.totalMonthlyRent).toBe(800)
    // Mensualites : RP + locatif
    expect(s.totalMonthlyLoan).toBe(1_800)
    // CF global = CF locatif (150) - mensualite RP (1200) = -1050
    expect(s.totalMonthlyCashFlow).toBe(-1_050)
    expect(s.totalAnnualCashFlow).toBe(-12_600)
    expect(s.totalMonthlySavingsEffort).toBe(1_050)
  })

  it('byUsageType compte correctement les 5 types', () => {
    const props = [
      mk({ id: '1', name: 'RP',   usageType: 'primary_residence'   }),
      mk({ id: '2', name: 'RP2',  usageType: 'primary_residence'   }),
      mk({ id: '3', name: 'Sec',  usageType: 'secondary_residence' }),
      mk({ id: '4', name: 'LT',   usageType: 'long_term_rental'    }),
      mk({ id: '5', name: 'ST',   usageType: 'short_term_rental'   }),
      mk({ id: '6', name: 'Mix',  usageType: 'mixed_use'           }),
    ]
    const s = computePortfolioSummary(props)
    expect(s.byUsageType).toEqual({
      primaryResidence:   2,
      secondaryResidence: 1,
      longTermRental:     1,
      shortTermRental:    1,
      mixedUse:           1,
    })
    expect(s.totalProperties).toBe(6)
  })

  it('DSCR > 100 % => alerte critical (mensualites > loyers bruts)', () => {
    const p = mk({
      id: 'p1', name: 'Saturé',
      currentValue: 100_000, remainingCapital: 50_000,
      monthlyRent: 500, monthlyLoanPayment: 700,
    })
    const s = computePortfolioSummary([p])
    expect(s.debtServiceRatioPct).toBe(140)
    const dscrAlert = s.alerts.find(a => a.message.includes('DSCR'))
    expect(dscrAlert).toBeDefined()
    expect(dscrAlert!.severity).toBe('critical')
  })

  it('alertes triees par severite : critical -> warning -> info', () => {
    const props = [
      mk({ id: 'a', name: 'A',
        fiscalRegime: null, usageType: 'long_term_rental' }), // warning
      // V11 — Le source d'alerte info est désormais `unpaidRent` (≥ 1 event
      // < 30 j). Le bloc `under_rent` historique sur `alertCount` a été
      // désactivé (faux émetteur, à rebrancher avec vrai signal marché).
      mk({ id: 'b', name: 'B', unpaidRent: {
        count: 1, totalEur: 650, daysSinceOldest: 5, severity: 'info',
      } }),
      mk({ id: 'c', name: 'C',
        currentValue: 100_000, remainingCapital: 50_000,
        monthlyRent: 500, monthlyLoanPayment: 700 }), // critical DSCR
    ]
    const s = computePortfolioSummary(props)
    const severities = s.alerts.map(a => a.severity)
    // Verifie que critical apparait avant warning et info
    const firstCritical = severities.indexOf('critical')
    const firstWarning  = severities.indexOf('warning')
    const firstInfo     = severities.indexOf('info')
    if (firstCritical >= 0 && firstWarning >= 0) {
      expect(firstCritical).toBeLessThan(firstWarning)
    }
    if (firstWarning >= 0 && firstInfo >= 0) {
      expect(firstWarning).toBeLessThan(firstInfo)
    }
  })

  // ─── V11 — kind 'unpaid_rent' propagé jusqu'au bandeau ───────────────────

  describe('V11 — PortfolioAlert kind:unpaid_rent', () => {
    it('bien sans unpaidRent : aucune alerte unpaid_rent générée', () => {
      const p = mk({ id: 'p1', name: 'Bien sans impayé' })
      const s = computePortfolioSummary([p])
      expect(s.alerts.find(a => a.kind === 'unpaid_rent')).toBeUndefined()
    })

    it('bien avec unpaidRent severity=info : push 1 alerte info', () => {
      const p = mk({ id: 'p1', name: 'Tandoori', unpaidRent: {
        count: 1, totalEur: 650, daysSinceOldest: 12, severity: 'info',
      } })
      const s = computePortfolioSummary([p])
      const a = s.alerts.find(x => x.kind === 'unpaid_rent')
      expect(a).toBeDefined()
      expect(a!.severity).toBe('info')
      expect(a!.propertyId).toBe('p1')
      expect(a!.propertyName).toBe('Tandoori')
      expect(a!.amount).toBe(650)
      expect(a!.actionUrl).toBe('/immobilier/p1')
    })

    it('message contient le total positif formaté + nb events + ancienneté', () => {
      const p = mk({ id: 'p1', name: 'Bien', unpaidRent: {
        count: 2, totalEur: 1300, daysSinceOldest: 45, severity: 'warning',
      } })
      const s = computePortfolioSummary([p])
      const a = s.alerts.find(x => x.kind === 'unpaid_rent')!
      expect(a.message).toContain('2 loyers impayés')
      expect(a.message).toContain('1 300')   // formatage FR : espace insécable narrow
      expect(a.message).toContain('45 jours')
    })

    it('singulier vs pluriel : "1 loyer impayé" puis "2 loyers impayés"', () => {
      const p1 = mk({ id: 'p1', name: 'A', unpaidRent: {
        count: 1, totalEur: 650, daysSinceOldest: 5, severity: 'info',
      } })
      const p2 = mk({ id: 'p2', name: 'B', unpaidRent: {
        count: 3, totalEur: 1950, daysSinceOldest: 90, severity: 'critical',
      } })
      const s = computePortfolioSummary([p1, p2])
      const aP1 = s.alerts.find(a => a.kind === 'unpaid_rent' && a.propertyId === 'p1')!
      const aP2 = s.alerts.find(a => a.kind === 'unpaid_rent' && a.propertyId === 'p2')!
      expect(aP1.message).toContain('1 loyer impayé')
      expect(aP1.message).not.toContain('loyers')
      expect(aP2.message).toContain('3 loyers impayés')
    })

    it('label ancienneté : aujourd\'hui / hier / "il y a N jours"', () => {
      const today = mk({ id: 'p1', name: 'A', unpaidRent: {
        count: 1, totalEur: 650, daysSinceOldest: 0, severity: 'info',
      } })
      const yest = mk({ id: 'p2', name: 'B', unpaidRent: {
        count: 1, totalEur: 650, daysSinceOldest: 1, severity: 'info',
      } })
      const older = mk({ id: 'p3', name: 'C', unpaidRent: {
        count: 1, totalEur: 650, daysSinceOldest: 15, severity: 'info',
      } })
      const s = computePortfolioSummary([today, yest, older])
      const find = (id: string) => s.alerts.find(a => a.kind === 'unpaid_rent' && a.propertyId === id)!
      expect(find('p1').message).toContain('aujourd\'hui')
      expect(find('p2').message).toContain('hier')
      expect(find('p3').message).toContain('il y a 15 jours')
    })

    it('critical unpaid_rent + warning fiscal : critical en tête après tri', () => {
      const a = mk({ id: 'a', name: 'A', fiscalRegime: null }) // warning
      const b = mk({ id: 'b', name: 'B', unpaidRent: {
        count: 3, totalEur: 1950, daysSinceOldest: 90, severity: 'critical',
      } })
      const s = computePortfolioSummary([a, b])
      expect(s.alerts[0]!.severity).toBe('critical')
      expect(s.alerts[0]!.kind).toBe('unpaid_rent')
    })

    it('V11 — bloc under_rent désactivé : alertCount > 0 sans unpaidRent ne pousse rien', () => {
      // Avant V11, `hasAlerts:true, alertCount:1` poussait un kind 'under_rent'
      // — désactivé désormais (faux émetteur). On vérifie l'absence.
      const p = mk({ id: 'p1', name: 'A', hasAlerts: true, alertCount: 2 })
      const s = computePortfolioSummary([p])
      expect(s.alerts.find(a => a.kind === 'under_rent')).toBeUndefined()
    })
  })
})
