import { describe, it, expect } from 'vitest'
import { transactionsToCashFlows, type TxRow } from '../cash-flows'

const tx = (over: Partial<TxRow> = {}): TxRow => ({
  transaction_type: 'purchase',
  amount:           -1000,
  executed_at:      '2026-01-15T10:00:00Z',
  position_id:      'pos-1',
  instrument_id:    'inst-1',
  ...over,
})

describe('transactionsToCashFlows', () => {
  it('inverse le signe : achat amount -1000 -> CF +1000 (apport)', () => {
    const flows = transactionsToCashFlows([tx({ amount: -1000 })])
    expect(flows).toHaveLength(1)
    expect(flows[0]).toEqual({ date: '2026-01-15', amount: 1000 })
  })

  it('inverse le signe : vente amount +500 -> CF -500 (retrait)', () => {
    const flows = transactionsToCashFlows([
      tx({ transaction_type: 'sale', amount: 500 }),
    ])
    expect(flows).toHaveLength(1)
    expect(flows[0]).toEqual({ date: '2026-01-15', amount: -500 })
  })

  it('ignore les transactions non purchase / sale', () => {
    const flows = transactionsToCashFlows([
      tx({ transaction_type: 'dividend', amount: -50 }),
      tx({ transaction_type: 'fee',      amount: -10 }),
      tx({ transaction_type: 'tax',      amount: -20 }),
      tx({ transaction_type: 'transfer', amount: -100 }),
    ])
    expect(flows).toHaveLength(0)
  })

  it('ignore les transactions sans lien portefeuille', () => {
    const flows = transactionsToCashFlows([
      tx({ position_id: null, instrument_id: null }),
    ])
    expect(flows).toHaveLength(0)
  })

  it('accepte les transactions avec position_id OU instrument_id', () => {
    const flows = transactionsToCashFlows([
      tx({ position_id: 'pos-1', instrument_id: null }),
      tx({ position_id: null,    instrument_id: 'inst-1', amount: -200, executed_at: '2026-02-01T10:00:00Z' }),
    ])
    expect(flows).toHaveLength(2)
  })

  it('tronque à yyyy-MM-dd', () => {
    const flows = transactionsToCashFlows([
      tx({ executed_at: '2026-03-15T14:32:00.123Z' }),
    ])
    expect(flows[0]!.date).toBe('2026-03-15')
  })

  it('trie par date croissante', () => {
    const flows = transactionsToCashFlows([
      tx({ executed_at: '2026-05-10T00:00:00Z', amount: -300 }),
      tx({ executed_at: '2026-01-05T00:00:00Z', amount: -100 }),
      tx({ executed_at: '2026-03-15T00:00:00Z', amount: -200 }),
    ])
    expect(flows.map((f) => f.date)).toEqual([
      '2026-01-05', '2026-03-15', '2026-05-10',
    ])
  })
})
