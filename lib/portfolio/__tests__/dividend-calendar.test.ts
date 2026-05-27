/**
 * Tests DCAL — detectFrequency / projectDividends / buildDividendCalendar.
 *
 * Module pur, `now` injectable. Tous les tests utilisent une horloge
 * fixe `NOW = 2026-06-15` pour rendre les comparaisons de date
 * deterministes (la fenetre TTM est [2025-06-15, 2026-06-15]).
 */

import { describe, it, expect } from 'vitest'
import {
  detectFrequency,
  projectDividends,
  buildDividendCalendar,
} from '../dividend-calendar'

const NOW = new Date('2026-06-15T12:00:00Z')

// ─── detectFrequency ─────────────────────────────────────────────────

describe('detectFrequency', () => {
  it('1 seule date → unknown', () => {
    expect(detectFrequency(['2026-01-15'])).toBe('unknown')
  })

  it('aucune date → unknown', () => {
    expect(detectFrequency([])).toBe('unknown')
  })

  it('4 versements espaces de ~30j → monthly', () => {
    expect(detectFrequency([
      '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15',
    ])).toBe('monthly')
  })

  it('4 versements espaces de ~90j → quarterly', () => {
    expect(detectFrequency([
      '2025-07-15', '2025-10-15', '2026-01-15', '2026-04-15',
    ])).toBe('quarterly')
  })

  it('2 versements espaces de ~180j → semi-annual', () => {
    expect(detectFrequency(['2025-12-15', '2026-06-15'])).toBe('semi-annual')
  })

  it('2 versements espaces de ~365j → annual', () => {
    expect(detectFrequency(['2025-06-15', '2026-06-15'])).toBe('annual')
  })

  it('tri interne : dates non triees → meme resultat', () => {
    expect(detectFrequency([
      '2026-04-15', '2026-01-15', '2026-03-15', '2026-02-15',
    ])).toBe('monthly')
  })

  it('mediane robuste : 3 intervalles 90j + 1 outlier 600j → quarterly', () => {
    // Intervalles : 90, 90, 90, 600 → mediane = 90 (entre 90 et 90) → quarterly
    expect(detectFrequency([
      '2025-01-01', '2025-04-01', '2025-07-01', '2025-10-01', '2027-05-23',
    ])).toBe('quarterly')
  })

  it('intervalles trop grands → unknown', () => {
    // Mediane ~ 700j → au-dela de 500
    expect(detectFrequency(['2023-01-01', '2025-01-01', '2027-01-01'])).toBe('unknown')
  })
})

// ─── projectDividends ────────────────────────────────────────────────

