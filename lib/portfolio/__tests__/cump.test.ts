/**
 * Tests CUMP (Coût Unitaire Moyen Pondéré) — convention FR/IFRS.
 *
 * Le bug historique (E2) calculait un PRU "lifetime-average" sur la
 * totalité des achats sans tenir compte de l'ordre chronologique ni
 * des ventes intermédiaires. Le cas C ci-dessous le démontre.
 */

import { describe, it, expect } from 'vitest'
import { computeRunningCump } from '../csvImport'
import type { NormalizedTransaction } from '../csvImport'

// ─── Fixture helper ───────────────────────────────────────────────────

function tx(over: Partial<NormalizedTransaction> & {
  date:             string
  transaction_type: NormalizedTransaction['transaction_type']
  quantity:         number
  unit_price:       number
}): NormalizedTransaction {
  return {
    isin:        null,
    ticker:      'TST',
    name:        'Test',
    asset_class: 'stock',
    currency:    'EUR',
    fees:        0,
    broker:      'generic',
    confidence:  'high',
    raw_row:     {},
    ...over,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('computeRunningCump — CUMP roulant', () => {
  it('Cas A — achat unique', () => {
    const r = computeRunningCump([
      tx({ date: '2024-01-01', transaction_type: 'buy', quantity: 10, unit_price: 100 }),
    ])
    expect(r.finalQty).toBe(10)
    expect(r.finalPru).toBe(100)
  })

  it('Cas B — double achat → moyenne pondérée', () => {
    const r = computeRunningCump([
      tx({ date: '2024-01-01', transaction_type: 'buy', quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-01', transaction_type: 'buy', quantity: 10, unit_price: 200 }),
    ])
    expect(r.finalQty).toBe(20)
    expect(r.finalPru).toBeCloseTo(150, 10)
  })

  it('Cas C — achat / vente / rachat (régression E2)', () => {
    // Le code lifetime-average retournait pru = 133,33 → bug.
    // CUMP doit retourner pru = 125.
    const r = computeRunningCump([
      tx({ date: '2024-01-01', transaction_type: 'buy',  quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-01', transaction_type: 'buy',  quantity: 10, unit_price: 200 }),
      tx({ date: '2024-09-01', transaction_type: 'sell', quantity: 10, unit_price: 200 }),
      tx({ date: '2025-01-01', transaction_type: 'buy',  quantity: 10, unit_price: 100 }),
    ])
    expect(r.finalQty).toBe(20)
    expect(r.finalPru).toBeCloseTo(125, 10)
  })

  it('Cas D — vente totale puis rachat repart de zéro', () => {
    const r = computeRunningCump([
      tx({ date: '2024-01-01', transaction_type: 'buy',  quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-01', transaction_type: 'sell', quantity: 10, unit_price: 150 }),
      tx({ date: '2024-09-01', transaction_type: 'buy',  quantity:  5, unit_price:  80 }),
    ])
    expect(r.finalQty).toBe(5)
    expect(r.finalPru).toBeCloseTo(80, 10)
  })

  it('Cas E — frais intégrés au coût', () => {
    const r = computeRunningCump([
      tx({ date: '2024-01-01', transaction_type: 'buy', quantity: 10, unit_price: 100, fees: 10 }),
    ])
    expect(r.finalQty).toBe(10)
    expect(r.finalPru).toBeCloseTo(101, 10)
  })

  it("le tri chronologique est appliqué même si l'entrée est désordonnée", () => {
    // Mêmes transactions que Cas C, dans le désordre.
    const r = computeRunningCump([
      tx({ date: '2025-01-01', transaction_type: 'buy',  quantity: 10, unit_price: 100 }),
      tx({ date: '2024-09-01', transaction_type: 'sell', quantity: 10, unit_price: 200 }),
      tx({ date: '2024-01-01', transaction_type: 'buy',  quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-01', transaction_type: 'buy',  quantity: 10, unit_price: 200 }),
    ])
    expect(r.finalQty).toBe(20)
    expect(r.finalPru).toBeCloseTo(125, 10)
  })

  it('ignore les dividendes', () => {
    const r = computeRunningCump([
      tx({ date: '2024-01-01', transaction_type: 'buy',      quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-01', transaction_type: 'dividend', quantity:  1, unit_price:   5 }),
    ])
    expect(r.finalQty).toBe(10)
    expect(r.finalPru).toBe(100)
  })
})
