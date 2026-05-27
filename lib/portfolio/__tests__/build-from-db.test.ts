/**
 * Tests de la chaîne DB → moteur de valorisation, focalisés sur le FX.
 *
 * On mocke `getFxRate` (qui dépend de Supabase + Frankfurter) et on
 * simule un client Supabase minimaliste pour vérifier :
 *  1. qu'une position USD est correctement convertie en EUR quand le
 *     taux est disponible ;
 *  2. qu'elle reste comptabilisée (repli 1:1) ET signalée dans
 *     `summary.excludedForFx` quand le taux est absent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/providers/fx', () => ({
  getFxRate: vi.fn(),
}))

import { getFxRate } from '@/lib/providers/fx'
import { buildPortfolioFromDb } from '../build-from-db'

const mockedGetFxRate = vi.mocked(getFxRate)

// ─── Stub Supabase ─────────────────────────────────────────────────────
// On émule juste ce dont `buildPortfolioFromDb` a besoin :
//   supabase.from(table).select(...).eq(...).in(...).order(...) puis await.
// Chaque méthode du chain retourne `this`. L'objet est thenable pour que
// `await` récupère { data, error }.

interface TableData {
  positions:           unknown[]
  instruments:         unknown[]
  instrument_prices:   unknown[]
  // Tables additionnelles introduites par R6 / E12 (Étape 3). Par défaut
  // vides — les tests qui veulent peupler les snapshots ou cash flows
  // par enveloppe les fournissent explicitement.
  financial_envelopes?: unknown[]
  portfolio_snapshots?: unknown[]
  transactions?:        unknown[]
}

function makeSupabaseStub(data: TableData) {
  const makeChain = (rows: unknown[]) => {
    const chain = {
      select: () => chain,
      eq:     () => chain,
      in:     () => chain,
      or:     () => chain,
      order:  () => chain,
      not:    () => chain,   // requête R6 (realized_pnl IS NOT NULL)
      gte:    () => chain,   // requête R6 (executed_at >= cutoff)
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: rows, error: null })
      },
    }
    return chain
  }

  return {
    from(table: keyof TableData) {
      // Tables optionnelles : si non fournies par le test, on renvoie [].
      const rows = data[table] ?? []
      return makeChain(rows as unknown[])
    },
  } as unknown as Parameters<typeof buildPortfolioFromDb>[0]
}

// ─── Fixtures ──────────────────────────────────────────────────────────

const TODAY_ISO = new Date().toISOString()

function applePositionUsd() {
  return {
    positions: [{
      id:               'pos-1',
      instrument_id:    'inst-aapl',
      envelope_id:      null,
      quantity:         10,
      average_price:    100,
      currency:         'USD',
      acquisition_date: null,
      status:           'active',
      broker:           null,
    }],
    instruments: [{
      id:                  'inst-aapl',
      name:                'Apple Inc.',
      ticker:              'AAPL',
      isin:                null,
      asset_class:         'equity',
      asset_subclass:      null,
      currency:            'USD',
      sector:              'Technology',
      geography:           'USA',
      valuation_frequency: 'daily',
    }],
    instrument_prices: [{
      instrument_id: 'inst-aapl',
      price:         110,
      currency:      'USD',
      priced_at:     TODAY_ISO,
      source:        'yahoo',
      confidence:    'high',
    }],
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildPortfolioFromDb — multi-devise', () => {
  beforeEach(() => {
    mockedGetFxRate.mockReset()
  })

  it('convertit une position USD en EUR quand le taux USD/EUR est dispo', async () => {
    mockedGetFxRate.mockImplementation(async (from, to) => {
      if (from === to)                  return 1
      if (from === 'USD' && to === 'EUR') return 0.9
      throw new Error(`rate ${from}/${to} non dispo`)
    })

    const supabase = makeSupabaseStub(applePositionUsd())
    const result   = await buildPortfolioFromDb(supabase, 'user-1', {
      referenceCurrency: 'EUR',
    })

    // La position reste en USD localement.
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0]!.costBasis).toBe(1000)      // 10 × 100 USD
    expect(result.positions[0]!.marketValue).toBe(1100)    // 10 × 110 USD

    // En devise de référence (EUR), via le taux 0.9 :
    //   cost_basis_ref = 1000 × 0.9 = 900
    //   market_value_ref = 1100 × 0.9 = 990
    //   pnl_ref          = 90
    expect(result.summary.totalCostBasis).toBeCloseTo(900, 1)
    expect(result.summary.totalMarketValue).toBeCloseTo(990, 1)
    expect(result.summary.totalUnrealizedPnL).toBeCloseTo(90, 1)

    // Aucune paire en repli 1:1.
    expect(result.summary.excludedForFx).toEqual([])
    expect(mockedGetFxRate).toHaveBeenCalledWith('USD', 'EUR')
  })

  it("comptabilise la position en repli 1:1 ET la signale quand le taux est absent", async () => {
    mockedGetFxRate.mockRejectedValue(new Error('rate not available'))

    const supabase = makeSupabaseStub(applePositionUsd())
    const result   = await buildPortfolioFromDb(supabase, 'user-1', {
      referenceCurrency: 'EUR',
    })

    // La position est toujours là, valorisée localement.
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0]!.marketValue).toBe(1100)

    // Repli 1:1 : la position USD est comptée 1000 EUR / 1100 EUR
    // au lieu d'être silencieusement exclue des totaux.
    expect(result.summary.totalCostBasis).toBeCloseTo(1000, 1)
    expect(result.summary.totalMarketValue).toBeCloseTo(1100, 1)
    expect(result.summary.totalUnrealizedPnL).toBeCloseTo(100, 1)

    // La paire est remontée pour permettre un badge UI explicite.
    expect(result.summary.excludedForFx).toEqual([
      { from: 'USD', to: 'EUR', positionsCount: 1 },
    ])
  })
})
