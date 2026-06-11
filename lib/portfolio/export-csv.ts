/**
 * Export CSV des positions et transactions (Sprint 4).
 *
 * Module pur (hors `downloadCsv`, qui touche le DOM côté client) : on génère
 * une chaîne CSV prête à être téléchargée, au format attendu par Excel FR.
 *
 * Conventions de format (Excel Windows / France) :
 *   - encodage UTF-8 avec BOM (`﻿`) en tête → accents corrects ;
 *   - séparateur point-virgule `;` (ouverture native sans dialog d'import) ;
 *   - fin de ligne `\r\n` ;
 *   - échappement RFC-4180 : valeurs contenant `;`, `"`, `\n` ou `\r` entourées
 *     de guillemets doubles, `"` interne doublé ;
 *   - dates au format `JJ/MM/AAAA` ;
 *   - nombres à virgule décimale, sans séparateur de milliers (jusqu'à 6
 *     décimales utiles pour la crypto) ;
 *   - pourcentages exprimés en décimal (0,1091 = 10,91 %) pour recalcul Excel.
 *
 * Note devise : pour l'export positions, les colonnes Valeur marché / Coût
 * total / +/- latente sont exprimées en DEVISE DE RÉFÉRENCE (somme possible
 * dans Excel), tandis que PRU + Devise restent dans la devise native de la
 * position (vérification face aux relevés courtier). L'en-tête rappelle la
 * devise de référence.
 */

export const CSV_SEP = ';'
export const CSV_EOL = '\r\n'
export const CSV_BOM = '﻿'

// ─── Helpers de formatage (purs) ─────────────────────────────────────────────

/** Échappe une valeur selon RFC-4180 (avec `;` comme séparateur). */
export function escapeCsv(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Nombre au format FR : virgule décimale, pas de séparateur de milliers.
 * Arrondi à 6 décimales pour éviter le bruit flottant. Retourne '' si la
 * valeur est null/undefined/NaN (cellule vide, pas de crash).
 */
export function frNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  const rounded = Math.round(n * 1e6) / 1e6
  return String(rounded).replace('.', ',')
}

/** Date ISO (ou `YYYY-MM-DD…`) → `JJ/MM/AAAA`. '' si vide/invalide. */
export function frDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-')
  return d && m && y ? `${d}/${m}/${y}` : ''
}

/**
 * Slug ASCII pour les noms de fichier (sans accents ni espaces).
 * Ex. « Amundi MSCI World » → « amundi-msci-world ». Fallback « export ».
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // retire les diacritiques (accents)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'export'
}

/** Assemble une ligne CSV à partir de cellules brutes (échappées ici). */
function toLine(cells: string[]): string {
  return cells.map(escapeCsv).join(CSV_SEP)
}

/** Assemble le document final : BOM + lignes jointes en `\r\n`. */
function assemble(lines: string[]): string {
  return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL
}

// ─── Export positions ────────────────────────────────────────────────────────

export interface PositionCsvRow {
  envelopeName: string
  name:         string
  isin:         string | null
  ticker:       string | null
  /** Quantité détenue (devise native). */
  quantity:     number
  /** PRU dans la devise native de la position. */
  averagePrice: number
  /** Devise native de la position (EUR/USD/…). */
  currency:     string
  /** Valeur de marché en devise de référence. null si pas de prix. */
  marketValue:  number | null
  /** Coût total (cost basis) en devise de référence. */
  costBasis:    number
  /** Date de dernière mise à jour du prix (ISO) ou null. */
  pricedAt:     string | null
}

/**
 * Construit le CSV d'export des positions.
 * @param rows         positions déjà mappées (devise ref pour valeur/coût)
 * @param refCurrency  code devise de référence pour l'en-tête (ex. 'EUR')
 */
export function buildPositionsCsv(rows: PositionCsvRow[], refCurrency = 'EUR'): string {
  const header = [
    'Enveloppe',
    'Nom',
    'ISIN / Ticker',
    'Quantité',
    'PRU',
    'Devise',
    `Valeur marché (${refCurrency})`,
    `Coût total (${refCurrency})`,
    `+/- latente (${refCurrency})`,
    '+/- latente %',
    'Date dernière maj prix',
  ]

  const lines = [toLine(header)]

  for (const r of rows) {
    const pnl    = r.marketValue !== null ? r.marketValue - r.costBasis : null
    const pnlPct = r.marketValue !== null && r.costBasis > 0
      ? (r.marketValue - r.costBasis) / r.costBasis
      : null

    lines.push(toLine([
      r.envelopeName ?? '',
      r.name ?? '',
      r.isin || r.ticker || '',
      frNumber(r.quantity),
      frNumber(r.averagePrice),
      r.currency ?? '',
      frNumber(r.marketValue),
      frNumber(r.costBasis),
      frNumber(pnl),
      frNumber(pnlPct),
      frDate(r.pricedAt),
    ]))
  }

  return assemble(lines)
}

// ─── Export transactions ─────────────────────────────────────────────────────

export interface TransactionCsvRow {
  executedAt:      string
  transactionType: string          // 'purchase' | 'sale' | 'dividend' | …
  quantity:        number | null
  unitPrice:       number | null
  fees:            number | null
  amount:          number | null    // montant net signé stocké en base
  currency:        string | null
  label:           string | null
  realizedPnl:     number | null    // uniquement sur les ventes
}

const TX_TYPE_LABEL: Record<string, string> = {
  purchase: 'Achat',
  sale:     'Vente',
  dividend: 'Dividende',
}

/** Construit le CSV d'export des transactions (toutes ou d'une position). */
export function buildTransactionsCsv(rows: TransactionCsvRow[]): string {
  const header = [
    'Date',
    'Type',
    'Quantité',
    'Prix unitaire',
    'Frais',
    'Montant brut',
    'Montant net',
    'Devise',
    'Libellé',
    'PV réalisée',
  ]

  const lines = [toLine(header)]

  for (const r of rows) {
    const isDividend = r.transactionType === 'dividend'
    const fees = r.fees ?? 0

    // Montant brut = quantité × prix unitaire (ou montant absolu pour un
    // dividende qui n'a ni quantité ni prix unitaire).
    const brut =
      r.quantity !== null && r.unitPrice !== null
        ? r.quantity * r.unitPrice
        : r.amount !== null
          ? Math.abs(r.amount)
          : null

    // Montant net : brut ± frais selon le sens, ou montant du dividende.
    let net: number | null
    if (isDividend) {
      net = r.amount !== null ? Math.abs(r.amount) : brut
    } else if (r.transactionType === 'purchase') {
      net = brut !== null ? brut + fees : null
    } else if (r.transactionType === 'sale') {
      net = brut !== null ? brut - fees : null
    } else {
      net = r.amount !== null ? Math.abs(r.amount) : brut
    }

    lines.push(toLine([
      frDate(r.executedAt),
      TX_TYPE_LABEL[r.transactionType] ?? r.transactionType,
      isDividend ? '' : frNumber(r.quantity),
      frNumber(r.unitPrice),
      frNumber(r.fees),
      frNumber(brut),
      frNumber(net),
      r.currency ?? '',
      r.label ?? '',
      frNumber(r.realizedPnl),
    ]))
  }

  return assemble(lines)
}

// ─── Téléchargement client ───────────────────────────────────────────────────

/**
 * Déclenche le téléchargement d'un CSV côté navigateur (Client Component only).
 * Le `content` est supposé déjà encodé (BOM inclus via les builders ci-dessus).
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
