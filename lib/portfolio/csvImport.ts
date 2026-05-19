/**
 * Import CSV universel multi-broker — moteur en 3 étapes.
 *
 *   1. detectBroker(headers, rows)  → identifie le format (TR, Degiro,
 *      Boursorama, Crédit Agricole, Lynx/IBKR, Fortuneo, Linxea/AV ou
 *      fallback générique).
 *   2. Parser dédié → NormalizedTransaction[] (un objet par mouvement).
 *   3. aggregateToPositions → AggregatedPosition[] (un objet par titre,
 *      PRU pondéré, quantité nette).
 *
 * Aucun I/O ici : la couche API se charge de l'encodage du fichier, de
 * l'enrichissement ISIN (cache + OpenFIGI / Yahoo) et des insertions DB.
 *
 * Convention :
 *   - quantity, unit_price, fees → toujours positifs
 *   - transaction_type : 'buy' | 'sell' | 'dividend'
 *   - date au format ISO YYYY-MM-DD
 *   - currency en code ISO 3 lettres (EUR par défaut)
 */

import { createHash } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────

export type BrokerFormat =
  | 'trade_republic'
  | 'degiro'
  | 'boursorama'
  | 'credit_agricole'
  | 'lynx_ibkr'
  | 'fortuneo'
  | 'linxea_av'
  | 'generic'
  | 'unknown'

export type AssetClassNormalized = 'stock' | 'etf' | 'crypto' | 'scpi' | 'obligation'

export interface NormalizedTransaction {
  isin:             string | null
  ticker:           string | null
  name:             string
  asset_class:      AssetClassNormalized
  transaction_type: 'buy' | 'sell' | 'dividend'
  date:             string         // YYYY-MM-DD
  quantity:         number         // > 0
  unit_price:       number         // ≥ 0
  currency:         string         // 'EUR', 'USD', ...
  fees:             number         // ≥ 0
  broker:           BrokerFormat
  confidence:       'high' | 'low'
  raw_row:          Record<string, string>
}

export interface AggregatedPosition {
  isin:             string | null
  ticker:           string | null
  name:             string
  asset_class:      AssetClassNormalized
  /** Quantité nette = somme(buys) − somme(sells). Si ≤ 0, position clôturée. */
  quantity:         number
  /** PRU pondéré = somme(buy_qty × buy_price + fees) / somme(buy_qty). */
  unit_price:       number
  currency:         string
  /** Date du premier achat. */
  acquisition_date: string | null
  broker:           BrokerFormat
  confidence:       'high' | 'low'
  /** Position clôturée (qty nette ≤ 0) — à ignorer à l'import. */
  closed:           boolean
}

export interface ParseResult {
  broker:       BrokerFormat
  total_rows:   number
  transactions: NormalizedTransaction[]
  errors:       Array<{ line: number; reason: string }>
  /** Headers bruts du CSV — sert au fallback manuel UI. */
  headers:      string[]
}

// ─────────────────────────────────────────────────────────────────────
// Helpers bas niveau
// ─────────────────────────────────────────────────────────────────────

/** Détecte le séparateur le plus probable d'un CSV. */
export function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const tabs   = (headerLine.match(/\t/g) ?? []).length
  const semis  = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  if (tabs > semis && tabs > commas) return '\t'
  if (semis > commas) return ';'
  return ','
}

