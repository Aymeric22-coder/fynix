/**
 * CS2 LOT 6 — Tests de breakdownPatrimoine.
 */
import { describe, it, expect } from 'vitest'
import { breakdownPatrimoine } from '../breakdown'
import type { PatrimoineComplet, EnrichedPosition } from '@/types/analyse'

function pos(asset_type: EnrichedPosition['asset_type'], current_value: number): EnrichedPosition {
  return { asset_type, current_value } as unknown as EnrichedPosition
}

function patrimoine(over: Partial<PatrimoineComplet> = {}): PatrimoineComplet {
  return {
    totalCash:              0,
    totalCashInvestissable: 0,
    totalImmo:              0,
    totalImmoEquity:        0,
    totalDettes:            0,
    positions:              [],
    ...over,
  } as PatrimoineComplet
}

describe('breakdownPatrimoine', () => {
  it('patrimoine vide → tous les champs à 0', () => {
    const b = breakdownPatrimoine(patrimoine())
    expect(b.total).toBe(0)
    expect(b.cash).toBe(0)
    expect(b.financialMarket).toBe(0)
    expect(b.crypto).toBe(0)
    expect(b.realEstateNet).toBe(0)
  })

  it('positions mix ETF + crypto → ventilation correcte', () => {
    const b = breakdownPatrimoine(patrimoine({
      positions: [
        pos('etf', 50_000),
        pos('stock', 20_000),
        pos('crypto', 10_000),
      ],
    }))
    expect(b.financialMarket).toBe(70_000)  // ETF + stock
    expect(b.crypto).toBe(10_000)
  })

  it('cash investissable vs brut distincts', () => {
    const b = breakdownPatrimoine(patrimoine({
      totalCash: 15_000,
      totalCashInvestissable: 10_000,  // 5 k€ de compte courant exclus
    }))
    expect(b.cash).toBe(10_000)
    expect(b.cashBrut).toBe(15_000)
    expect(b.total).toBe(10_000)  // total utilise cash investissable
  })

  it('immo equity nette injectée', () => {
    const b = breakdownPatrimoine(patrimoine({
      totalImmo: 300_000,
      totalImmoEquity: 200_000,  // 100k de dette
      totalDettes: 100_000,
    }))
    expect(b.realEstateNet).toBe(200_000)
    expect(b.detail.realEstateGross).toBe(300_000)
    expect(b.detail.debts).toBe(100_000)
  })

  it('cryptoPctFinancier calculé sur le financier hors immo', () => {
    const b = breakdownPatrimoine(patrimoine({
      positions: [
        pos('etf', 70_000),
        pos('crypto', 30_000),
      ],
      totalCash: 0,
      totalCashInvestissable: 0,
      totalImmoEquity: 1_000_000,  // l'immo n'influe PAS sur cryptoPct
    }))
    // denomFinancier = 70_000 + 30_000 = 100_000 ; crypto = 30 %
    expect(b.detail.cryptoPctFinancier).toBe(30)
  })

  it('total = cash investissable + financial + crypto + immo equity', () => {
    const b = breakdownPatrimoine(patrimoine({
      totalCash: 20_000,
      totalCashInvestissable: 15_000,
      positions: [pos('etf', 50_000), pos('crypto', 10_000)],
      totalImmo: 300_000,
      totalImmoEquity: 200_000,
    }))
    expect(b.total).toBe(15_000 + 50_000 + 10_000 + 200_000)
  })
})
