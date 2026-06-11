/**
 * Tests Sprint 4 — export CSV positions / transactions.
 *
 * Couvre le format Excel FR (BOM, séparateur `;`, EOL `\r\n`), l'échappement
 * RFC-4180, le format date/nombre FR, le calcul +/- latente en décimal, et les
 * cas limites (liste vide, position sans prix, dividende sans quantité).
 */

import { describe, it, expect } from 'vitest'
import {
  buildPositionsCsv,
  buildTransactionsCsv,
  escapeCsv,
  frNumber,
  frDate,
  slugify,
  CSV_SEP,
  CSV_EOL,
  type PositionCsvRow,
  type TransactionCsvRow,
} from '../export-csv'

function posRow(over: Partial<PositionCsvRow> = {}): PositionCsvRow {
  return {
    envelopeName: 'PEA',
    name:         'Amundi MSCI World',
    isin:         'LU1681043599',
    ticker:       'CW8',
    quantity:     10,
    averagePrice: 100,
    currency:     'EUR',
    marketValue:  1200,
    costBasis:    1000,
    pricedAt:     '2026-06-10T09:30:00.000Z',
    ...over,
  }
}

function txRow(over: Partial<TransactionCsvRow> = {}): TransactionCsvRow {
  return {
    executedAt:      '2026-03-15T00:00:00.000Z',
    transactionType: 'purchase',
    quantity:        5,
    unitPrice:       100,
    fees:            2,
    amount:          -502,
    currency:        'EUR',
    label:           null,
    realizedPnl:     null,
    ...over,
  }
}

describe('helpers de formatage', () => {
  it('frNumber : virgule décimale, arrondi 6 décimales, vide si null', () => {
    expect(frNumber(1234.5)).toBe('1234,5')
    expect(frNumber(0.10909090909)).toBe('0,109091')
    expect(frNumber(-5)).toBe('-5')
    expect(frNumber(null)).toBe('')
    expect(frNumber(undefined)).toBe('')
    expect(frNumber(NaN)).toBe('')
  })

  it('frNumber : pas de séparateur de milliers', () => {
    expect(frNumber(1000000)).toBe('1000000')
  })

  it('frDate : ISO → JJ/MM/AAAA', () => {
    expect(frDate('2026-06-10T09:30:00.000Z')).toBe('10/06/2026')
    expect(frDate('2026-03-15')).toBe('15/03/2026')
    expect(frDate(null)).toBe('')
    expect(frDate('')).toBe('')
  })

  it('escapeCsv : entoure de guillemets si caractère spécial, double les "', () => {
    expect(escapeCsv('simple')).toBe('simple')
    expect(escapeCsv('a;b')).toBe('"a;b"')
    expect(escapeCsv('dit "bonjour"')).toBe('"dit ""bonjour"""')
    expect(escapeCsv('ligne1\nligne2')).toBe('"ligne1\nligne2"')
  })

  it('slugify : sans accents ni espaces, minuscules', () => {
    expect(slugify('Amundi MSCI World')).toBe('amundi-msci-world')
    expect(slugify('Société Générale')).toBe('societe-generale')
    expect(slugify('   ')).toBe('export')
    expect(slugify('!!!')).toBe('export')
  })
})

