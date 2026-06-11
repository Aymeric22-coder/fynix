/**
 * Tests Sprint 3 — recalcul CUMP après édition / suppression de transactions.
 *
 * Couvre l'adaptateur de type, le garde-fou « ledger désynchronisé »,
 * l'invariant de non-survente, et le recompute (qty / pru / realized_pnl)
 * pour les cas d'édition ET de suppression.
 */

import { describe, it, expect } from 'vitest'
import {
  mapDbToCumpType,
  isEditableDbType,
  recomputeLedgerAfterEdit,
  POSITION_QUANTITY_EPSILON,
  type LedgerTx,
} from '../transaction-edit'

function tx(over: Partial<LedgerTx> & { id: string }): LedgerTx {
  return {
    transaction_type: 'purchase',
    quantity:         10,
    unit_price:       100,
    fees:             0,
    executed_at:      '2026-01-01T00:00:00.000Z',
    realized_pnl:     null,
    ...over,
  }
}

// Ledger de référence : 2 achats puis 1 vente partielle. storedQty cohérent = 15.
function baseLedger(): LedgerTx[] {
  return [
    tx({ id: 'b1', transaction_type: 'purchase', quantity: 10, unit_price: 100, executed_at: '2026-01-01T00:00:00.000Z' }),
    tx({ id: 'b2', transaction_type: 'purchase', quantity: 10, unit_price: 120, executed_at: '2026-02-01T00:00:00.000Z' }),
    tx({ id: 's1', transaction_type: 'sale',     quantity: 5,  unit_price: 130, executed_at: '2026-03-01T00:00:00.000Z', realized_pnl: 100 }),
  ]
}

describe('mapDbToCumpType / isEditableDbType', () => {
  it('mappe purchase→buy, sale→sell, dividend→dividend', () => {
    expect(mapDbToCumpType('purchase')).toBe('buy')
    expect(mapDbToCumpType('sale')).toBe('sell')
    expect(mapDbToCumpType('dividend')).toBe('dividend')
  })

  it('isEditableDbType ne retient que purchase / sale / dividend', () => {
    expect(isEditableDbType('purchase')).toBe(true)
    expect(isEditableDbType('sale')).toBe(true)
    expect(isEditableDbType('dividend')).toBe(true)
    expect(isEditableDbType('fee')).toBe(false)
    expect(isEditableDbType('transfer')).toBe(false)
  })
})

describe('recomputeLedgerAfterEdit — garde-fous', () => {
  it('not_found si la transaction ciblée est absente', () => {
    const r = recomputeLedgerAfterEdit({
      ledger: baseLedger(), storedQty: 15,
      op: { kind: 'delete', txId: 'inconnu' },
    })
    expect(r.status).toBe('not_found')
  })

  it('ledger_desync si le ledger ne reconcilie pas avec la position stockée', () => {
    const r = recomputeLedgerAfterEdit({
      ledger: baseLedger(), storedQty: 7,           // réel = 15
      op: { kind: 'update', txId: 'b1', patch: { quantity: 12 } },
    })
    expect(r.status).toBe('ledger_desync')
    if (r.status === 'ledger_desync') {
      expect(r.recomputedQty).toBe(15)
      expect(r.storedQty).toBe(7)
      expect(r.gap).toBeCloseTo(8, 6)
    }
  })

  it('tolère un écart < epsilon (pas de désync sur arrondi flottant)', () => {
    const r = recomputeLedgerAfterEdit({
      ledger: baseLedger(), storedQty: 15 + POSITION_QUANTITY_EPSILON / 2,
      op: { kind: 'delete', txId: 's1' },
    })
    expect(r.status).toBe('ok')
  })
})

