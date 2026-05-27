/**
 * Tests E12 / Étape 2 — buildEnvelopeSnapshotRows.
 *
 * Helper pur qui agrège les positions valorisées par enveloppe pour
 * produire les rows snapshot par-enveloppe (migration 044).
 *
 * On ne teste pas le pipeline complet `persistPortfolioSnapshot` (qui
 * tape Supabase) — l'idempotence DB est garantie par la contrainte
 * UNIQUE NULLS NOT DISTINCT sur (user_id, snapshot_date, envelope_id).
 */

import { describe, it, expect } from 'vitest'
import { buildEnvelopeSnapshotRows } from '../persist-snapshot'
import type { PositionValuation } from '../types'

// ─── Fixture helper ────────────────────────────────────────────────────

function pos(over: Partial<PositionValuation> = {}): PositionValuation {
  return {
    positionId:       'p',
    instrumentId:     'i',
    ticker:           'TST',
    name:             'Test',
    assetClass:       'equity',
    envelopeId:       null,
    quantity:         10,
    averagePrice:     100,
    currency:         'EUR',
    currentPrice:     110,
    priceConfidence:  'high',
    priceFreshAt:     new Date().toISOString(),
    priceStale:       false,
    costBasis:        1000,
    marketValue:      1100,
    unrealizedPnL:    100,
    unrealizedPnLPct: 10,
    priceSource:      'test',
    status:           'active',
    costBasisRef:     1000,
    marketValueRef:   1100,
    unrealizedPnLRef: 100,
    // Migration 045 — null par defaut
    lastRefreshAttemptedAt: null,
    ...over,
  }
}

const CTX = {
  userId:            'user-aaa',
  snapshotDate:      '2026-05-26',
  snapshotAt:        '2026-05-26T12:00:00.000Z',
  referenceCurrency: 'EUR',
  source:            'manual' as const,
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildEnvelopeSnapshotRows — agrégation par enveloppe', () => {
  it('aucune position avec envelopeId → aucune ligne', () => {
    const rows = buildEnvelopeSnapshotRows(
      [pos({ envelopeId: null })],
      CTX,
    )
    expect(rows).toEqual([])
  })

  it('positions inactives ignorées même si elles ont un envelopeId', () => {
    const rows = buildEnvelopeSnapshotRows(
      [pos({ envelopeId: 'env-pea', status: 'closed' })],
      CTX,
    )
    expect(rows).toEqual([])
  })

  it('une enveloppe avec 2 positions valorisées : agrège correctement', () => {
    const rows = buildEnvelopeSnapshotRows(
      [
        pos({ positionId: 'p1', envelopeId: 'env-pea', costBasisRef: 1000, marketValueRef: 1200 }),
        pos({ positionId: 'p2', envelopeId: 'env-pea', costBasisRef: 500,  marketValueRef: 600,
              assetClass: 'etf' }),
      ],
      CTX,
    )
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.envelope_id).toBe('env-pea')
    expect(r.total_cost_basis).toBe(1500)
    expect(r.total_market_value).toBe(1800)
    expect(r.total_pnl).toBe(300)               // 1800 − 1500
    expect(r.total_pnl_pct).toBeCloseTo(20, 4)  // 300 / 1500 × 100
    expect(r.positions_count).toBe(2)
    expect(r.valued_count).toBe(2)
    expect(r.allocation_by_class).toEqual({ equity: 1200, etf: 600 })
  })

  it('plusieurs enveloppes : une ligne par envelopeId distinct', () => {
    const rows = buildEnvelopeSnapshotRows(
      [
        pos({ positionId: 'p1', envelopeId: 'env-pea', costBasisRef: 1000, marketValueRef: 1100 }),
        pos({ positionId: 'p2', envelopeId: 'env-cto', costBasisRef: 2000, marketValueRef: 1900 }),
        pos({ positionId: 'p3', envelopeId: 'env-pea', costBasisRef: 500,  marketValueRef: 600 }),
      ],
      CTX,
    )
    expect(rows).toHaveLength(2)
    const pea = rows.find((r) => r.envelope_id === 'env-pea')!
    const cto = rows.find((r) => r.envelope_id === 'env-cto')!
    expect(pea.total_market_value).toBe(1700)
    expect(pea.total_cost_basis).toBe(1500)
    expect(cto.total_market_value).toBe(1900)
    expect(cto.total_cost_basis).toBe(2000)
    expect(cto.total_pnl).toBe(-100)
  })

  it('position sans prix : valeur effective = costBasis (fallback), valuedCount inchangé', () => {
    const rows = buildEnvelopeSnapshotRows(
      [
        pos({ envelopeId: 'env-av', costBasisRef: 1000, marketValueRef: null,
              marketValue: null, unrealizedPnL: null, unrealizedPnLRef: null }),
      ],
      CTX,
    )
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r.total_market_value).toBe(1000)     // fallback cost
    expect(r.total_cost_basis).toBe(1000)
    expect(r.valued_count).toBe(0)
    expect(r.total_pnl).toBe(0)                 // pas de valuedCount → 0
    expect(r.total_pnl_pct).toBeNull()          // pas de PnL fiable
  })

  it('contexte propagé sur chaque ligne (user_id, dates, currency, source)', () => {
    const rows = buildEnvelopeSnapshotRows(
      [pos({ envelopeId: 'env-pea' })],
      CTX,
    )
    expect(rows[0]).toMatchObject({
      user_id:            'user-aaa',
      snapshot_date:      '2026-05-26',
      snapshot_at:        '2026-05-26T12:00:00.000Z',
      reference_currency: 'EUR',
      source:             'manual',
    })
  })

  it('allocation_by_envelope du sub-snapshot = 100 % sur l\'enveloppe courante', () => {
    const rows = buildEnvelopeSnapshotRows(
      [pos({ envelopeId: 'env-pea', costBasisRef: 1000, marketValueRef: 1100 })],
      CTX,
    )
    expect(rows[0]!.allocation_by_envelope).toEqual({ 'env-pea': 1100 })
  })
})