describe('buildPositionsCsv', () => {
  it('commence par le BOM UTF-8', () => {
    const csv = buildPositionsCsv([])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
  })

  it('utilise le séparateur ; et la fin de ligne \\r\\n', () => {
    const csv = buildPositionsCsv([posRow()])
    expect(csv).toContain(CSV_SEP)
    expect(csv).toContain(CSV_EOL)
    // header + 1 ligne data + EOL final → 2 lignes non vides
    const body = csv.slice(1) // retire BOM
    const lines = body.split(CSV_EOL).filter((l) => l.length > 0)
    expect(lines).toHaveLength(2)
  })

  it('liste vide → header seul', () => {
    const csv = buildPositionsCsv([])
    const lines = csv.slice(1).split(CSV_EOL).filter((l) => l.length > 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Enveloppe')
    expect(lines[0]).toContain('ISIN / Ticker')
  })

  it('en-tête mentionne la devise de référence', () => {
    const csv = buildPositionsCsv([posRow()], 'USD')
    expect(csv).toContain('Valeur marché (USD)')
  })

  it('+/- latente calculée en montant et en décimal', () => {
    const csv = buildPositionsCsv([posRow({ marketValue: 1200, costBasis: 1000 })])
    const dataLine = csv.slice(1).split(CSV_EOL)[1]!
    const cells = dataLine.split(CSV_SEP)
    // … Valeur(1200);Coût(1000);+/-(200);+/-%(0,2);date
    expect(cells).toContain('200')   // pnl montant
    expect(cells).toContain('0,2')   // pnl ratio décimal
  })

  it('position sans prix → valeur/pnl vides, pas de crash', () => {
    const csv = buildPositionsCsv([posRow({ marketValue: null })])
    const cells = csv.slice(1).split(CSV_EOL)[1]!.split(CSV_SEP)
    // Valeur marché vide, +/- vide, +/-% vide
    expect(cells[6]).toBe('')   // Valeur marché
    expect(cells[8]).toBe('')   // +/- latente
    expect(cells[9]).toBe('')   // +/- latente %
  })

  it('ISIN absent → bascule sur le ticker', () => {
    const csv = buildPositionsCsv([posRow({ isin: null, ticker: 'AAPL' })])
    expect(csv).toContain('AAPL')
  })

  it('échappe un nom contenant un point-virgule', () => {
    const csv = buildPositionsCsv([posRow({ name: 'Foo; Bar Inc' })])
    expect(csv).toContain('"Foo; Bar Inc"')
  })
})

describe('buildTransactionsCsv', () => {
  it('BOM + header attendu', () => {
    const csv = buildTransactionsCsv([])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv).toContain('PV réalisée')
    expect(csv).toContain('Montant brut')
  })

  it('traduit les types en français', () => {
    const csv = buildTransactionsCsv([
      txRow({ transactionType: 'purchase' }),
      txRow({ transactionType: 'sale' }),
      txRow({ transactionType: 'dividend', quantity: null, unitPrice: null, fees: null, amount: 30 }),
    ])
    expect(csv).toContain('Achat')
    expect(csv).toContain('Vente')
    expect(csv).toContain('Dividende')
  })

  it('achat : brut = qté×PU, net = brut + frais', () => {
    const csv = buildTransactionsCsv([txRow({ quantity: 5, unitPrice: 100, fees: 2 })])
    const cells = csv.slice(1).split(CSV_EOL)[1]!.split(CSV_SEP)
    expect(cells[5]).toBe('500')   // brut
    expect(cells[6]).toBe('502')   // net = 500 + 2
  })

  it('vente : net = brut − frais, PV réalisée présente', () => {
    const csv = buildTransactionsCsv([
      txRow({ transactionType: 'sale', quantity: 5, unitPrice: 130, fees: 1, realizedPnl: 145 }),
    ])
    const cells = csv.slice(1).split(CSV_EOL)[1]!.split(CSV_SEP)
    expect(cells[5]).toBe('650')   // brut
    expect(cells[6]).toBe('649')   // net = 650 − 1
    expect(cells[9]).toBe('145')   // PV réalisée
  })

  it('dividende : quantité vide, net = montant', () => {
    const csv = buildTransactionsCsv([
      txRow({ transactionType: 'dividend', quantity: null, unitPrice: null, fees: null, amount: 30 }),
    ])
    const cells = csv.slice(1).split(CSV_EOL)[1]!.split(CSV_SEP)
    expect(cells[2]).toBe('')      // Quantité vide
    expect(cells[6]).toBe('30')    // net
  })

  it('liste vide → header seul', () => {
    const csv = buildTransactionsCsv([])
    const lines = csv.slice(1).split(CSV_EOL).filter((l) => l.length > 0)
    expect(lines).toHaveLength(1)
  })

  it('date au format FR', () => {
    const csv = buildTransactionsCsv([txRow({ executedAt: '2026-03-15T00:00:00.000Z' })])
    expect(csv).toContain('15/03/2026')
  })
})