describe('recomputeLedgerAfterEdit — invariant de non-survente', () => {
  it('invalid_sale : éditer un achat à la baisse rend une vente ultérieure invalide', () => {
    const ledger: LedgerTx[] = [
      tx({ id: 'b1', transaction_type: 'purchase', quantity: 10, unit_price: 100, executed_at: '2026-01-01T00:00:00.000Z' }),
      tx({ id: 's1', transaction_type: 'sale',     quantity: 8,  unit_price: 130, executed_at: '2026-02-01T00:00:00.000Z', realized_pnl: 240 }),
    ]
    const r = recomputeLedgerAfterEdit({
      ledger, storedQty: 2,                          // 10 − 8
      op: { kind: 'update', txId: 'b1', patch: { quantity: 5 } },
    })
    expect(r.status).toBe('invalid_sale')
    if (r.status === 'invalid_sale') {
      expect(r.date).toBe('2026-02-01')
      expect(r.heldQty).toBe(5)
      expect(r.sellQty).toBe(8)
    }
  })

  it('invalid_sale : supprimer un achat rend une vente ultérieure invalide', () => {
    const ledger: LedgerTx[] = [
      tx({ id: 'b1', transaction_type: 'purchase', quantity: 10, unit_price: 100, executed_at: '2026-01-01T00:00:00.000Z' }),
      tx({ id: 'b2', transaction_type: 'purchase', quantity: 5,  unit_price: 110, executed_at: '2026-02-01T00:00:00.000Z' }),
      tx({ id: 's1', transaction_type: 'sale',     quantity: 12, unit_price: 130, executed_at: '2026-03-01T00:00:00.000Z', realized_pnl: 0 }),
    ]
    const r = recomputeLedgerAfterEdit({
      ledger, storedQty: 3,                          // 10 + 5 − 12
      op: { kind: 'delete', txId: 'b2' },
    })
    expect(r.status).toBe('invalid_sale')
    if (r.status === 'invalid_sale') {
      expect(r.date).toBe('2026-03-01')
      expect(r.heldQty).toBe(10)
      expect(r.sellQty).toBe(12)
    }
  })
})

describe('recomputeLedgerAfterEdit — recompute OK', () => {
  it('suppression d\'une vente → recompute qty/pru et remise à null des realized_pnl', () => {
    const r = recomputeLedgerAfterEdit({
      ledger: baseLedger(), storedQty: 15,
      op: { kind: 'delete', txId: 's1' },
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      // Reste 2 achats : 10@100 + 10@120 → qty 20, pru 110
      expect(r.finalQty).toBeCloseTo(20, 6)
      expect(r.finalPru).toBeCloseTo(110, 6)
      // La vente est supprimée → plus dans la liste ; les 2 achats restent null
      expect(r.realizedUpdates).toHaveLength(2)
      expect(r.realizedUpdates.every((u) => u.realized_pnl === null)).toBe(true)
    }
  })

  it('édition d\'un achat → recompute pondéré + realized_pnl recalculé sur la vente', () => {
    const r = recomputeLedgerAfterEdit({
      ledger: baseLedger(), storedQty: 15,
      op: { kind: 'update', txId: 'b2', patch: { quantity: 20 } },  // 10→20 @120
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      // Achats : 10@100 + 20@120 → qty 30, pru = (1000+2400)/30 = 113.3333
      // Vente 5 → qty 25, realized = (130 − 113.3333) × 5 = 83.333
      expect(r.finalQty).toBeCloseTo(25, 6)
      expect(r.finalPru).toBeCloseTo(3400 / 30, 6)
      const sale = r.realizedUpdates.find((u) => u.id === 's1')!
      expect(sale.realized_pnl).toBeCloseTo((130 - 3400 / 30) * 5, 4)
      // Les achats restent null
      expect(r.realizedUpdates.find((u) => u.id === 'b1')!.realized_pnl).toBeNull()
      expect(r.realizedUpdates.find((u) => u.id === 'b2')!.realized_pnl).toBeNull()
    }
  })

  it('édition d\'un dividende → qty/pru inchangés, aucune vente impactée', () => {
    const ledger: LedgerTx[] = [
      tx({ id: 'b1', transaction_type: 'purchase', quantity: 10, unit_price: 100, executed_at: '2026-01-01T00:00:00.000Z' }),
      tx({ id: 'd1', transaction_type: 'dividend', quantity: null, unit_price: null, executed_at: '2026-02-01T00:00:00.000Z' }),
    ]
    const r = recomputeLedgerAfterEdit({
      ledger, storedQty: 10,
      op: { kind: 'update', txId: 'd1', patch: { executed_at: '2026-02-15T00:00:00.000Z' } },
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.finalQty).toBeCloseTo(10, 6)
      expect(r.finalPru).toBeCloseTo(100, 6)
      expect(r.realizedUpdates.every((u) => u.realized_pnl === null)).toBe(true)
    }
  })

  it('suppression du dernier achat → position ramenée à 0 (qty 0, pru 0)', () => {
    const ledger: LedgerTx[] = [
      tx({ id: 'b1', transaction_type: 'purchase', quantity: 10, unit_price: 100, executed_at: '2026-01-01T00:00:00.000Z' }),
    ]
    const r = recomputeLedgerAfterEdit({
      ledger, storedQty: 10,
      op: { kind: 'delete', txId: 'b1' },
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.finalQty).toBe(0)
      expect(r.finalPru).toBe(0)
      expect(r.realizedUpdates).toHaveLength(0)
    }
  })
})
