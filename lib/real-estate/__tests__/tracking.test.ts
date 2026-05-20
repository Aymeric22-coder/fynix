import { describe, it, expect } from 'vitest'
import { computeTracking, type BaseAnnualData, type TrackingPeriod } from '../tracking'
import type { PropertyEvent } from '@/types/database.types'

// Base annuelle de référence pour la plupart des tests :
//   loyers 1 400 €/mois → 16 800 €/an
//   charges 210 €/mois  → 2 520 €/an
//   crédit 1 182 €/mois → 14 184 €/an
//   théorique annuel = 16 800 - 2 520 - 14 184 = +96 €
const BASE: BaseAnnualData = {
  expectedAnnualRent:        16_800,
  expectedAnnualCharges:     2_520,
  expectedAnnualLoanPayment: 14_184,
  expectedAnnualCashFlow:    96,
}

// 6 mois = 184 jours du 1er janvier 2025 (50,4 % de l'année)
const PERIOD: TrackingPeriod = {
  startDate: new Date('2025-01-01T00:00:00Z'),
  endDate:   new Date('2025-07-03T00:00:00Z'),    // 183 jours après
}

const LOTS = [
  { id: 'lot-a', name: 'Lot A', rent_amount: 700 },
  { id: 'lot-b', name: 'Lot B', rent_amount: 700 },
]

/** Helper : crée un événement test minimal. */
function evt(o: Partial<PropertyEvent> & Pick<PropertyEvent, 'kind' | 'event_date'>): PropertyEvent {
  return {
    id:              o.id ?? `evt-${Math.random()}`,
    property_id:     'prop-1',
    lot_id:          o.lot_id ?? null,
    user_id:         'u',
    kind:            o.kind,
    event_date:      o.event_date,
    period_start:    o.period_start ?? null,
    period_end:      o.period_end ?? null,
    amount_eur:      o.amount_eur ?? null,
    is_resolved:     o.is_resolved ?? false,
    resolved_date:   o.resolved_date ?? null,
    resolution_note: o.resolution_note ?? null,
    label:           o.label ?? null,
    notes:           o.notes ?? null,
    created_at:      '2025-01-01T00:00:00Z',
    updated_at:      '2025-01-01T00:00:00Z',
  }
}

