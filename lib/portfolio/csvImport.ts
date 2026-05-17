/**
 * Parseurs CSV pour les exports brokers : Boursorama, Degiro, Trade Republic.
 *
 * Fonctions PURES (pas d'I/O) : prennent une string CSV et retournent un
 * tableau de positions normalisées { isin, quantity, average_price, currency,
 * acquisition_date, broker, name }.
 *
 * La détection du broker (`detectBroker`) inspecte la ligne d'en-tête pour
 * identifier le format. La route API utilisera ensuite le parser adéquat.
 *
 * Aucun parser ne fait d'enrichissement (ticker, sector, geography) : c'est
 * la couche supérieure (route API) qui résout les ISIN via le cache /
 * OpenFIGI au moment de l'insertion.
 */

export type BrokerFormat = 'boursorama' | 'degiro' | 'trade_republic' | 'unknown'

export interface ImportedPositionRow {
  /** ISIN International (12 caractères). */
  isin:             string
  /** Nom lisible de l'instrument (issu du CSV). */
  name:             string | null
  /** Quantité achetée. */
  quantity:         number
  /** Prix unitaire d'achat dans la devise locale. */
  average_price:    number
  /** Devise du prix (EUR par défaut). */
  currency:         string
  /** Date d'acquisition au format ISO YYYY-MM-DD (si présente). */
  acquisition_date: string | null
  /** Broker de provenance (affichage). */
  broker:           BrokerFormat
}

// ─────────────────────────────────────────────────────────────────────
// Helpers de bas niveau
// ─────────────────────────────────────────────────────────────────────

/** Détecte le séparateur le plus probable d'un CSV : `;` ou `,`. */
export function detectDelimiter(headerLine: string): ';' | ',' {
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return semis > commas ? ';' : ','
}

/**
 * Découpe une ligne CSV en tenant compte des guillemets autour des champs.
 * Gère le cas où le séparateur apparaît à l'intérieur d'un champ entre `"..."`.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === delimiter && !inQuotes) {
      cells.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur)
  return cells.map((s) => s.trim())
}

/** Convertit un nombre formaté FR ou EN en number. */
export function parseNumberLoose(s: string | null | undefined): number {
  if (!s) return NaN
  const trimmed = s.replace(/\s| /g, '').replace(/[€$£]/g, '')
  if (!trimmed) return NaN
  // FR : 1.234,56  vs  EN : 1,234.56  → on normalise.
  let normalized = trimmed
  if (/,\d{1,2}$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = trimmed.replace(/,/g, '')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}

/** Convertit une date FR (DD/MM/YYYY) ou ISO (YYYY-MM-DD) en YYYY-MM-DD. */
export function parseDateLoose(s: string | null | undefined): string | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null
  // ISO direct
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  // FR : DD/MM/YYYY (ou DD-MM-YYYY)
  const m = trimmed.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

/** Vérifie qu'une chaîne ressemble à un ISIN (2 lettres + 10 alphanum). */
export function looksLikeISIN(s: string | null | undefined): boolean {
  if (!s) return false
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s.trim().toUpperCase())
}

// ─────────────────────────────────────────────────────────────────────
// Détection du broker
// ─────────────────────────────────────────────────────────────────────

const BOURSORAMA_HEADERS  = ['libellé', 'libelle', 'cours', "cours d'achat"]
const DEGIRO_HEADERS      = ['produit', 'product', 'bourse', 'venue']
const TRADE_REPUBLIC_HEADERS = ['type', 'isin', 'total']

/** Identifie le format d'un export à partir de sa ligne d'en-tête. */
export function detectBroker(headers: string[]): BrokerFormat {
  const lower = headers.map((h) => h.toLowerCase().trim())

  // Trade Republic : présence simultanée de Type / ISIN / Total
  const hasType  = lower.some((h) => h === 'type')
  const hasISIN  = lower.some((h) => h === 'isin')
  const hasTotal = lower.some((h) => h === 'total')
  if (hasType && hasISIN && hasTotal && !lower.includes('produit') && !lower.includes('product')) {
    return 'trade_republic'
  }

  // Degiro : "Produit" + "Bourse" (ou "Venue")
  if (lower.some((h) => DEGIRO_HEADERS.includes(h))) {
    if (lower.includes('produit') || lower.includes('product')) return 'degiro'
  }

  // Boursorama : "Libellé" ou "Cours d'achat"
  if (lower.some((h) => BOURSORAMA_HEADERS.some((b) => h.includes(b)))) {
    return 'boursorama'
  }

  return 'unknown'
}

