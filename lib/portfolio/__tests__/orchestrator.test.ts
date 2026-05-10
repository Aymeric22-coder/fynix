import { describe, it, expect, vi } from 'vitest'
import { PriceOrchestrator, type ProviderConfig } from '../providers/orchestrator'
import type {
  InstrumentLookup, PortfolioPriceProvider, PriceQuote,
} from '../providers/types'
import type { AssetClass } from '@/types/database.types'

// ─── Fakes ────────────────────────────────────────────────────────────────

class FakeProvider implements PortfolioPriceProvider {
  constructor(
    public code: string,
    private classes: AssetClass[],
    private behavior: 'success' | 'null' | 'throw' = 'success',
  ) {}

  supports(c: AssetClass) { return this.classes.includes(c) }

  fetchQuote = vi.fn(async (_inst: InstrumentLookup): Promise<PriceQuote | null> => {
    if (this.behavior === 'throw') throw new Error('boom')
    if (this.behavior === 'null')  return null
    return {
      query: 'X', price: 100, currency: 'EUR',
      pricedAt: new Date(), source: this.code, confidence: 'high',
    }
  })
}

const cfg = (
  code: string, priority: number, classes: AssetClass[], isActive = true,
): ProviderConfig => ({ code, priority, isActive, supportedClasses: classes })

const inst = (assetClass: AssetClass): InstrumentLookup => ({
  ticker: 'TST', isin: null, providerId: null, assetClass,
})

// ─── Tests ────────────────────────────────────────────────────────────────

describe('PriceOrchestrator', () => {
  it('utilise le provider de plus haute priorité (priority 1)', async () => {
    const a = new FakeProvider('a', ['equity'])
    const b = new FakeProvider('b', ['equity'])
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 10, ['equity']),
      cfg('b', 1,  ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q?.source).toBe('b')
    expect(b.fetchQuote).toHaveBeenCalled()
    expect(a.fetchQuote).not.toHaveBeenCalled()
  })

  it('fallback au provider suivant si le premier renvoie null', async () => {
    const a = new FakeProvider('a', ['equity'], 'null')
    const b = new FakeProvider('b', ['equity'])
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 1, ['equity']),
      cfg('b', 2, ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q?.source).toBe('b')
    expect(a.fetchQuote).toHaveBeenCalled()
    expect(b.fetchQuote).toHaveBeenCalled()
  })

  it('fallback si le premier provider lève une exception', async () => {
    const a = new FakeProvider('a', ['equity'], 'throw')
    const b = new FakeProvider('b', ['equity'])
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 1, ['equity']),
      cfg('b', 2, ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q?.source).toBe('b')
  })

  it('exclut les providers inactifs', async () => {
    const a = new FakeProvider('a', ['equity'])
    const b = new FakeProvider('b', ['equity'])
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 1, ['equity'], false),  // inactif
      cfg('b', 2, ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q?.source).toBe('b')
    expect(a.fetchQuote).not.toHaveBeenCalled()
  })

  it('exclut les providers qui ne supportent pas la classe', async () => {
    const a = new FakeProvider('a', ['crypto'])
    const b = new FakeProvider('b', ['equity'])
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 1, ['crypto']),
      cfg('b', 2, ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q?.source).toBe('b')
    expect(a.fetchQuote).not.toHaveBeenCalled()
  })

  it('renvoie null si aucun provider actif/compatible', async () => {
    const a = new FakeProvider('a', ['crypto'])
    const orch = new PriceOrchestrator([a], [cfg('a', 1, ['crypto'])])
    const q = await orch.getQuote(inst('equity'))
    expect(q).toBeNull()
  })

  it('renvoie null si tous les providers échouent', async () => {
    const a = new FakeProvider('a', ['equity'], 'null')
    const b = new FakeProvider('b', ['equity'], 'throw')
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 1, ['equity']),
      cfg('b', 2, ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q).toBeNull()
  })

  it('rejette une quote avec price ≤ 0 et passe au suivant', async () => {
    const a = new FakeProvider('a', ['equity'])
    a.fetchQuote = vi.fn(async () => ({
      query: 'X', price: 0, currency: 'EUR' as const,
      pricedAt: new Date(), source: 'a', confidence: 'high' as const,
    }))
    const b = new FakeProvider('b', ['equity'])
    const orch = new PriceOrchestrator([a, b], [
      cfg('a', 1, ['equity']),
      cfg('b', 2, ['equity']),
    ])
    const q = await orch.getQuote(inst('equity'))
    expect(q?.source).toBe('b')
  })
})