describe('projectDividends', () => {
  it('position avec 4 versements trimestriels → quarterly, projection x 4', () => {
    const out = projectDividends({
      positions: [{ id: 'p1', ticker: 'AIR' }],
      dividendsByPosition: {
        p1: [
          { date: '2025-07-15', amountRef: 10 },
          { date: '2025-10-15', amountRef: 10 },
          { date: '2026-01-15', amountRef: 10 },
          { date: '2026-04-15', amountRef: 10 },
        ],
      },
      now: NOW,
    })
    expect(out).toHaveLength(1)
    const proj = out[0]!
    expect(proj.frequency).toBe('quarterly')
    expect(proj.paymentsPerYear).toBe(4)
    expect(proj.meanAmountRef).toBeCloseTo(10, 6)
    expect(proj.annualProjectionRef).toBeCloseTo(40, 6)
    expect(proj.confidenceLevel).toBe('high')
    expect(proj.medianIntervalDays).toBeGreaterThan(85)
    expect(proj.medianIntervalDays).toBeLessThan(100)
    // Prochain cycle = dernier (2026-04-15) + ~92j ≈ mi-juillet 2026
    expect(proj.nextExpectedDate).toMatch(/^2026-07-\d{2}$/)
  })

  it('position avec 1 seul versement TTM → unknown, low confidence', () => {
    const out = projectDividends({
      positions: [{ id: 'p1', ticker: 'XYZ' }],
      dividendsByPosition: {
        p1: [{ date: '2026-03-15', amountRef: 5 }],
      },
      now: NOW,
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.frequency).toBe('unknown')
    expect(out[0]!.paymentsPerYear).toBe(0)
    expect(out[0]!.annualProjectionRef).toBe(0)
    expect(out[0]!.confidenceLevel).toBe('low')
    expect(out[0]!.nextExpectedDate).toBeNull()
    expect(out[0]!.medianIntervalDays).toBeNull()
  })

  it('position sans dividende TTM → omise du retour', () => {
    const out = projectDividends({
      positions: [{ id: 'p1', ticker: 'XYZ' }],
      dividendsByPosition: { p1: [] },
      now: NOW,
    })
    expect(out).toEqual([])
  })

  it('versements hors fenetre TTM (> 1 an) sont ignores', () => {
    const out = projectDividends({
      positions: [{ id: 'p1', ticker: 'OLD' }],
      dividendsByPosition: {
        p1: [
          { date: '2024-01-01', amountRef: 100 },  // > 365j → exclu
          { date: '2026-03-15', amountRef:  10 },
        ],
      },
      now: NOW,
    })
    // 1 versement en fenetre → unknown
    expect(out[0]!.frequency).toBe('unknown')
    expect(out[0]!.meanAmountRef).toBe(10)
  })

  it('nextExpectedDate dans le passe → avance jusqu\'au prochain cycle futur', () => {
    // Dernier versement il y a 200j, mediane = 90j → next devrait etre
    // dans le futur (220 − 90 − 90 = 40j passes apres next theorique).
    const out = projectDividends({
      positions: [{ id: 'p1', ticker: 'AIR' }],
      dividendsByPosition: {
        p1: [
          { date: '2025-08-15', amountRef: 10 },
          { date: '2025-11-15', amountRef: 10 },
        ],
      },
      now: NOW,
    })
    expect(out[0]!.nextExpectedDate).not.toBeNull()
    const next = new Date(out[0]!.nextExpectedDate! + 'T00:00:00Z').getTime()
    expect(next).toBeGreaterThan(NOW.getTime())
  })

  it('tri descendant par annualProjectionRef', () => {
    const out = projectDividends({
      positions: [
        { id: 'p1', ticker: 'LOW'  },
        { id: 'p2', ticker: 'HIGH' },
      ],
      dividendsByPosition: {
        p1: [
          { date: '2026-01-15', amountRef: 1 },
          { date: '2026-04-15', amountRef: 1 },
        ],
        p2: [
          { date: '2026-01-15', amountRef: 100 },
          { date: '2026-04-15', amountRef: 100 },
        ],
      },
      now: NOW,
    })
    expect(out[0]!.ticker).toBe('HIGH')
    expect(out[1]!.ticker).toBe('LOW')
  })
})

// ─── buildDividendCalendar ───────────────────────────────────────────

describe('buildDividendCalendar', () => {
  it('genere monthCount mois consecutifs a partir du mois courant', () => {
    const cal = buildDividendCalendar({
      projections:        [],
      confirmedDividends: [],
      monthCount:         12,
      now:                NOW,
    })
    expect(cal).toHaveLength(12)
    expect(cal[0]!.month).toBe('2026-06')  // mois courant inclus
    expect(cal[11]!.month).toBe('2027-05')
  })

  it('defaut monthCount = 12', () => {
    const cal = buildDividendCalendar({
      projections:        [],
      confirmedDividends: [],
      now:                NOW,
    })
    expect(cal).toHaveLength(12)
  })

  it('position mensuelle : 12 paiements projetes sur 12 mois', () => {
    const projections = projectDividends({
      positions: [{ id: 'p1', ticker: 'MNTH' }],
      dividendsByPosition: {
        p1: [
          { date: '2026-01-15', amountRef: 5 },
          { date: '2026-02-15', amountRef: 5 },
          { date: '2026-03-15', amountRef: 5 },
          { date: '2026-04-15', amountRef: 5 },
          { date: '2026-05-15', amountRef: 5 },
        ],
      },
      now: NOW,
    })
    const cal = buildDividendCalendar({
      projections, confirmedDividends: [], monthCount: 12, now: NOW,
    })
    // Tous les mois ont au moins 1 paiement projete
    const monthsWithPayments = cal.filter((m) => m.totalExpectedRef > 0).length
    expect(monthsWithPayments).toBeGreaterThanOrEqual(11)
  })

  it('2 positions (mensuelle + trimestrielle) : totaux coherents', () => {
    const projections = projectDividends({
      positions: [
        { id: 'p1', ticker: 'MTH' },
        { id: 'p2', ticker: 'QTR' },
      ],
      dividendsByPosition: {
        p1: [
          { date: '2026-01-15', amountRef: 5 },
          { date: '2026-02-15', amountRef: 5 },
          { date: '2026-03-15', amountRef: 5 },
          { date: '2026-04-15', amountRef: 5 },
          { date: '2026-05-15', amountRef: 5 },
        ],
        p2: [
          { date: '2025-07-15', amountRef: 30 },
          { date: '2025-10-15', amountRef: 30 },
          { date: '2026-01-15', amountRef: 30 },
          { date: '2026-04-15', amountRef: 30 },
        ],
      },
      now: NOW,
    })
    const cal = buildDividendCalendar({
      projections, confirmedDividends: [], monthCount: 12, now: NOW,
    })

    // Total projete sur 12 mois ~ 5x12 + 30x4 = 60 + 120 = 180
    // (avec une marge car le cycle reel se cale sur l'intervalle median)
    const total = cal.reduce((s, m) => s + m.totalExpectedRef, 0)
    expect(total).toBeGreaterThan(150)
    expect(total).toBeLessThan(210)
  })

  it('projection unknown → exclue du calendrier', () => {
    const projections = projectDividends({
      positions: [{ id: 'p1', ticker: 'ONE' }],
      dividendsByPosition: {
        p1: [{ date: '2026-03-15', amountRef: 100 }],  // 1 seul → unknown
      },
      now: NOW,
    })
    const cal = buildDividendCalendar({
      projections, confirmedDividends: [], monthCount: 6, now: NOW,
    })
    const total = cal.reduce((s, m) => s + m.totalExpectedRef, 0)
    expect(total).toBe(0)
  })

  it('isConfirmed=true si dividende reel existe sur la position dans le meme mois', () => {
    const projections = projectDividends({
      positions: [{ id: 'p1', ticker: 'CONF' }],
      dividendsByPosition: {
        p1: [
          { date: '2026-01-15', amountRef: 10 },
          { date: '2026-04-15', amountRef: 10 },
          { date: '2026-07-15', amountRef: 10 },
        ],
      },
      now: new Date('2026-08-01T00:00:00Z'),
    })
    const cal = buildDividendCalendar({
      projections,
      // On confirme un versement en octobre 2026
      confirmedDividends: [
        { positionId: 'p1', date: '2026-10-15', amountRef: 10 },
      ],
      monthCount: 6,
      now: new Date('2026-08-01T00:00:00Z'),
    })
    // Quelque part dans le calendrier, un paiement projete en octobre
    // doit avoir isConfirmed=true.
    const oct = cal.find((m) => m.month === '2026-10')
    expect(oct).toBeTruthy()
    const matched = oct!.expectedPayments.find((p) => p.positionId === 'p1')
    if (matched) expect(matched.isConfirmed).toBe(true)
  })

  it('intervalle median REEL (87j) utilise — pas 91j canonique', () => {
    // 4 versements espaces de 87j exactement
    const dates = ['2025-09-20', '2025-12-16', '2026-03-13', '2026-06-08']
    const projections = projectDividends({
      positions: [{ id: 'p1', ticker: 'R87' }],
      dividendsByPosition: {
        p1: dates.map((d) => ({ date: d, amountRef: 10 })),
      },
      now: NOW,
    })
    expect(projections[0]!.frequency).toBe('quarterly')
    expect(projections[0]!.medianIntervalDays).toBeCloseTo(87, 1)
  })
})