// ─────────────────────────────────────────────────────────────────────
// Parsers spécifiques
// ─────────────────────────────────────────────────────────────────────

interface ParserResult {
  rows:   ImportedPositionRow[]
  errors: Array<{ line: number; reason: string }>
}

interface RawParsedCsv {
  delimiter: string
  headers:   string[]
  rows:      string[][]
}

/** Parse un CSV en lignes brutes (sans interprétation métier). */
function parseRaw(csv: string): RawParsedCsv {
  // Normalise les sauts de ligne et retire le BOM UTF-8 éventuel.
  const cleaned = csv.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim()
  const lines = cleaned.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) return { delimiter: ',', headers: [], rows: [] }
  const delimiter = detectDelimiter(lines[0]!)
  const headers   = splitCsvLine(lines[0]!, delimiter)
  const rows      = lines.slice(1).map((l) => splitCsvLine(l, delimiter))
  return { delimiter, headers, rows }
}

/** Recherche l'index d'une colonne par nom (case-insensitive, contains). */
function findCol(headers: string[], ...needles: string[]): number {
  const lowered = headers.map((h) => h.toLowerCase().trim())
  for (const n of needles) {
    const idx = lowered.findIndex((h) => h === n.toLowerCase() || h.includes(n.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * Parseur Boursorama.
 * Colonnes attendues : Date, Libellé, ISIN, Quantité, Cours d'achat, Devise, Montant
 */
export function parseBoursorama(csv: string): ParserResult {
  const { headers, rows } = parseRaw(csv)
  const cDate     = findCol(headers, 'date')
  const cName     = findCol(headers, 'libellé', 'libelle', 'nom')
  const cIsin     = findCol(headers, 'isin')
  const cQty      = findCol(headers, 'quantité', 'quantite', 'qty')
  const cPrice    = findCol(headers, 'cours d\'achat', 'cours dachat', 'cours', 'prix')
  const cCurrency = findCol(headers, 'devise', 'currency')

  const result: ParserResult = { rows: [], errors: [] }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const lineNum = i + 2  // +1 pour le header, +1 pour humaniser (1-based)
    const isin = (r[cIsin] ?? '').trim().toUpperCase()
    if (!looksLikeISIN(isin)) {
      result.errors.push({ line: lineNum, reason: 'ISIN absent ou invalide' })
      continue
    }
    const qty   = parseNumberLoose(r[cQty])
    const price = parseNumberLoose(r[cPrice])
    if (!Number.isFinite(qty) || qty <= 0) {
      result.errors.push({ line: lineNum, reason: 'Quantité invalide' })
      continue
    }
    if (!Number.isFinite(price) || price < 0) {
      result.errors.push({ line: lineNum, reason: 'Prix d\'achat invalide' })
      continue
    }
    result.rows.push({
      isin,
      name:             cName >= 0 ? (r[cName] ?? '').trim() || null : null,
      quantity:         qty,
      average_price:    price,
      currency:         cCurrency >= 0 ? (r[cCurrency] ?? 'EUR').trim().toUpperCase() || 'EUR' : 'EUR',
      acquisition_date: cDate >= 0 ? parseDateLoose(r[cDate]) : null,
      broker:           'boursorama',
    })
  }
  return result
}

/**
 * Parseur Degiro.
 * Colonnes attendues : Date, Produit, ISIN, Bourse, Quantité, Prix unitaire,
 * Valeur locale, Valeur en EUR
 */
export function parseDegiro(csv: string): ParserResult {
  const { headers, rows } = parseRaw(csv)
  const cDate   = findCol(headers, 'date')
  const cName   = findCol(headers, 'produit', 'product')
  const cIsin   = findCol(headers, 'isin')
  const cQty    = findCol(headers, 'quantité', 'quantite', 'quantity')
  const cPrice  = findCol(headers, 'prix unitaire', 'prix', 'price')
  const cValLoc = findCol(headers, 'valeur locale', 'local value')
  const cCurrency = findCol(headers, 'devise', 'currency')

  const result: ParserResult = { rows: [], errors: [] }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const lineNum = i + 2
    const isin = (r[cIsin] ?? '').trim().toUpperCase()
    if (!looksLikeISIN(isin)) {
      result.errors.push({ line: lineNum, reason: 'ISIN absent ou invalide' })
      continue
    }
    const qty   = parseNumberLoose(r[cQty])
    let   price = parseNumberLoose(r[cPrice])
    if (!Number.isFinite(qty) || qty <= 0) {
      result.errors.push({ line: lineNum, reason: 'Quantité invalide' })
      continue
    }
    if (!Number.isFinite(price) || price <= 0) {
      // Fallback : si on a "Valeur locale" sans prix unitaire explicite.
      const valLoc = parseNumberLoose(r[cValLoc])
      if (Number.isFinite(valLoc) && valLoc > 0 && qty > 0) {
        price = valLoc / qty
      }
    }
    if (!Number.isFinite(price) || price < 0) {
      result.errors.push({ line: lineNum, reason: 'Prix unitaire invalide' })
      continue
    }
    // Currency : Degiro met la devise dans une colonne dédiée OU en suffixe
    // de la colonne prix ("EUR 12.34"). On gère les deux.
    let currency = 'EUR'
    if (cCurrency >= 0) {
      const raw = (r[cCurrency] ?? '').trim().toUpperCase()
      if (raw) currency = raw
    } else if (cPrice >= 0) {
      const raw = (r[cPrice] ?? '').trim()
      const m = raw.match(/([A-Z]{3})/)
      if (m) currency = m[1]!
    }
    result.rows.push({
      isin,
      name:             cName >= 0 ? (r[cName] ?? '').trim() || null : null,
      quantity:         qty,
      average_price:    price,
      currency,
      acquisition_date: cDate >= 0 ? parseDateLoose(r[cDate]) : null,
      broker:           'degiro',
    })
  }
  return result
}

/**
 * Parseur Trade Republic.
 * Colonnes attendues : Date, Type, ISIN, Nom, Quantité, Prix, Total
 * Seules les lignes Type = 'Achat' / 'Buy' / 'Acquisition' sont importées.
 */
export function parseTradeRepublic(csv: string): ParserResult {
  const { headers, rows } = parseRaw(csv)
  const cDate  = findCol(headers, 'date')
  const cType  = findCol(headers, 'type')
  const cIsin  = findCol(headers, 'isin')
  const cName  = findCol(headers, 'nom', 'name')
  const cQty   = findCol(headers, 'quantité', 'quantite', 'quantity', 'shares')
  const cPrice = findCol(headers, 'prix', 'price')
  const cTotal = findCol(headers, 'total')

  const result: ParserResult = { rows: [], errors: [] }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const lineNum = i + 2
    const type = (r[cType] ?? '').trim().toLowerCase()
    if (type && !/(achat|buy|acquisition)/.test(type)) {
      // Ignore les ventes / dividendes silencieusement.
      continue
    }
    const isin = (r[cIsin] ?? '').trim().toUpperCase()
    if (!looksLikeISIN(isin)) {
      result.errors.push({ line: lineNum, reason: 'ISIN absent ou invalide' })
      continue
    }
    const qty   = parseNumberLoose(r[cQty])
    let   price = parseNumberLoose(r[cPrice])
    if (!Number.isFinite(qty) || qty <= 0) {
      result.errors.push({ line: lineNum, reason: 'Quantité invalide' })
      continue
    }
    if (!Number.isFinite(price) || price <= 0) {
      const total = parseNumberLoose(r[cTotal])
      if (Number.isFinite(total) && total > 0 && qty > 0) price = total / qty
    }
    if (!Number.isFinite(price) || price < 0) {
      result.errors.push({ line: lineNum, reason: 'Prix invalide' })
      continue
    }
    result.rows.push({
      isin,
      name:             cName >= 0 ? (r[cName] ?? '').trim() || null : null,
      quantity:         qty,
      average_price:    price,
      currency:         'EUR',  // Trade Republic n'expose pas la devise par ligne (toujours EUR pour FR)
      acquisition_date: cDate >= 0 ? parseDateLoose(r[cDate]) : null,
      broker:           'trade_republic',
    })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────
// API publique : parse selon le broker détecté
// ─────────────────────────────────────────────────────────────────────

export interface ParseCsvResult {
  broker:  BrokerFormat
  rows:    ImportedPositionRow[]
  errors:  Array<{ line: number; reason: string }>
}

export function parseBrokerCsv(csv: string, hint?: BrokerFormat): ParseCsvResult {
  const { headers } = parseRaw(csv)
  const broker = hint && hint !== 'unknown' ? hint : detectBroker(headers)
  if (broker === 'boursorama')     { const r = parseBoursorama(csv);    return { broker, ...r } }
  if (broker === 'degiro')         { const r = parseDegiro(csv);        return { broker, ...r } }
  if (broker === 'trade_republic') { const r = parseTradeRepublic(csv); return { broker, ...r } }
  return { broker: 'unknown', rows: [], errors: [{ line: 1, reason: 'Format de broker non reconnu — vérifiez les en-têtes.' }] }
}
