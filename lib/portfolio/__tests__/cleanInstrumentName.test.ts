import { describe, it, expect } from 'vitest'
import { cleanInstrumentName } from '../cleanInstrumentName'

describe('cleanInstrumentName', () => {
  it('retire le prefixe VENTE et la date (reste preserve)', () => {
    // Capitalise = 1ere lettre majuscule, reste inchange (consigne D16).
    expect(cleanInstrumentName({ rawName: 'VENTE ALSTOM 15/03/24' })).toBe('ALSTOM')
  })

  it('retire le prefixe ACHAT (rest minuscule reste minuscule)', () => {
    expect(cleanInstrumentName({ rawName: 'achat asml 12/03' })).toBe('Asml')
  })

  it('ACQUISITION / CESSION / VIRT / REMBT', () => {
    expect(cleanInstrumentName({ rawName: 'ACQUISITION TotalEnergies' })).toBe('TotalEnergies')
    expect(cleanInstrumentName({ rawName: 'CESSION Sanofi' })).toBe('Sanofi')
    expect(cleanInstrumentName({ rawName: 'VIRT Carrefour SA' })).toBe('Carrefour SA')
    expect(cleanInstrumentName({ rawName: 'REMBT LVMH 01/02/2024' })).toBe('LVMH')
  })

  it('compresse les espaces multiples laisses par le strip', () => {
    expect(cleanInstrumentName({ rawName: 'VENTE   AAPL    01/01/2025' })).toBe('AAPL')
  })

  it('libelle sans prefixe ni date est juste capitalise', () => {
    expect(cleanInstrumentName({ rawName: 'amundi msci world ucits etf' }))
      .toBe('Amundi msci world ucits etf')
  })

  it('fallback ISIN si nettoyage < 2 caracteres', () => {
    expect(cleanInstrumentName({
      rawName: 'VENTE A 15/03/24', isin: 'FR0000131104',
    })).toBe('FR0000131104')
  })

  it('fallback ticker si nettoyage trop court et pas d\'ISIN', () => {
    expect(cleanInstrumentName({
      rawName: 'VENTE 01/01', isin: null, ticker: 'AAPL',
    })).toBe('AAPL')
  })

  it('rawName vide → fallback ISIN/ticker/empty', () => {
    expect(cleanInstrumentName({ rawName: '', isin: 'FR0001' })).toBe('FR0001')
    expect(cleanInstrumentName({ rawName: '', isin: null, ticker: 'BTC' })).toBe('BTC')
    expect(cleanInstrumentName({ rawName: '' })).toBe('')
  })
})
