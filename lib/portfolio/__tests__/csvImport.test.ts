import { describe, it, expect } from 'vitest'
import {
  detectBroker, detectDelimiter, parseNumberLoose, parseDateLoose, looksLikeISIN,
  parseBrokerCsv, aggregateToPositions, decodeCsvBytes,
} from '../csvImport'

describe('csvImport — helpers bas niveau', () => {
  it('detectDelimiter — virgule, point-virgule, tabulation', () => {
    expect(detectDelimiter('a;b;c;d')).toBe(';')
    expect(detectDelimiter('a,b,c,d')).toBe(',')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
  })

  it('parseNumberLoose accepte FR/EN/devises/espaces', () => {
    expect(parseNumberLoose('1234,56')).toBe(1234.56)
    expect(parseNumberLoose('1.234,56')).toBe(1234.56)
    expect(parseNumberLoose('1,234.56')).toBe(1234.56)
    expect(parseNumberLoose('12 €')).toBe(12)
    expect(parseNumberLoose('')).toBeNaN()
    expect(parseNumberLoose(null)).toBeNaN()
  })

  it('parseDateLoose accepte ISO, datetime ISO, FR slash', () => {
    expect(parseDateLoose('15/03/2024')).toBe('2024-03-15')
    expect(parseDateLoose('2024-03-15')).toBe('2024-03-15')
    expect(parseDateLoose('2024-03-15T10:00:00.000+00:00')).toBe('2024-03-15')
    expect(parseDateLoose('invalid')).toBeNull()
  })

  it('looksLikeISIN', () => {
    expect(looksLikeISIN('FR0010315770')).toBe(true)
    expect(looksLikeISIN('US0378331005')).toBe(true)
    expect(looksLikeISIN('BTC')).toBe(false)
    expect(looksLikeISIN(null)).toBe(false)
  })

  it('decodeCsvBytes — UTF-8 et ISO-8859-1', () => {
    // UTF-8 standard
    const utf8 = new TextEncoder().encode('Libellé;ISIN\nApple;US0378331005').buffer
    expect(decodeCsvBytes(utf8)).toContain('Libellé')

    // ISO-8859-1 : "é" = 0xE9 (1 octet, invalide en UTF-8 strict isolé)
    const latin1 = new Uint8Array([0x4C, 0x69, 0x62, 0x65, 0x6C, 0x6C, 0xE9, 0x3B, 0x49, 0x53, 0x49, 0x4E])
    expect(decodeCsvBytes(latin1)).toContain('Libellé')
  })
})

describe('detectBroker — signatures par en-têtes', () => {
  it('Trade Republic via "datetime"+"category"+"asset_class"+"transaction_id"', () => {
    const headers = ['datetime', 'date', 'account_type', 'category', 'type', 'asset_class', 'name', 'symbol', 'shares', 'price', 'amount', 'fee', 'tax', 'currency', 'transaction_id']
    expect(detectBroker(headers)).toBe('trade_republic')
  })

  it('Degiro via "Produit"+"Code ISIN"', () => {
    expect(detectBroker(['Date', 'Produit', 'Code ISIN', 'Bourse', 'Quantité', 'Prix unitaire']))
      .toBe('degiro')
  })

  it('Boursorama via "Libellé opération"+"ISIN"', () => {
    expect(detectBroker(['Date', 'Libellé opération', 'ISIN', "Cours d'exécution", 'Quantité exécutée']))
      .toBe('boursorama')
  })

  it('Lynx / IBKR via "Symbol"+"Buy/Sell"+"TradePrice"', () => {
    expect(detectBroker(['Symbol', 'Buy/Sell', 'Quantity', 'TradePrice', 'CurrencyPrimary']))
      .toBe('lynx_ibkr')
  })

  it('Fortuneo via "Date d\'opération"+"Nature de l\'opération"', () => {
    expect(detectBroker(["Date d'opération", "Nature de l'opération", 'Quantité', 'Cours']))
      .toBe('fortuneo')
  })

  it('Linxea AV via "Date de valeur"+"Support"+"Nombre parts"', () => {
    expect(detectBroker(['Date de valeur', 'Nature mouvement', 'Support', 'Nombre parts', 'Valeur liquidative']))
      .toBe('linxea_av')
  })

  it('unknown si aucun marqueur', () => {
    expect(detectBroker(['col1', 'col2'])).toBe('unknown')
  })
})

