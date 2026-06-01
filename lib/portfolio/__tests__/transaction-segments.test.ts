/**
 * Tests de l'assembleur de segments TWR (V1.3 P0.3).
 *
 * Mini-fixtures dédiées (purchase simple, dividend, fallback legacy, multi-tx).
 * Les fixtures dashboard ne sont PAS utilisées ici — elles sont testées dans
 * `lib/analyse/__tests__/dashboard-v1/specs/twrPortefeuille.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import {
  buildTwrSegments,
  type TransactionForTwr,
  type PositionForSegments,
} from '../transaction-segments'

const ASOF = new Date('2026-05-30')

describe('buildTwrSegments — cas simples', () => {
  it('liste vide + aucune position avec fallback → []', () => {
    const segs = buildTwrSegments({
      transactions: [],
      positions:    [],
      asOfDate:     ASOF,
    })
    expect(segs).toEqual([])
  })

  it('1 purchase, MV finale différente → 1 segment', () => {
    // Calcul à la main :
    //   T1 = 2025-01-01 : purchase 100 @ 200€ → qty=100, valueAfter=20 000€
    //   asOfDate : currentMv = 22 000€ (qty=100, price=220€)
    //   Seg : 20 000 → 22 000 (rendement +10 %)
    const tx: TransactionForTwr = {
      executedAt: '2025-01-01', type: 'purchase', positionId: 'P1',
      quantity: 100, unitPriceEur: 200, amountEur: 20_000,
    }
    const pos: PositionForSegments = {
      positionId: 'P1', currentMvEur: 22_000, currentQuantity: 100,
    }
    const segs = buildTwrSegments({ transactions: [tx], positions: [pos], asOfDate: ASOF })

    expect(segs.length).toBe(1)
    expect(segs[0]!.startValueEur).toBe(20_000)
    expect(segs[0]!.endValueEur).toBe(22_000)
    expect(segs[0]!.startDate.toISOString().startsWith('2025-01-01')).toBe(true)
    expect(segs[0]!.endDate.toISOString().startsWith('2026-05-30')).toBe(true)
  })

  it('2 purchases successifs → 2 segments (le 2ᵉ démarre après le flux)', () => {
    // Calcul :
    //   T1 = 2025-01-01 : purchase 150 @ 200€ → qty=150, valueAfter=30 000
    //   T2 = 2025-06-01 : purchase 50 @ 220€ →
    //     valueBefore = 150 × 220 = 33 000
    //     valueAfter  = 33 000 + 11 000 = 44 000
    //   asOfDate : currentMv = 50 000 (qty=200, price=250)
    //   Seg 1 : 30 000 → 33 000 (rdt +10,00 %)
    //   Seg 2 : 44 000 → 50 000 (rdt +13,64 %)
    const txs: TransactionForTwr[] = [
      { executedAt: '2025-01-01', type: 'purchase', positionId: 'P1', quantity: 150, unitPriceEur: 200, amountEur: 30_000 },
      { executedAt: '2025-06-01', type: 'purchase', positionId: 'P1', quantity:  50, unitPriceEur: 220, amountEur: 11_000 },
    ]
    const pos: PositionForSegments = { positionId: 'P1', currentMvEur: 50_000, currentQuantity: 200 }
    const segs = buildTwrSegments({ transactions: txs, positions: [pos], asOfDate: ASOF })

    expect(segs.length).toBe(2)
    expect(segs[0]!.startValueEur).toBe(30_000)
    expect(segs[0]!.endValueEur).toBe(33_000)
    expect(segs[1]!.startValueEur).toBe(44_000)
    expect(segs[1]!.endValueEur).toBe(50_000)
  })
})

describe('buildTwrSegments — dividendes', () => {
  it('dividende ignoré : ne crée pas de rupture de segment', () => {
    // Calcul :
    //   T1 = 2025-01-01 : purchase 100 @ 200€ → valueAfter = 20 000
    //   2025-06-01 : DIVIDEND 500€ → IGNORÉ (pas de rupture)
    //   asOfDate : currentMv = 22 000
    //   Reste 1 segment : 20 000 → 22 000
    const txs: TransactionForTwr[] = [
      { executedAt: '2025-01-01', type: 'purchase', positionId: 'P1', quantity: 100, unitPriceEur: 200, amountEur: 20_000 },
      { executedAt: '2025-06-01', type: 'dividend', positionId: 'P1', quantity:   0, unitPriceEur:   0, amountEur:    500 },
    ]
    const pos: PositionForSegments = { positionId: 'P1', currentMvEur: 22_000, currentQuantity: 100 }
    const segs = buildTwrSegments({ transactions: txs, positions: [pos], asOfDate: ASOF })

    expect(segs.length).toBe(1)
    expect(segs[0]!.startValueEur).toBe(20_000)
    expect(segs[0]!.endValueEur).toBe(22_000)
  })
})

describe('buildTwrSegments — fallback legacy', () => {
  it('position sans transaction mais avec acquisitionDate + averagePrice → transaction synthétique', () => {
    // Calcul :
    //   Position P_legacy : currentMv=12 000, qty=100, acquisitionDate=2024-06-01,
    //                       averagePrice=100 → tx synthétique purchase 100 @ 100 = 10 000
    //   asOfDate : currentMv = 12 000
    //   Seg unique : 10 000 → 12 000 (rdt +20 %)
    const pos: PositionForSegments = {
      positionId: 'P_legacy', currentMvEur: 12_000, currentQuantity: 100,
      acquisitionDate: '2024-06-01', averagePriceEur: 100,
    }
    const segs = buildTwrSegments({ transactions: [], positions: [pos], asOfDate: ASOF })

    expect(segs.length).toBe(1)
    expect(segs[0]!.startValueEur).toBe(10_000)
    expect(segs[0]!.endValueEur).toBe(12_000)
  })

  it('position legacy SANS fallback complet → ignorée', () => {
    const pos: PositionForSegments = {
      positionId: 'P_oubli', currentMvEur: 12_000, currentQuantity: 100,
      // pas d'acquisitionDate ni averagePriceEur
    }
    const segs = buildTwrSegments({ transactions: [], positions: [pos], asOfDate: ASOF })
    expect(segs).toEqual([])
  })
})

describe('buildTwrSegments — edge cases', () => {
  it('currentMvEur null sur une position → exclue de la valeur finale', () => {
    // P1 valorisée, P2 non valorisée. Le segment final ne compte que P1.
    const txs: TransactionForTwr[] = [
      { executedAt: '2025-01-01', type: 'purchase', positionId: 'P1', quantity: 100, unitPriceEur: 100, amountEur: 10_000 },
      { executedAt: '2025-01-01', type: 'purchase', positionId: 'P2', quantity:  50, unitPriceEur: 100, amountEur:  5_000 },
    ]
    const positions: PositionForSegments[] = [
      { positionId: 'P1', currentMvEur: 11_000, currentQuantity: 100 },
      { positionId: 'P2', currentMvEur: null,    currentQuantity: 50 },
    ]
    const segs = buildTwrSegments({ transactions: txs, positions, asOfDate: ASOF })
    // 2 txs à la même date → 2 events distincts. Le segment inter-events
    // a durée 0 (filtré in fine par computeTwr). Le segment vers ASOF a
    // endValue = 11 000 (P2 ignorée car currentMv=null).
    expect(segs.length).toBeGreaterThanOrEqual(1)
    const finalSeg = segs[segs.length - 1]!
    expect(finalSeg.endValueEur).toBe(11_000)
    expect(finalSeg.endDate.toISOString().startsWith('2026-05-30')).toBe(true)
  })

  it('asOfDate identique à la dernière transaction → pas de segment final', () => {
    const tx: TransactionForTwr = {
      executedAt: '2026-05-30', type: 'purchase', positionId: 'P1',
      quantity: 100, unitPriceEur: 200, amountEur: 20_000,
    }
    const pos: PositionForSegments = { positionId: 'P1', currentMvEur: 20_000, currentQuantity: 100 }
    const segs = buildTwrSegments({
      transactions: [tx], positions: [pos], asOfDate: new Date('2026-05-30'),
    })
    // Pas de segment : on n'a qu'une transaction et asOfDate = date de tx.
    expect(segs).toEqual([])
  })
})
