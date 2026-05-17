import { describe, it, expect } from 'vitest'
import {
  detectBroker, detectDelimiter, parseNumberLoose, parseDateLoose, looksLikeISIN,
  parseBoursorama, parseDegiro, parseTradeRepublic, parseBrokerCsv,
} from '../csvImport'

describe('csvImport — helpers bas niveau', () => {
  it('detectDelimiter retourne ;  ou , selon la fréquence', () => {
    expect(detectDelimiter('a;b;c;d')).toBe(';')
    expect(detectDelimiter('a,b,c,d')).toBe(',')
    // Si autant de , que de ; → priorité virgule (par défaut EN).
    expect(detectDelimiter('a,b;c')).toBe(',')
  })

  it('parseNumberLoose accepte FR et EN', () => {
    expect(parseNumberLoose('1234,56')).toBe(1234.56)
    expect(parseNumberLoose('1.234,56')).toBe(1234.56)
    expect(parseNumberLoose('1,234.56')).toBe(1234.56)
    expect(parseNumberLoose('12.34')).toBe(12.34)
    expect(parseNumberLoose('12 €')).toBe(12)
    expect(parseNumberLoose('')).toBeNaN()
  })

  it('parseDateLoose accepte DD/MM/YYYY et ISO', () => {
    expect(parseDateLoose('15/03/2024')).toBe('2024-03-15')
    expect(parseDateLoose('2024-03-15')).toBe('2024-03-15')
    expect(parseDateLoose('2024-03-15T10:00:00Z')).toBe('2024-03-15')
    expect(parseDateLoose('invalid')).toBeNull()
  })

  it('looksLikeISIN valide le format', () => {
    expect(looksLikeISIN('FR0010315770')).toBe(true)
    expect(looksLikeISIN('US0378331005')).toBe(true)
    expect(looksLikeISIN('FR123')).toBe(false)
    expect(looksLikeISIN('')).toBe(false)
    expect(looksLikeISIN(null)).toBe(false)
  })
})

describe('detectBroker', () => {
  it('détecte Boursorama via "Libellé" / "Cours d\'achat"', () => {
    expect(detectBroker(['Date', 'Libellé', 'ISIN', 'Quantité', "Cours d'achat", 'Devise', 'Montant']))
      .toBe('boursorama')
  })

  it('détecte Degiro via "Produit" + "Bourse"', () => {
    expect(detectBroker(['Date', 'Produit', 'ISIN', 'Bourse', 'Quantité', 'Prix unitaire', 'Valeur locale']))
      .toBe('degiro')
  })

  it('détecte Trade Republic via "Type" + "ISIN" + "Total"', () => {
    expect(detectBroker(['Date', 'Type', 'ISIN', 'Nom', 'Quantité', 'Prix', 'Total']))
      .toBe('trade_republic')
  })

  it('retourne unknown si aucun marqueur ne match', () => {
    expect(detectBroker(['col1', 'col2', 'col3'])).toBe('unknown')
  })
})

describe('parseBoursorama', () => {
  it('extrait les positions avec séparateur ;', () => {
    const csv = [
      'Date;Libellé;ISIN;Quantité;Cours d\'achat;Devise;Montant',
      '15/03/2024;Apple Inc;US0378331005;10;180,50;USD;1805,00',
      '20/03/2024;LVMH;FR0000121014;5;750,25;EUR;3751,25',
    ].join('\n')
    const r = parseBoursorama(csv)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({
      isin: 'US0378331005',
      name: 'Apple Inc',
      quantity: 10,
      average_price: 180.50,
      currency: 'USD',
      acquisition_date: '2024-03-15',
      broker: 'boursorama',
    })
    expect(r.rows[1]?.isin).toBe('FR0000121014')
  })

  it('rapporte une erreur sur ISIN invalide', () => {
    const csv = [
      'Date;Libellé;ISIN;Quantité;Cours;Devise',
      '01/01/2024;BadStock;XX;10;100;EUR',
    ].join('\n')
    const r = parseBoursorama(csv)
    expect(r.rows).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]?.reason).toMatch(/ISIN/i)
  })
})

describe('parseDegiro', () => {
  it('extrait les positions et tombe sur la valeur locale si pas de prix unitaire', () => {
    const csv = [
      'Date,Produit,ISIN,Bourse,Quantité,Prix unitaire,Valeur locale,Devise',
      '2024-03-15,Apple Inc,US0378331005,NASDAQ,10,,1805.00,USD',
      '2024-03-20,LVMH,FR0000121014,EPA,5,750.25,3751.25,EUR',
    ].join('\n')
    const r = parseDegiro(csv)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]?.average_price).toBeCloseTo(180.50, 2)
    expect(r.rows[0]?.currency).toBe('USD')
    expect(r.rows[1]?.average_price).toBeCloseTo(750.25, 2)
  })
})

describe('parseTradeRepublic', () => {
  it('importe les achats et ignore les autres types', () => {
    const csv = [
      'Date,Type,ISIN,Nom,Quantité,Prix,Total',
      '2024-03-15,Achat,US0378331005,Apple Inc,10,180.50,1805.00',
      '2024-03-16,Dividende,US0378331005,Apple Inc,0,,5.50',
      '2024-03-20,Buy,FR0000121014,LVMH,5,750.25,3751.25',
    ].join('\n')
    const r = parseTradeRepublic(csv)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]?.broker).toBe('trade_republic')
    expect(r.rows[1]?.isin).toBe('FR0000121014')
  })

  it('déduit le prix unitaire depuis le total quand le prix manque', () => {
    const csv = [
      'Date,Type,ISIN,Nom,Quantité,Prix,Total',
      '2024-03-15,Achat,US0378331005,Apple Inc,10,,1805.00',
    ].join('\n')
    const r = parseTradeRepublic(csv)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]?.average_price).toBeCloseTo(180.50, 2)
  })
})

describe('parseBrokerCsv — dispatcher', () => {
  it('dispatche automatiquement vers le bon parser', () => {
    const bourso = [
      'Date;Libellé;ISIN;Quantité;Cours d\'achat;Devise;Montant',
      '15/03/2024;Apple;US0378331005;10;180,50;EUR;1805,00',
    ].join('\n')
    expect(parseBrokerCsv(bourso).broker).toBe('boursorama')

    const degiro = [
      'Date,Produit,ISIN,Bourse,Quantité,Prix unitaire,Valeur locale',
      '2024-03-15,Apple,US0378331005,NASDAQ,10,180.50,1805.00',
    ].join('\n')
    expect(parseBrokerCsv(degiro).broker).toBe('degiro')

    const tr = [
      'Date,Type,ISIN,Nom,Quantité,Prix,Total',
      '2024-03-15,Achat,US0378331005,Apple,10,180.50,1805.00',
    ].join('\n')
    expect(parseBrokerCsv(tr).broker).toBe('trade_republic')
  })

  it('respecte le hint quand fourni', () => {
    const csv = 'Date,ISIN,Quantité,Cours d\'achat\n15/03/2024,US0378331005,10,180.50'
    const r = parseBrokerCsv(csv, 'boursorama')
    expect(r.broker).toBe('boursorama')
  })
})
