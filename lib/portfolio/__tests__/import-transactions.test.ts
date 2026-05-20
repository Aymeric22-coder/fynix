/**
 * Tests E5 — construction des lignes pour la table `transactions`.
 *
 * Couvre les 4 cas du brief :
 *   A. 3 buy → 3 rows, executed_at = date CSV, type='purchase'.
 *   B. buy + sell → 2 rows, type='purchase' / 'sale'.
 *   C. Idempotence : même input → même external_ref (garantie de dédup
 *      au niveau DB via l'index unique partiel — migration 033).
 *   D. Type inconnu → skipped, ne fait pas planter le build.
 *
 * On teste le helper pur `buildTransactionRowsForImport`. L'INSERT
 * Supabase lui-même est trivial (upsert avec onConflict) — pas de
 * mock DB intégral, l'idempotence DB est garantie par l'index.
 */

import { describe, it, expect } from 'vitest'
import {
  groupTransactionsByKey,
  type NormalizedTransaction,
} from '../csvImport'
import { buildTransactionRowsForImport } from '../import-transactions'

// ─── Fixtures ─────────────────────────────────────────────────────────

function tx(over: Partial<NormalizedTransaction> & {
  date:             string
  transaction_type: NormalizedTransaction['transaction_type']
  quantity:         number
  unit_price:       number
}): NormalizedTransaction {
  return {
    isin:        'FR0000000001',
    ticker:      'TST',
    name:        'Test SA',
    asset_class: 'stock',
    currency:    'EUR',
    fees:        0,
    broker:      'generic',
    confidence:  'high',
    raw_row:     {},
    ...over,
  }
}

