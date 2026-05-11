import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CoinGeckoProvider } from '../providers/coingecko'
import type { InstrumentLookup } from '../providers/types'

const inst = (over: Partial<InstrumentLookup> = {}): InstrumentLookup => ({
  ticker: null, isin: null, providerId: null, assetClass: 'crypto', ...over,
})

describe('CoinGeckoProvider — résolution ticker → id', () => {
  let provider: CoinGeckoProvider
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    provider = new CoinGeckoProvider()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  function mockPriceResponse(id: string, price: number) {
    return new Response(JSON.stringify({
      [id]: { eur: price, last_updated_at: 1700000000 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  it('mappe BTC → bitcoin via quick map (1 seul appel API)', async () => {
    fetchSpy.mockResolvedValueOnce(mockPriceResponse('bitcoin', 60000))

    const q = await provider.fetchQuote(inst({ ticker: 'BTC' }))
    expect(q?.query).toBe('bitcoin')
    expect(q?.price).toBe(60000)
    expect(q?.currency).toBe('EUR')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]![0]).toContain('ids=bitcoin')
  })

  it('strippe le suffixe -EUR / -USD du ticker', async () => {
    fetchSpy.mockResolvedValueOnce(mockPriceResponse('bitcoin', 60000))

    const q = await provider.fetchQuote(inst({ ticker: 'BTC-EUR' }))
    expect(q?.query).toBe('bitcoin')
    expect(fetchSpy.mock.calls[0]![0]).toContain('ids=bitcoin')
  })

  it('utilise providerId directement si fourni', async () => {
    fetchSpy.mockResolvedValueOnce(mockPriceResponse('ethereum', 3000))

    const q = await provider.fetchQuote(inst({ providerId: 'ethereum', ticker: 'ETH' }))
    expect(q?.query).toBe('ethereum')
    // 1 seul appel : providerId fourni, pas besoin de résoudre
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('fallback /search si ticker pas dans la quick map', async () => {
    // Premier appel : search
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      coins: [{ id: 'some-coin', symbol: 'NEW', name: 'NewCoin' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    // Deuxième appel : price
    fetchSpy.mockResolvedValueOnce(mockPriceResponse('some-coin', 1.23))

    const q = await provider.fetchQuote(inst({ ticker: 'NEW' }))
    expect(q?.query).toBe('some-coin')
    expect(q?.price).toBe(1.23)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[0]![0]).toContain('/search?query=NEW')
  })

  it('renvoie null si ni providerId ni ticker', async () => {
    const q = await provider.fetchQuote(inst())
    expect(q).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renvoie null si CoinGecko ne connaît pas l\'id', async () => {
    // /simple/price avec un id inexistant renvoie {} (pas la clé)
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))

    const q = await provider.fetchQuote(inst({ providerId: 'doesnotexist' }))
    expect(q).toBeNull()
  })
})
