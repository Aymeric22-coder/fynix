import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JustEtfProvider, parseJustEtfQuote } from '../providers/justetf'
import type { InstrumentLookup } from '../providers/types'

const inst = (over: Partial<InstrumentLookup> = {}): InstrumentLookup => ({
  ticker: null, isin: null, providerId: null, assetClass: 'etf', ...over,
})

describe('parseJustEtfQuote', () => {
  it('extrait le prix et la date depuis une réponse JustETF complète', () => {
    const r = parseJustEtfQuote(
      {
        latestQuote:       { raw: 121.05, localized: '121.05' },
        latestQuoteDate:   '2026-05-15',
        quoteTradingVenue: 'XETRA',
      },
      'EUR',
    )
    expect(r?.price).toBe(121.05)
    expect(r?.currency).toBe('EUR')
    expect(r?.pricedAt.toISOString().slice(0, 10)).toBe('2026-05-15')
  })

  it('fallback now() si latestQuoteDate est absent ou invalide', () => {
    const r1 = parseJustEtfQuote({ latestQuote: { raw: 50 } }, 'EUR')
    expect(r1?.pricedAt).toBeInstanceOf(Date)
    expect(isNaN(r1!.pricedAt.getTime())).toBe(false)

    const r2 = parseJustEtfQuote(
      { latestQuote: { raw: 50 }, latestQuoteDate: 'not-a-date' },
      'EUR',
    )
    expect(r2?.pricedAt).toBeInstanceOf(Date)
  })

  it('renvoie null si latestQuote.raw est manquant ou ≤ 0', () => {
    expect(parseJustEtfQuote({}, 'EUR')).toBeNull()
    expect(parseJustEtfQuote({ latestQuote: {} }, 'EUR')).toBeNull()
    expect(parseJustEtfQuote({ latestQuote: { raw: 0 } }, 'EUR')).toBeNull()
    expect(parseJustEtfQuote({ latestQuote: { raw: -10 } }, 'EUR')).toBeNull()
  })

  it('propage la devise demandée', () => {
    const r = parseJustEtfQuote({ latestQuote: { raw: 100 } }, 'USD')
    expect(r?.currency).toBe('USD')
  })
})

describe('JustEtfProvider', () => {
  let provider: JustEtfProvider
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    provider = new JustEtfProvider()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  function mockJson(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('supporte uniquement la classe etf', () => {
    expect(provider.supports('etf')).toBe(true)
    expect(provider.supports('equity')).toBe(false)
    expect(provider.supports('fund')).toBe(false)
    expect(provider.supports('crypto')).toBe(false)
  })

  it('renvoie null sans ISIN (JustETF est indexé par ISIN)', async () => {
    const q = await provider.fetchQuote(inst({ ticker: 'IWDA' }))
    expect(q).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renvoie null sur ISIN trop court', async () => {
    const q = await provider.fetchQuote(inst({ isin: 'IE00B' }))
    expect(q).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetch l’endpoint /api/etfs/{ISIN}/quote et renvoie une PriceQuote', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({
      latestQuote:     { raw: 121.05 },
      latestQuoteDate: '2026-05-15',
    }))

    const q = await provider.fetchQuote(inst({ isin: 'IE00B4L5Y983' }))
    expect(q).not.toBeNull()
    expect(q?.price).toBe(121.05)
    expect(q?.currency).toBe('EUR')
    expect(q?.source).toBe('justetf')
    expect(q?.confidence).toBe('high')
    expect(q?.query).toBe('IE00B4L5Y983')

    const url = fetchSpy.mock.calls[0]![0] as string
    expect(url).toContain('/api/etfs/IE00B4L5Y983/quote')
    expect(url).toContain('currency=EUR')
    expect(url).toContain('isin=IE00B4L5Y983')
  })

  it('renvoie null sur HTTP non-OK', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }))
    const q = await provider.fetchQuote(inst({ isin: 'IE00B4L5Y983' }))
    expect(q).toBeNull()
  })

  it('renvoie null sur quote vide', async () => {
    fetchSpy.mockResolvedValueOnce(mockJson({}))
    const q = await provider.fetchQuote(inst({ isin: 'IE00B4L5Y983' }))
    expect(q).toBeNull()
  })

  it('renvoie null si fetch throw (réseau / timeout)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'))
    const q = await provider.fetchQuote(inst({ isin: 'IE00B4L5Y983' }))
    expect(q).toBeNull()
  })
})