/** Split CSV avec gestion des guillemets (et "" doublés). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else                                    { inQuotes = !inQuotes }
    } else if (c === delimiter && !inQuotes) {
      cells.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur)
  return cells.map((s) => s.trim())
}

/** Convertit un nombre formaté FR ou EN en number. NaN si non parsable. */
export function parseNumberLoose(s: string | null | undefined): number {
  if (s === null || s === undefined) return NaN
  const trimmed = String(s).replace(/\s| /g, '').replace(/[€$£]/g, '')
  if (!trimmed) return NaN
  let normalized = trimmed
  // FR : "1.234,56"  vs  EN : "1,234.56" → on normalise via la position de la
  // dernière décimale détectée.
  if (/,\d{1,4}$/.test(trimmed) && !/\.\d{1,4}$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = trimmed.replace(/,/g, '')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

/** Convertit FR (DD/MM/YYYY) ou ISO (YYYY-MM-DD[Tz]) en YYYY-MM-DD. */
export function parseDateLoose(s: string | null | undefined): string | null {
  if (!s) return null
  const trimmed = String(s).trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const m = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // datetime ISO avec T (Trade Republic) : "2024-03-15T10:00:00.000+00:00"
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

/** Vérifie qu'une chaîne ressemble à un ISIN (2 lettres + 9 alphanum + 1 chiffre). */
export function looksLikeISIN(s: string | null | undefined): boolean {
  if (!s) return false
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(s).trim().toUpperCase())
}

/**
 * Convertit un ArrayBuffer en string en gérant les encodages courants
 * (UTF-8 avec BOM, ISO-8859-1 / latin1 fréquent chez les banques FR).
 * Heuristique : si on détecte des octets > 0x7F qui ne forment pas de
 * séquences UTF-8 valides, on retombe sur latin1.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // Tente UTF-8 strict en premier.
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return decoded.replace(/^﻿/, '')   // retire le BOM UTF-8 éventuel
  } catch {
    // Fallback latin1 (ISO-8859-1)
    return new TextDecoder('iso-8859-1').decode(buf)
  }
}

// ─────────────────────────────────────────────────────────────────────
// Parsing bas niveau du CSV (générique)
// ─────────────────────────────────────────────────────────────────────

interface RawCsv {
  delimiter: string
  headers:   string[]
  rows:      string[][]
}

/** Parse un CSV en lignes/colonnes brutes (sans interprétation métier). */
export function parseRawCsv(csv: string): RawCsv {
  const cleaned = csv.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()
  if (cleaned.length === 0) return { delimiter: ',', headers: [], rows: [] }
  const lines = cleaned.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) return { delimiter: ',', headers: [], rows: [] }
  const delimiter = detectDelimiter(lines[0]!)
  const headers   = splitCsvLine(lines[0]!, delimiter)
  const rows      = lines.slice(1).map((l) => splitCsvLine(l, delimiter))
  return { delimiter, headers, rows }
}

/**
 * Recherche l'index d'une colonne par nom (case-insensitive).
 *
 * Priorité : EXACT match d'abord (sur n'importe quelle aiguille), puis
 * substring match (sur la première aiguille qui matche). Évite que la
 * needle "type" capture une colonne "account_type" alors qu'une colonne
 * exacte "type" existe par ailleurs.
 */
function findCol(headers: string[], ...needles: string[]): number {
  const lowered = headers.map((h) => h.toLowerCase().trim())
  // 1. Exact match prioritaire — toutes aiguilles confondues
  for (const n of needles) {
    const target = n.toLowerCase()
    const idx = lowered.indexOf(target)
    if (idx >= 0) return idx
  }
  // 2. Substring fallback
  for (const n of needles) {
    const target = n.toLowerCase()
    const idx = lowered.findIndex((h) => h.includes(target))
    if (idx >= 0) return idx
  }
  return -1
}

/** Construit un objet { header → cellule } pour faciliter le raw_row. */
function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    out[headers[i]!] = row[i] ?? ''
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Détection du broker
// ─────────────────────────────────────────────────────────────────────

/**
 * Identifie le format d'un export en inspectant ses en-têtes.
 * Renvoie 'unknown' si aucune signature ne match — l'appelant peut alors
 * basculer sur le fallback générique.
 */
export function detectBroker(headers: string[], _rows?: string[][]): BrokerFormat {
  const set = new Set(headers.map((h) => h.toLowerCase().trim()))
  const hasAll = (...keys: string[]) => keys.every((k) => set.has(k.toLowerCase()))
  const hasAny = (...keys: string[]) => keys.some((k) => set.has(k.toLowerCase()))

  // Trade Republic (format CSV officiel via export compte)
  if (hasAll('datetime', 'category', 'type', 'asset_class', 'transaction_id')) {
    return 'trade_republic'
  }

  // Degiro
  if ((hasAny('produit', 'product')) && hasAny('code isin', 'isin')) {
    return 'degiro'
  }

  // Boursorama — distingue de Trade Republic via "Libellé opération"
  if (hasAny("libellé opération", 'libelle operation') && hasAny('isin')) {
    return 'boursorama'
  }
  // Variante Boursorama simple (export titres) : "Libellé" + "Cours d'exécution"
  if (hasAny('libellé', 'libelle') && hasAny("cours d'exécution", "cours d'execution", 'cours d achat')) {
    return 'boursorama'
  }

  // Lynx / Interactive Brokers
  if (hasAll('symbol', 'buy/sell', 'quantity', 'tradeprice')) {
    return 'lynx_ibkr'
  }

  // Fortuneo
  if (hasAny("date d'opération", 'date d operation', 'date operation')
      && hasAny("nature de l'opération", 'nature de l operation')) {
    return 'fortuneo'
  }

  // Linxea / Assurance Vie (Spirica, Apicil, Generali...)
  if (hasAny('date de valeur') && hasAny('support') && hasAny('nombre parts', 'nombre de parts')) {
    return 'linxea_av'
  }

  // Crédit Agricole / BforBank — signature volontairement large
  if (hasAny('date opération', 'date operation') && hasAny('libellé', 'libelle')
      && hasAny('montant') && hasAny('devise', 'currency')) {
    return 'credit_agricole'
  }

  return 'unknown'
}

// ─────────────────────────────────────────────────────────────────────
// Mapping helpers
// ─────────────────────────────────────────────────────────────────────

const TR_ASSET_CLASS_MAP: Record<string, AssetClassNormalized> = {
  STOCK:    'stock',
  EQUITY:   'stock',
  ETF:      'etf',
  FUND:     'etf',
  CRYPTO:   'crypto',
  BOND:     'obligation',
}

function mapAssetClass(label: string | null | undefined): AssetClassNormalized {
  if (!label) return 'stock'
  const u = label.toUpperCase().trim()
  return TR_ASSET_CLASS_MAP[u] ?? 'stock'
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Trade Republic
// ─────────────────────────────────────────────────────────────────────

/**
 * Trade Republic — format CSV officiel (export compte).
 *
 * Lignes importées :
 *   - category=TRADING, type=BUY  → achat
 *   - category=TRADING, type=SELL → vente
 *   - category=DELIVERY, type=FREE_RECEIPT  + price présent → achat crypto
 *   - category=DELIVERY, type=FREE_DELIVERY                  → vente crypto
 *
 * Lignes ignorées silencieusement :
 *   - CARD_TRANSACTION, CUSTOMER_INPAYMENT, CUSTOMER_INBOUND,
 *     INTEREST_PAYMENT, FEE, BENEFITS_SAVEBACK, etc.
 *
 * Mapping :
 *   - isin   = symbol si format ISIN, sinon null
 *   - ticker = symbol toujours conservé
 *   - quantity   = Math.abs(parseFloat(shares))
 *   - unit_price = parseFloat(price)  (en EUR par défaut, currency colonne dédiée)
 *   - fees       = Math.abs(parseFloat(fee || '0'))
 */
export function parseTradeRepublic(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cCategory   = findCol(headers, 'category')
  const cType       = findCol(headers, 'type')
  const cDate       = findCol(headers, 'datetime', 'date')
  const cAssetClass = findCol(headers, 'asset_class')
  const cName       = findCol(headers, 'name')
  const cSymbol     = findCol(headers, 'symbol')
  const cShares     = findCol(headers, 'shares')
  const cPrice      = findCol(headers, 'price')
  const cFee        = findCol(headers, 'fee')
  const cCurrency   = findCol(headers, 'currency')

  const out: NormalizedTransaction[] = []

  for (const row of rows) {
    const category = (row[cCategory] ?? '').toUpperCase().trim()
    const type     = (row[cType]     ?? '').toUpperCase().trim()

    let txType: NormalizedTransaction['transaction_type'] | null = null
    if (category === 'TRADING' && type === 'BUY')                                        txType = 'buy'
    else if (category === 'TRADING' && type === 'SELL')                                  txType = 'sell'
    else if (category === 'DELIVERY' && type === 'FREE_RECEIPT'  && (row[cPrice] ?? '')) txType = 'buy'
    else if (category === 'DELIVERY' && type === 'FREE_DELIVERY')                        txType = 'sell'
    // Tout le reste (cartes, virements, frais...) est ignoré silencieusement.
    if (!txType) continue

    const symbol     = (row[cSymbol] ?? '').trim().toUpperCase()
    const isin       = looksLikeISIN(symbol) ? symbol : null
    const shares     = parseNumberLoose(row[cShares])
    const priceRaw   = parseNumberLoose(row[cPrice])
    const feeRaw     = parseNumberLoose(row[cFee])
    if (!Number.isFinite(shares) || shares === 0)        continue
    if (!Number.isFinite(priceRaw))                      continue

    const quantity = Math.abs(shares)
    const unitPrice = Math.abs(priceRaw)
    const fees      = Math.abs(Number.isFinite(feeRaw) ? feeRaw : 0)

    out.push({
      isin,
      ticker:           symbol || null,
      name:             (row[cName] ?? symbol).trim() || symbol || 'Trade Republic position',
      asset_class:      mapAssetClass(row[cAssetClass]),
      transaction_type: txType,
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity,
      unit_price:       unitPrice,
      currency:         ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR'),
      fees,
      broker:           'trade_republic',
      confidence:       isin ? 'high' : 'low',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Degiro
// ─────────────────────────────────────────────────────────────────────

export function parseDegiro(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cDate   = findCol(headers, 'date')
  const cName   = findCol(headers, 'produit', 'product')
  const cIsin   = findCol(headers, 'code isin', 'isin')
  const cQty    = findCol(headers, 'quantité', 'quantite', 'quantity')
  const cPrice  = findCol(headers, 'prix unitaire', 'price', 'cours')
  const cValLoc = findCol(headers, 'valeur locale', 'local value')
  const cCurrency = findCol(headers, 'devise', 'currency')
  const cFee    = findCol(headers, 'frais', 'fee', 'commission')

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const isin = (row[cIsin] ?? '').trim().toUpperCase()
    if (!looksLikeISIN(isin)) continue
    const qty   = parseNumberLoose(row[cQty])
    let   price = parseNumberLoose(row[cPrice])
    if (!Number.isFinite(qty) || qty === 0) continue
    if (!Number.isFinite(price) || price === 0) {
      const valLoc = parseNumberLoose(row[cValLoc])
      if (Number.isFinite(valLoc) && Math.abs(qty) > 0) price = valLoc / Math.abs(qty)
    }
    if (!Number.isFinite(price)) continue
    out.push({
      isin,
      ticker:           null,
      name:             (row[cName] ?? isin).trim() || isin,
      asset_class:      'stock',  // Degiro ne distingue pas — sera affiné par ISIN cache
      transaction_type: qty >= 0 ? 'buy' : 'sell',
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       Math.abs(price),
      currency:         ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR'),
      fees:             Math.abs(parseNumberLoose(row[cFee]) || 0),
      broker:           'degiro',
      confidence:       'high',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Boursorama
// ─────────────────────────────────────────────────────────────────────

export function parseBoursorama(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cDate     = findCol(headers, 'date')
  const cLabel    = findCol(headers, 'libellé opération', 'libelle operation', 'libellé', 'libelle')
  const cIsin     = findCol(headers, 'isin')
  const cQty      = findCol(headers, 'quantité exécutée', 'quantite executee', 'quantité', 'quantite')
  const cPrice    = findCol(headers, "cours d'exécution", "cours d'execution", "cours d'achat", 'cours')
  const cCurrency = findCol(headers, 'devise', 'currency')
  const cFee      = findCol(headers, 'frais', 'commission')

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const isin = (row[cIsin] ?? '').trim().toUpperCase()
    if (!looksLikeISIN(isin)) continue
    const qty   = parseNumberLoose(row[cQty])
    const price = parseNumberLoose(row[cPrice])
    if (!Number.isFinite(qty) || qty === 0)     continue
    if (!Number.isFinite(price) || price < 0)   continue

    const label = (row[cLabel] ?? '').toLowerCase()
    // Heuristique : "vente" / "achat" dans le libellé. Sinon basé sur signe qty.
    let txType: NormalizedTransaction['transaction_type'] = qty >= 0 ? 'buy' : 'sell'
    if (/\bvente\b|\bsell\b/.test(label)) txType = 'sell'
    else if (/\bachat\b|\bbuy\b/.test(label)) txType = 'buy'

    out.push({
      isin,
      ticker:           null,
      name:             (row[cLabel] ?? isin).trim() || isin,
      asset_class:      'stock',
      transaction_type: txType,
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       price,
      currency:         ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR'),
      fees:             Math.abs(parseNumberLoose(row[cFee]) || 0),
      broker:           'boursorama',
      confidence:       'high',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Lynx / Interactive Brokers
// ─────────────────────────────────────────────────────────────────────

export function parseLynxIbkr(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cSymbol   = findCol(headers, 'symbol')
  const cBuySell  = findCol(headers, 'buy/sell')
  const cQty      = findCol(headers, 'quantity')
  const cPrice    = findCol(headers, 'tradeprice', 'price')
  const cCurrency = findCol(headers, 'currencyprimary', 'currency')
  const cDate     = findCol(headers, 'tradedate', 'date')
  const cIsin     = findCol(headers, 'isin')
  const cFee      = findCol(headers, 'commission', 'fees')

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const symbol  = (row[cSymbol]  ?? '').trim().toUpperCase()
    const buySell = (row[cBuySell] ?? '').trim().toUpperCase()
    const isin    = cIsin >= 0 && looksLikeISIN(row[cIsin]) ? (row[cIsin] ?? '').toUpperCase() : null
    const qty     = parseNumberLoose(row[cQty])
    const price   = parseNumberLoose(row[cPrice])
    if (!symbol || !Number.isFinite(qty) || qty === 0) continue
    if (!Number.isFinite(price)) continue
    const txType = buySell === 'SELL' || qty < 0 ? 'sell' : 'buy'
    out.push({
      isin,
      ticker:           symbol,
      name:             symbol,
      asset_class:      'stock',
      transaction_type: txType,
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       Math.abs(price),
      currency:         ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR'),
      fees:             Math.abs(parseNumberLoose(row[cFee]) || 0),
      broker:           'lynx_ibkr',
      confidence:       isin ? 'high' : 'low',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Fortuneo
// ─────────────────────────────────────────────────────────────────────

export function parseFortuneo(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cDate     = findCol(headers, "date d'opération", 'date d operation', 'date operation')
  const cNature   = findCol(headers, "nature de l'opération", 'nature de l operation', 'nature')
  const cIsin     = findCol(headers, 'isin', 'code isin')
  const cQty      = findCol(headers, 'quantité', 'quantite')
  const cPrice    = findCol(headers, 'cours', 'prix')
  const cCurrency = findCol(headers, 'devise', 'currency')
  const cFee      = findCol(headers, 'frais', 'commission')

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const isin = cIsin >= 0 ? (row[cIsin] ?? '').trim().toUpperCase() : ''
    if (!looksLikeISIN(isin)) continue
    const qty   = parseNumberLoose(row[cQty])
    const price = parseNumberLoose(row[cPrice])
    if (!Number.isFinite(qty) || qty === 0) continue
    if (!Number.isFinite(price)) continue
    const nature = (row[cNature] ?? '').toLowerCase()
    const txType: NormalizedTransaction['transaction_type'] =
      /vente|sell/.test(nature) ? 'sell' : 'buy'
    out.push({
      isin,
      ticker:           null,
      name:             (row[cNature] ?? isin).trim() || isin,
      asset_class:      'stock',
      transaction_type: txType,
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       Math.abs(price),
      currency:         ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR'),
      fees:             Math.abs(parseNumberLoose(row[cFee]) || 0),
      broker:           'fortuneo',
      confidence:       'high',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Linxea / Assurance Vie (Spirica, Apicil, Generali...)
// ─────────────────────────────────────────────────────────────────────

export function parseLinxeaAV(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cDate     = findCol(headers, 'date de valeur', 'date')
  const cMouv     = findCol(headers, 'nature mouvement', 'nature', 'opération')
  const cSupport  = findCol(headers, 'support', 'nom du support')
  const cIsin     = findCol(headers, 'isin', 'code isin')
  const cQty      = findCol(headers, 'nombre parts', 'nombre de parts', 'parts')
  const cVL       = findCol(headers, 'valeur liquidative', 'vl', 'cours')

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const qty = parseNumberLoose(row[cQty])
    const vl  = parseNumberLoose(row[cVL])
    if (!Number.isFinite(qty) || qty === 0) continue
    if (!Number.isFinite(vl)) continue
    const isin = cIsin >= 0 && looksLikeISIN(row[cIsin]) ? (row[cIsin] ?? '').toUpperCase() : null
    const nature = (row[cMouv] ?? '').toLowerCase()
    const txType: NormalizedTransaction['transaction_type'] =
      /(rachat|vente|arbitrage sortant)/.test(nature) ? 'sell' : 'buy'
    out.push({
      isin,
      ticker:           null,
      name:             (row[cSupport] ?? isin ?? 'Support AV').trim() || 'Support AV',
      asset_class:      'etf',  // les supports AV sont quasi tous des fonds
      transaction_type: txType,
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       Math.abs(vl),
      currency:         'EUR',
      fees:             0,
      broker:           'linxea_av',
      confidence:       isin ? 'high' : 'low',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Parser : Crédit Agricole / BforBank (relevés génériques)
// ─────────────────────────────────────────────────────────────────────

export function parseCreditAgricole(headers: string[], rows: string[][]): NormalizedTransaction[] {
  // Format souvent un relevé de mouvements génériques — sans ISIN ni prix
  // unitaire. On extrait ce qui est extractible et on délègue le reste au
  // fallback générique au cas où.
  const cDate     = findCol(headers, 'date opération', 'date operation', 'date')
  const cLabel    = findCol(headers, 'libellé', 'libelle')
  const cIsin     = findCol(headers, 'isin', 'code isin')
  const cQty      = findCol(headers, 'quantité', 'quantite', 'parts')
  const cPrice    = findCol(headers, 'cours', 'prix')
  const cCurrency = findCol(headers, 'devise', 'currency')

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const isin = cIsin >= 0 && looksLikeISIN(row[cIsin]) ? (row[cIsin] ?? '').toUpperCase() : null
    const qty   = parseNumberLoose(row[cQty])
    const price = parseNumberLoose(row[cPrice])
    if (!isin)                                     continue
    if (!Number.isFinite(qty) || qty === 0)        continue
    if (!Number.isFinite(price))                   continue
    const label = (row[cLabel] ?? '').toLowerCase()
    const txType: NormalizedTransaction['transaction_type'] =
      /vente|sell/.test(label) ? 'sell' : 'buy'
    out.push({
      isin,
      ticker:           null,
      name:             (row[cLabel] ?? isin).trim() || isin,
      asset_class:      'stock',
      transaction_type: txType,
      date:             parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       Math.abs(price),
      currency:         ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR'),
      fees:             0,
      broker:           'credit_agricole',
      confidence:       'low',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Fallback générique
// ─────────────────────────────────────────────────────────────────────

/**
 * Mapping sémantique d'un CSV inconnu :
 *   - cherche une colonne contenant "isin" / "code"
 *   - "quantit" / "parts" / "qty" / "shares"
 *   - "prix" / "cours" / "price"
 *   - "date"
 *   - "achat" / "vente" / "buy" / "sell" pour le sens du mouvement
 *
 * confidence='low' sur toutes les lignes — l'utilisateur doit valider.
 */
export function parseGeneric(headers: string[], rows: string[][]): NormalizedTransaction[] {
  const cIsin = headers.findIndex((h) => /isin|code/i.test(h))
  const cQty  = headers.findIndex((h) => /quantit|parts|qty|shares/i.test(h))
  const cPrice = headers.findIndex((h) => /prix|cours|price/i.test(h))
  const cDate = headers.findIndex((h) => /date/i.test(h))
  const cType = headers.findIndex((h) => /sens|type|nature|mouvement/i.test(h))
  const cName = headers.findIndex((h) => /libellé|libelle|name|nom|produit|support/i.test(h))
  const cCurrency = headers.findIndex((h) => /devise|currency/i.test(h))

  const out: NormalizedTransaction[] = []
  for (const row of rows) {
    const isin = cIsin >= 0 && looksLikeISIN(row[cIsin]) ? (row[cIsin] ?? '').toUpperCase() : null
    if (!isin) continue
    const qty   = parseNumberLoose(row[cQty])
    const price = parseNumberLoose(row[cPrice])
    if (!Number.isFinite(qty) || qty === 0)   continue
    if (!Number.isFinite(price) || price < 0) continue
    const t = cType >= 0 ? (row[cType] ?? '').toLowerCase() : ''
    const txType: NormalizedTransaction['transaction_type'] =
      /vente|sell/.test(t) ? 'sell' : 'buy'
    out.push({
      isin,
      ticker:           null,
      name:             cName >= 0 ? (row[cName] ?? isin).trim() || isin : isin,
      asset_class:      'stock',
      transaction_type: txType,
      date:             cDate >= 0 ? (parseDateLoose(row[cDate]) ?? new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10),
      quantity:         Math.abs(qty),
      unit_price:       Math.abs(price),
      currency:         cCurrency >= 0 ? ((row[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR') : 'EUR',
      fees:             0,
      broker:           'generic',
      confidence:       'low',
      raw_row:          rowToObject(headers, row),
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────

/**
 * Parse un CSV en tableau de transactions normalisées.
 * Détecte automatiquement le broker via les en-têtes ; respecte le hint
 * s'il est fourni (ex. format choisi manuellement par l'utilisateur après
 * échec de la détection auto).
 */
export function parseBrokerCsv(csv: string, hint?: BrokerFormat): ParseResult {
  const { headers, rows } = parseRawCsv(csv)
  if (headers.length === 0) {
    return { broker: 'unknown', total_rows: 0, transactions: [], errors: [{ line: 1, reason: 'Fichier CSV vide.' }], headers }
  }

  const broker = hint && hint !== 'unknown' ? hint : detectBroker(headers, rows)

  const parser: Record<BrokerFormat, (h: string[], r: string[][]) => NormalizedTransaction[]> = {
    trade_republic:   parseTradeRepublic,
    degiro:           parseDegiro,
    boursorama:       parseBoursorama,
    credit_agricole:  parseCreditAgricole,
    lynx_ibkr:        parseLynxIbkr,
    fortuneo:         parseFortuneo,
    linxea_av:        parseLinxeaAV,
    generic:          parseGeneric,
    unknown:          parseGeneric,   // dernier recours : essai sémantique
  }

  const effective: BrokerFormat = broker === 'unknown' ? 'generic' : broker
  const transactions = parser[effective](headers, rows)

  return {
    broker:       effective,
    total_rows:   rows.length,
    transactions,
    errors:       [],
    headers,
  }
}

// ─────────────────────────────────────────────────────────────────────
// CUMP — Coût Unitaire Moyen Pondéré (convention FR / IFRS)
// ─────────────────────────────────────────────────────────────────────

/**
 * Calcule la quantité résiduelle et le PRU selon la méthode CUMP.
 *
 * Règles :
 *   - achat : PRU recalculé en pondération roulante, frais intégrés au
 *             coût d'acquisition (numérateur).
 *   - vente : quantité diminue, PRU INCHANGÉ. Si la position retombe à
 *             zéro, le PRU est remis à 0 — un éventuel rachat repart
 *             d'une base propre.
 *   - autres (dividend, etc.) : ignorés.
 *
 * Tri chronologique strict sur `date` (YYYY-MM-DD). L'appelant doit
 * fournir une liste déjà filtrée sur un seul titre.
 */
export function computeRunningCump(
  txs: NormalizedTransaction[],
): { finalQty: number; finalPru: number } {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))

  let qty = 0
  let pru = 0

  for (const t of sorted) {
    if (t.transaction_type === 'buy') {
      const buyQty = t.quantity
      const newQty = qty + buyQty
      if (newQty > 0) {
        pru = (qty * pru + buyQty * t.unit_price + t.fees) / newQty
      }
      qty = newQty
    } else if (t.transaction_type === 'sell') {
      qty = Math.max(0, qty - t.quantity)
      if (qty === 0) pru = 0
    }
    // dividend / autres types : sans effet sur (qty, pru)
  }

  return { finalQty: qty, finalPru: pru }
}

// ─────────────────────────────────────────────────────────────────────
// Grouping & build de lignes prêtes pour la table `transactions` (E5)
// ─────────────────────────────────────────────────────────────────────

/**
 * Groupe les transactions par titre selon la même règle de clé que
 * `aggregateToPositions` (ISIN > ticker > name, en uppercase). Les
 * exclusions UI sont respectées. Aucun filtre sur le type : dividendes
 * et types inconnus restent dans les groupes — c'est au consommateur
 * de décider quoi en faire.
 */
export function groupTransactionsByKey(
  txs: NormalizedTransaction[],
  excludedKeys: ReadonlyArray<string> = [],
): Map<string, NormalizedTransaction[]> {
  const exclude = new Set(excludedKeys.map((k) => k.toUpperCase()))
  const groups = new Map<string, NormalizedTransaction[]>()
  for (const t of txs) {
    const key = (t.isin ?? t.ticker ?? t.name).toUpperCase()
    if (exclude.has(key)) continue
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  return groups
}

/** Mapping NormalizedTransaction → enum DB `transaction_type`. */
export type DbImportTransactionType = 'purchase' | 'sale' | 'dividend'

export function mapNormalizedToDbType(
  t: NormalizedTransaction['transaction_type'],
): DbImportTransactionType | null {
  switch (t) {
    case 'buy':      return 'purchase'
    case 'sell':     return 'sale'
    case 'dividend': return 'dividend'
    default:         return null  // type CSV non reconnu côté DB → skip + log
  }
}

/** Ligne prête à être insérée dans la table `transactions`. */
export interface ImportTransactionRow {
  user_id:          string
  position_id:      string
  instrument_id:    string
  transaction_type: DbImportTransactionType
  amount:           number
  currency:         string
  fx_rate_to_ref:   number
  executed_at:      string  // ISO timestamp UTC (yyyy-mm-ddT00:00:00.000Z)
  quantity:         number
  unit_price:       number
  fees:             number
  label:            string
  data_source:      string
  external_ref:     string  // sha256 hex, cf. migration 033
}

export interface ImportRowBuildContext {
  userId:       string
  positionId:   string
  instrumentId: string
}

/**
 * Construit la ligne DB pour une NormalizedTransaction. Retourne null
 * si le type CSV ne se mappe sur aucun type DB connu — l'appelant
 * doit alors la skipper et la logger.
 *
 * `external_ref` = sha256 hex de
 *   userId | instrumentId | executed_at | qty | price | dbType
 *
 * (cf. migration 033 — index unique partiel `(user_id, external_ref)
 *  WHERE external_ref IS NOT NULL`). Garantit l'idempotence des
 *  ré-imports d'un même CSV (ou de CSV qui se recoupent).
 */
export function buildImportTransactionRow(
  t:   NormalizedTransaction,
  ctx: ImportRowBuildContext,
): ImportTransactionRow | null {
  const dbType = mapNormalizedToDbType(t.transaction_type)
  if (!dbType) return null

  const executedAt = `${t.date}T00:00:00.000Z`

  // Conventions amounts (cf. lib/portfolio/cash-flows.ts) :
  //   purchase (sortie de cash) → amount NÉGATIF
  //   sale     (entrée de cash) → amount POSITIF
  //   dividend (entrée de cash) → amount POSITIF
  let amount: number
  switch (dbType) {
    case 'purchase': amount = -(t.quantity * t.unit_price + t.fees); break
    case 'sale':     amount =  (t.quantity * t.unit_price - t.fees); break
    case 'dividend': amount =   t.quantity * t.unit_price;            break
  }

  // Hash déterministe. toFixed force un format stable pour qu'un même
  // (qty, price) donne toujours le même hash quel que soit l'arrondi flottant.
  const payload = [
    ctx.userId, ctx.instrumentId, executedAt,
    t.quantity.toFixed(8), t.unit_price.toFixed(6), dbType,
  ].join('|')
  const externalRef = createHash('sha256').update(payload).digest('hex')

  const verb = dbType === 'purchase' ? 'Achat' : dbType === 'sale' ? 'Vente' : 'Dividende'
  const label = `${verb} ${t.quantity} × ${t.name} (import ${t.broker})`.trim()

  return {
    user_id:          ctx.userId,
    position_id:      ctx.positionId,
    instrument_id:    ctx.instrumentId,
    transaction_type: dbType,
    amount,
    currency:         t.currency,
    fx_rate_to_ref:   1,
    executed_at:      executedAt,
    quantity:         t.quantity,
    unit_price:       t.unit_price,
    fees:             t.fees,
    label,
    data_source:      'manual',
    external_ref:     externalRef,
  }
}

/** Helper batch : sépare les lignes valides des transactions skippées. */
export function buildTransactionRowsForImport(
  txs: NormalizedTransaction[],
  ctx: ImportRowBuildContext,
): { rows: ImportTransactionRow[]; skipped: NormalizedTransaction[] } {
  const rows: ImportTransactionRow[] = []
  const skipped: NormalizedTransaction[] = []
  for (const t of txs) {
    const row = buildImportTransactionRow(t, ctx)
    if (row) rows.push(row)
    else     skipped.push(t)
  }
  return { rows, skipped }
}

// ─────────────────────────────────────────────────────────────────────
// Agrégation : transactions → positions
// ─────────────────────────────────────────────────────────────────────

/**
 * Regroupe les transactions par titre (ISIN si dispo, sinon ticker, sinon
 * nom) et calcule un PRU pondéré.
 *
 *   - PRU = somme(qty × price + fees) sur les ACHATS / qty totale d'achats
 *   - Quantité nette = sum(buy_qty) − sum(sell_qty)
 *   - Si qty nette ≤ 0 → position clôturée (closed=true)
 *   - acquisition_date = date du premier achat
 *
 * Les dividendes sont ignorés dans l'agrégation (ils ne créent pas de position).
 */
export function aggregateToPositions(
  txs: NormalizedTransaction[],
  excludedKeys: ReadonlyArray<string> = [],
): AggregatedPosition[] {
  // groupTransactionsByKey n'exclut PAS les dividendes (le helper sert aussi
  // au persistage des transactions). Ici on les retire en amont pour préserver
  // strictement le comportement historique (un groupe 100 % dividend ne doit
  // pas générer de position).
  const groups = groupTransactionsByKey(
    txs.filter((t) => t.transaction_type !== 'dividend'),
    excludedKeys,
  )

  const out: AggregatedPosition[] = []
  for (const [, group] of groups) {
    const { finalQty, finalPru } = computeRunningCump(group)

    const firstBuy = group
      .filter((t) => t.transaction_type === 'buy')
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    const ref = firstBuy ?? group[0]!

    out.push({
      isin:             ref.isin,
      ticker:           ref.ticker,
      name:             ref.name,
      asset_class:      ref.asset_class,
      quantity:         Math.max(0, finalQty),
      unit_price:       Math.round(finalPru * 10000) / 10000,
      currency:         ref.currency,
      acquisition_date: firstBuy?.date ?? null,
      broker:           ref.broker,
      confidence:       group.some((t) => t.confidence === 'low') ? 'low' : 'high',
      closed:           finalQty <= 0,
    })
  }
  return out
}
