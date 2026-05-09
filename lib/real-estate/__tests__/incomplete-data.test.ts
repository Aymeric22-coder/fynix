/**
 * Tests : runSimulation gracieux face aux données incomplètes.
 * Cas typiques : crédit DB pas encore complété (start_date null, taux null, etc.)
 */

import { describe, it, expect } from 'vitest'
import { runSimulation } from '..'
import type { RawSimulationInput } from '../types'

const BASE_RAW: RawSimulationInput = {
  property: {
    purchasePrice:    150_000,
    notaryFees:       12_000,
    worksAmount:      0,
    propertyIndexPct: 1.0,
  },
  rent: {
    monthlyRent:    900,
    vacancyMonths:  0,
    rentalIndexPct: 2.0,
  },
  charges: {
    pno: 350, gliPct: 0, propertyTax: 1200, cfe: 0, accountant: 0,
    condoFees: 0, managementPct: 0, maintenance: 0, other: 0,
    chargesIndexPct: 2.0,
  },
  regime: { kind: 'foncier_nu', tmiPct: 30 },
  downPayment: 20_000,
  horizonYears: 25,
}

describe('runSimulation — données incomplètes', () => {

  it('marque incomplet si le crédit a un principal mais pas de taux', () => {
    const r = runSimulation({
      ...BASE_RAW,
      loan: { principal: 130_000 },   // pas d'annualRatePct, pas de durationYears
    })
    expect(r.incompleteData).toBe(true)
    expect(r.missingFields).toContain('loan.annualRatePct')
    expect(r.missingFields).toContain('loan.durationYears')
    expect(r.projection).toEqual([])
    expect(r.amortization).toBeNull()
  })

  it('marque incomplet si le crédit a un taux mais pas de durée ni de principal', () => {
    const r = runSimulation({
      ...BASE_RAW,
      loan: { annualRatePct: 3.5 },
    })
    expect(r.incompleteData).toBe(true)
    expect(r.missingFields).toContain('loan.principal')
    expect(r.missingFields).toContain('loan.durationYears')
  })

  it('marque incomplet si la durée est 0', () => {
    const r = runSimulation({
      ...BASE_RAW,
      loan: { principal: 130_000, annualRatePct: 3, durationYears: 0 },
    })
    expect(r.incompleteData).toBe(true)
    expect(r.missingFields).toContain('loan.durationYears')
  })

  it('renvoie des KPIs nuls (et non NaN/Infinity) en mode incomplet', () => {
    const r = runSimulation({
      ...BASE_RAW,
      loan: { principal: 130_000 },
    })
    expect(r.kpis.totalCost).toBe(0)
    expect(r.kpis.monthlyPayment).toBe(0)
    expect(r.kpis.grossYieldOnPrice).toBe(0)
    expect(r.kpis.monthlyCashFlowYear1).toBe(0)
    expect(r.kpis.paybackYear).toBeNull()
    // Le downPayment est conservé (utile pour l'UI)
    expect(r.kpis.downPayment).toBe(20_000)
  })

  it('marque incomplet si purchasePrice est 0 ou null', () => {
    const r = runSimulation({
      ...BASE_RAW,
      property: { ...BASE_RAW.property, purchasePrice: 0 },
    })
    expect(r.incompleteData).toBe(true)
    expect(r.missingFields).toContain('property.purchasePrice')
  })

  it('marque incomplet si TMI manque sur un régime IR-based', () => {
    const r = runSimulation({
      ...BASE_RAW,
      // @ts-expect-error - on simule un input DB partiel
      regime: { kind: 'foncier_nu' },
    })
    expect(r.incompleteData).toBe(true)
    expect(r.missingFields).toContain('regime.tmiPct')
  })

  it('NE marque PAS incomplet si pas de crédit du tout (achat cash)', () => {
    const r = runSimulation({
      ...BASE_RAW,
      // pas de loan
    })
    expect(r.incompleteData).toBeFalsy()
    expect(r.projection.length).toBeGreaterThan(0)
  })

  it('NE marque PAS incomplet si principal explicitement à 0 (cash purchase déclaré)', () => {
    const r = runSimulation({
      ...BASE_RAW,
      loan: { principal: 0 },
    })
    expect(r.incompleteData).toBeFalsy()
    expect(r.amortization).toBeNull()
  })

  it('NE marque PAS incomplet si le crédit est complet (avec start_date manquante toléré)', () => {
    // start_date n'est PAS critique : runSimulation peut toujours projeter
    // (capital restant dû à date n'est juste plus précis)
    const r = runSimulation({
      ...BASE_RAW,
      loan: {
        principal: 130_000,
        annualRatePct: 3.5,
        durationYears: 20,
        // pas de startDate, pas d'insuranceRatePct (default 0)
      },
    })
    expect(r.incompleteData).toBeFalsy()
    expect(r.projection.length).toBeGreaterThan(0)
  })

  it('ne crash jamais sur un input avec uniquement des null/0 partout', () => {
    const empty: RawSimulationInput = {
      property: { purchasePrice: 0, notaryFees: 0, worksAmount: 0, propertyIndexPct: 0 },
      rent:     { monthlyRent: 0, vacancyMonths: 0, rentalIndexPct: 0 },
      charges:  {
        pno: 0, gliPct: 0, propertyTax: 0, cfe: 0, accountant: 0,
        condoFees: 0, managementPct: 0, maintenance: 0, other: 0, chargesIndexPct: 0,
      },
      regime:   { kind: 'foncier_nu', tmiPct: 30 },
      downPayment: 0,
      horizonYears: 5,
    }
    expect(() => runSimulation(empty)).not.toThrow()
    const r = runSimulation(empty)
    expect(r.incompleteData).toBe(true)   // purchasePrice = 0
  })
})