const CTX = {
  userId:       'user-uuid-aaaa',
  positionId:   'pos-uuid-bbbb',
  instrumentId: 'inst-uuid-cccc',
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('buildTransactionRowsForImport — E5', () => {
  it('Cas A — 3 buy : 3 rows avec executed_at sur les dates du CSV', () => {
    const csvTxs = [
      tx({ date: '2024-01-15', transaction_type: 'buy', quantity:  5, unit_price: 100 }),
      tx({ date: '2024-04-02', transaction_type: 'buy', quantity:  3, unit_price: 110 }),
      tx({ date: '2024-09-30', transaction_type: 'buy', quantity:  2, unit_price:  95 }),
    ]
    const { rows, skipped } = buildTransactionRowsForImport(csvTxs, CTX)

    expect(skipped).toHaveLength(0)
    expect(rows).toHaveLength(3)

    expect(rows[0]!.transaction_type).toBe('purchase')
    expect(rows[1]!.transaction_type).toBe('purchase')
    expect(rows[2]!.transaction_type).toBe('purchase')

    // executed_at = date du CSV à 00:00 UTC, PAS now()
    expect(rows[0]!.executed_at).toBe('2024-01-15T00:00:00.000Z')
    expect(rows[1]!.executed_at).toBe('2024-04-02T00:00:00.000Z')
    expect(rows[2]!.executed_at).toBe('2024-09-30T00:00:00.000Z')

    // amount = -(qty × price + fees) pour un achat
    expect(rows[0]!.amount).toBe(-500)
    expect(rows[1]!.amount).toBe(-330)
    expect(rows[2]!.amount).toBe(-190)

    // Contexte propagé sur toutes les lignes
    for (const r of rows) {
      expect(r.user_id).toBe(CTX.userId)
      expect(r.position_id).toBe(CTX.positionId)
      expect(r.instrument_id).toBe(CTX.instrumentId)
      expect(r.external_ref).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('Cas B — buy + sell : 2 rows distinctes, amounts signés correctement', () => {
    const csvTxs = [
      tx({ date: '2024-01-15', transaction_type: 'buy',  quantity: 10, unit_price: 100, fees: 2 }),
      tx({ date: '2024-06-30', transaction_type: 'sell', quantity:  5, unit_price: 120, fees: 1 }),
    ]
    const { rows, skipped } = buildTransactionRowsForImport(csvTxs, CTX)

    expect(skipped).toHaveLength(0)
    expect(rows).toHaveLength(2)

    expect(rows[0]!.transaction_type).toBe('purchase')
    expect(rows[0]!.amount).toBe(-(10 * 100 + 2))   // -1002

    expect(rows[1]!.transaction_type).toBe('sale')
    expect(rows[1]!.amount).toBe((5 * 120 - 1))      // +599
  })

  it('Cas C — Idempotence : 2 builds successifs produisent les MÊMES external_ref', () => {
    const csvTxs = [
      tx({ date: '2024-01-15', transaction_type: 'buy',  quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-30', transaction_type: 'sell', quantity:  5, unit_price: 120 }),
    ]
    const first  = buildTransactionRowsForImport(csvTxs, CTX)
    const second = buildTransactionRowsForImport(csvTxs, CTX)

    expect(first.rows).toHaveLength(2)
    expect(second.rows).toHaveLength(2)
    // L'index unique (user_id, external_ref) côté DB ignorera les
    // duplicates avec ON CONFLICT DO NOTHING. On vérifie ici que le hash
    // est strictement déterministe, base de cette garantie.
    expect(first.rows[0]!.external_ref).toBe(second.rows[0]!.external_ref)
    expect(first.rows[1]!.external_ref).toBe(second.rows[1]!.external_ref)
    // 2 transactions ≠ → 2 hash ≠
    expect(first.rows[0]!.external_ref).not.toBe(first.rows[1]!.external_ref)
  })

  it('Cas D — type inconnu : skippé, les autres passent, pas de throw', () => {
    const csvTxs: NormalizedTransaction[] = [
      tx({ date: '2024-01-15', transaction_type: 'buy', quantity: 10, unit_price: 100 }),
      // type non géré par le mapping CSV → DB
      tx({ date: '2024-02-01', transaction_type: 'unknown_type' as never, quantity: 1, unit_price: 1 }),
      tx({ date: '2024-03-10', transaction_type: 'sell', quantity: 5, unit_price: 110 }),
    ]
    const { rows, skipped } = buildTransactionRowsForImport(csvTxs, CTX)

    expect(rows).toHaveLength(2)
    expect(skipped).toHaveLength(1)
    expect(skipped[0]!.transaction_type as string).toBe('unknown_type')
    expect(rows.map((r) => r.transaction_type)).toEqual(['purchase', 'sale'])
  })
})

describe('groupTransactionsByKey — exclusions', () => {
  it('groupe par ISIN, respecte excludedKeys', () => {
    const csvTxs = [
      tx({ isin: 'FR0000000001', date: '2024-01-01', transaction_type: 'buy', quantity: 1, unit_price: 10 }),
      tx({ isin: 'FR0000000001', date: '2024-02-01', transaction_type: 'buy', quantity: 2, unit_price: 20 }),
      tx({ isin: 'US0000000002', date: '2024-03-01', transaction_type: 'buy', quantity: 3, unit_price: 30 }),
    ]
    const groups = groupTransactionsByKey(csvTxs, ['US0000000002'])
    expect(groups.size).toBe(1)
    expect(groups.get('FR0000000001')).toHaveLength(2)
    expect(groups.has('US0000000002')).toBe(false)
  })

  it("n'exclut PAS les dividendes (laisse le choix au consommateur)", () => {
    const csvTxs = [
      tx({ date: '2024-01-01', transaction_type: 'buy',      quantity: 10, unit_price: 100 }),
      tx({ date: '2024-06-01', transaction_type: 'dividend', quantity:  1, unit_price:   3 }),
    ]
    const groups = groupTransactionsByKey(csvTxs)
    expect(groups.size).toBe(1)
    expect(groups.get('FR0000000001')).toHaveLength(2)  // les 2 sont là
  })
})