describe('parseTradeRepublic — vrais headers + filtres', () => {
  const TR_HEADERS = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,original_amount,original_currency,fx_rate,description,transaction_id'

  it('importe BUY trading et SELL trading, ignore CARD_TRANSACTION et CUSTOMER_INPAYMENT', () => {
    const csv = [
      TR_HEADERS,
      '"2024-03-15T10:00:00Z","2024-03-15","SECURITIES","TRADING","BUY","STOCK","Apple Inc","US0378331005","10","180.50","-1805.00","1.00","0","EUR","","","","",tx1',
      '"2024-03-16T11:00:00Z","2024-03-16","SECURITIES","TRADING","SELL","STOCK","Apple Inc","US0378331005","2","185.00","370.00","1.00","0","EUR","","","","",tx2',
      '"2024-03-17T12:00:00Z","2024-03-17","CASH","CARD_TRANSACTION","CARD_PAYMENT","","Café","","","","-3.50","0","0","EUR","","","","",tx3',
      '"2024-03-18T13:00:00Z","2024-03-18","CASH","CUSTOMER_INPAYMENT","DEPOSIT","","Virement","","","","1000.00","0","0","EUR","","","","",tx4',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('trade_republic')
    expect(r.total_rows).toBe(4)
    expect(r.transactions).toHaveLength(2)
    const buy = r.transactions[0]!
    expect(buy.isin).toBe('US0378331005')
    expect(buy.ticker).toBe('US0378331005')
    expect(buy.transaction_type).toBe('buy')
    expect(buy.quantity).toBe(10)
    expect(buy.unit_price).toBe(180.50)
    expect(buy.fees).toBe(1)
    expect(buy.broker).toBe('trade_republic')
    expect(r.transactions[1]?.transaction_type).toBe('sell')
  })

  it('importe FREE_RECEIPT crypto avec prix présent', () => {
    const csv = [
      TR_HEADERS,
      '"2024-04-01T09:00:00Z","2024-04-01","CRYPTO","DELIVERY","FREE_RECEIPT","CRYPTO","Bitcoin","BTC","0.05","65000.00","-3250.00","0","0","EUR","","","","",tx5',
      '"2024-04-02T10:00:00Z","2024-04-02","CRYPTO","DELIVERY","FREE_RECEIPT","CRYPTO","Bitcoin","BTC","0.02","67000.00","-1340.00","0","0","EUR","","","","",tx6',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.transactions).toHaveLength(2)
    const t = r.transactions[0]!
    expect(t.asset_class).toBe('crypto')
    expect(t.isin).toBeNull()        // "BTC" n'est pas un ISIN
    expect(t.ticker).toBe('BTC')
    expect(t.transaction_type).toBe('buy')
    expect(t.confidence).toBe('low') // pas d'ISIN → low
  })

  it('importe FREE_DELIVERY comme vente crypto', () => {
    const csv = [
      TR_HEADERS,
      '"2024-05-01T09:00:00Z","2024-05-01","CRYPTO","DELIVERY","FREE_DELIVERY","CRYPTO","Bitcoin","BTC","0.01","70000.00","700.00","0","0","EUR","","","","",tx7',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.transactions[0]?.transaction_type).toBe('sell')
  })
})

describe('aggregateToPositions', () => {
  it('agrège 3 achats BTC en 1 position avec PRU pondéré (frais inclus)', () => {
    const csv = [
      'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,transaction_id',
      '"2024-01-01","2024-01-01","CRYPTO","DELIVERY","FREE_RECEIPT","CRYPTO","Bitcoin","BTC","1","50000","-50000","10","0","EUR",tx1',
      '"2024-02-01","2024-02-01","CRYPTO","DELIVERY","FREE_RECEIPT","CRYPTO","Bitcoin","BTC","1","60000","-60000","20","0","EUR",tx2',
      '"2024-03-01","2024-03-01","CRYPTO","DELIVERY","FREE_RECEIPT","CRYPTO","Bitcoin","BTC","1","70000","-70000","30","0","EUR",tx3',
    ].join('\n')
    const parsed = parseBrokerCsv(csv)
    const positions = aggregateToPositions(parsed.transactions)
    expect(positions).toHaveLength(1)
    const btc = positions[0]!
    expect(btc.quantity).toBe(3)
    // PRU = (50000 + 60000 + 70000 + 60 frais) / 3 = 60020
    expect(btc.unit_price).toBeCloseTo(60020, 2)
    expect(btc.acquisition_date).toBe('2024-01-01')
    expect(btc.closed).toBe(false)
  })

  it('marque comme closed si net qty ≤ 0', () => {
    const csv = [
      'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,transaction_id',
      '"2024-01-01","2024-01-01","SEC","TRADING","BUY","STOCK","Apple","US0378331005","10","180","-1800","0","0","EUR",t1',
      '"2024-02-01","2024-02-01","SEC","TRADING","SELL","STOCK","Apple","US0378331005","10","200","2000","0","0","EUR",t2',
    ].join('\n')
    const parsed = parseBrokerCsv(csv)
    const positions = aggregateToPositions(parsed.transactions)
    expect(positions[0]?.closed).toBe(true)
    expect(positions[0]?.quantity).toBe(0)
  })
})

describe('parseDegiro / Boursorama / Lynx / Fortuneo / Linxea — sanity', () => {
  it('Degiro extrait correctement', () => {
    const csv = [
      'Date,Produit,Code ISIN,Bourse,Quantité,Prix unitaire,Devise',
      '2024-03-15,Apple Inc,US0378331005,NASDAQ,10,180.50,USD',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('degiro')
    expect(r.transactions[0]?.isin).toBe('US0378331005')
    expect(r.transactions[0]?.currency).toBe('USD')
  })

  it('Boursorama extrait correctement', () => {
    const csv = [
      "Date;Libellé opération;ISIN;Quantité exécutée;Cours d'exécution;Devise",
      "15/03/2024;Achat Apple;US0378331005;10;180,50;EUR",
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('boursorama')
    expect(r.transactions[0]?.transaction_type).toBe('buy')
    expect(r.transactions[0]?.unit_price).toBe(180.50)
  })

  it('Lynx / IBKR extrait BUY/SELL', () => {
    const csv = [
      'Symbol,Buy/Sell,Quantity,TradePrice,CurrencyPrimary,TradeDate',
      'AAPL,BUY,10,180.50,USD,2024-03-15',
      'AAPL,SELL,5,200.00,USD,2024-03-20',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('lynx_ibkr')
    expect(r.transactions).toHaveLength(2)
    expect(r.transactions[0]?.transaction_type).toBe('buy')
    expect(r.transactions[1]?.transaction_type).toBe('sell')
  })

  it('Fortuneo extrait', () => {
    const csv = [
      "Date d'opération,Nature de l'opération,ISIN,Quantité,Cours,Devise",
      '15/03/2024,Achat,US0378331005,10,180.50,EUR',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('fortuneo')
    expect(r.transactions[0]?.transaction_type).toBe('buy')
  })

  it('Linxea AV extrait avec confidence high si ISIN présent', () => {
    const csv = [
      'Date de valeur,Nature mouvement,Support,ISIN,Nombre parts,Valeur liquidative',
      '15/03/2024,Versement,Fonds Euro,FR0010315770,100,15.00',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('linxea_av')
    expect(r.transactions[0]?.asset_class).toBe('etf')
    expect(r.transactions[0]?.transaction_type).toBe('buy')
  })
})

describe('parseGeneric — fallback sémantique', () => {
  it('extrait une transaction depuis des headers inconnus avec mapping déduit', () => {
    const csv = [
      'Code,Nom,Parts,Prix,Date opé,Sens,Devise',
      'FR0010315770,Apple,10,180.50,15/03/2024,Achat,EUR',
    ].join('\n')
    const r = parseBrokerCsv(csv)
    expect(r.broker).toBe('generic')
    expect(r.transactions).toHaveLength(1)
    expect(r.transactions[0]?.confidence).toBe('low')
    expect(r.transactions[0]?.transaction_type).toBe('buy')
  })
})