describe('computeTracking — modèle base + événements', () => {
  it('Test 1 — Aucun événement : cash-flow ≈ théorique × ratio', () => {
    const r = computeTracking(BASE, [], LOTS, PERIOD)
    // 1er janvier → 3 juillet = 183 jours, ratio = 183/365 = 0,5014
    const ratio = 183 / 365
    expect(r.realizedRentPct).toBeCloseTo(50.14, 1)
    expect(r.expectedRentToDate).toBeCloseTo(16_800 * ratio, 1)
    expect(r.realizedRent).toBeCloseTo(r.expectedRentToDate, 1)
    expect(r.realCashFlowToDate).toBeCloseTo(96 * ratio, 1)
    expect(r.alerts).toHaveLength(0)
  })

  it('Test 2 — Impayé non résolu : déduit du loyer + alerte critical', () => {
    const events = [
      evt({ kind: 'rent_unpaid', lot_id: 'lot-b', event_date: '2025-03-12',
            amount_eur: -700, is_resolved: false, label: 'Loyer mars Lot B' }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.realizedRent).toBeCloseTo(r.expectedRentToDate - 700, 0)
    expect(r.realCashFlowToDate).toBeCloseTo(r.expectedCashFlowToDate - 700, 0)
    expect(r.alerts.some(a => a.kind === 'unpaid_rent' && a.severity === 'critical')).toBe(true)
  })

  it('Test 3 — Impayé résolu : pas de déduction, pas d\'alerte critical', () => {
    const events = [
      evt({ kind: 'rent_unpaid', lot_id: 'lot-b', event_date: '2025-03-12',
            amount_eur: -700, is_resolved: true, resolved_date: '2025-04-01' }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.realizedRent).toBeCloseTo(r.expectedRentToDate, 0)
    expect(r.alerts.some(a => a.kind === 'unpaid_rent')).toBe(false)
  })

  it('Test 4 — Vacance 14 jours pleins : perte = 14 × loyer journalier', () => {
    // daysBetween(2025-04-01, 2025-04-15) = 14 jours pleins (bornes incluses → diff)
    const events = [
      evt({ kind: 'vacancy', lot_id: 'lot-a', event_date: '2025-04-01',
            period_start: '2025-04-01', period_end: '2025-04-15' }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    const dailyRent = 16_800 / 365
    const expectedLoss = 14 * dailyRent
    expect(r.realizedRent).toBeCloseTo(r.expectedRentToDate - expectedLoss, 1)
    expect(r.alerts.some(a => a.kind === 'vacancy')).toBe(true)
  })

  it('Test 5 — Charge exceptionnelle 1 200 € : ajoutée aux charges', () => {
    const events = [
      evt({ kind: 'exceptional_charge', event_date: '2025-02-05',
            amount_eur: -1_200, label: 'Chaudière HS' }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.exceptionalCharges).toBeCloseTo(1_200, 1)
    expect(r.realCashFlowToDate).toBeCloseTo(r.expectedCashFlowToDate - 1_200, 0)
  })

  it('Test 6 — Remboursement assurance +800 € : augmente le cash-flow', () => {
    const events = [
      evt({ kind: 'insurance_claim', event_date: '2025-03-15',
            amount_eur: 800, label: 'Remboursement PNO' }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.totalPositiveEvents).toBe(800)
    expect(r.realCashFlowToDate).toBeCloseTo(r.expectedCashFlowToDate + 800, 0)
  })

  it('Test 7 — Drift critique : cash-flow négatif vs théorique positif → alerte', () => {
    const events = [
      evt({ kind: 'exceptional_charge', event_date: '2025-02-05', amount_eur: -2_000 }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.realCashFlowToDate).toBeLessThan(0)
    expect(r.expectedCashFlowToDate).toBeGreaterThan(0)
    expect(r.alerts.some(a => a.kind === 'negative_cashflow' && a.severity === 'critical')).toBe(true)
  })

  it('Test 8 — Événement hors fenêtre : ignoré', () => {
    const events = [
      evt({ kind: 'exceptional_charge', event_date: '2024-12-15', amount_eur: -500 }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.exceptionalCharges).toBe(0)
  })

  it('Test 9 — Multiple impayés cumulés', () => {
    const events = [
      evt({ kind: 'rent_unpaid', lot_id: 'lot-a', event_date: '2025-02-12', amount_eur: -700 }),
      evt({ kind: 'rent_unpaid', lot_id: 'lot-b', event_date: '2025-03-12', amount_eur: -700 }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.realizedRent).toBeCloseTo(r.expectedRentToDate - 1_400, 0)
  })

  it('Test 10 — Projection annuelle : extrapole la base sur le reste de l\'année', () => {
    const r = computeTracking(BASE, [], LOTS, PERIOD)
    // Projection = réel à date + théorique × (1 - ratio)
    // ≈ 0 + 96 × 1 = ≈ 96 (à un petit delta près)
    expect(r.projectedAnnualCashFlow).toBeCloseTo(96, 0)
  })

  it('Test 11 — Mapping des événements expose le nom du lot', () => {
    const events = [
      evt({ id: 'e1', kind: 'rent_unpaid', lot_id: 'lot-b',
            event_date: '2025-03-12', amount_eur: -700, label: 'Mars' }),
    ]
    const r = computeTracking(BASE, events, LOTS, PERIOD)
    expect(r.events).toHaveLength(1)
    expect(r.events[0]!.lotName).toBe('Lot B')
    expect(r.events[0]!.label).toBe('Mars')
  })
})
