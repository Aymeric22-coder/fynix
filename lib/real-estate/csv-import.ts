/**
 * Parser CSV bancaire + matcher automatique (Phase 2).
 *
 * Format attendu (UTF-8) :
 *   Date;Libellé;Montant         (séparateurs ; ou ,)
 *   2025-01-15;Loyer T2 Dupont;850
 *   2025-01-10;Échéance prêt immo;-1052.30
 *
 * - Date : YYYY-MM-DD ou DD/MM/YYYY ou DD/MM/YY
 * - Montant : décimal avec , ou . ; signe - pour les sorties
 * - Libellé : tout le reste
 *
 * Auto-categorize : devine le type de transaction à partir du libellé
 * (rent_income, loan_payment, tax, fee).
 *
 * Pure : pas d'accès DB, pas d'I/O.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type GuessedType = 'rent_income' | 'loan_payment' | 'tax' | 'fee' | 'unknown'

export interface ParsedRow {
  /** Index 1-based dans le CSV (utile pour les erreurs). */
  rowIndex:    number
  /** Date au format ISO (YYYY-MM-DD). */
  date:        string
  /** Libellé brut. */
  label:       string
  /** Montant signé : positif = entrée, négatif = sortie. */
  amount:      number
  /** Type deviné par l'analyseur. 'unknown' si aucun pattern ne correspond. */
  guessedType: GuessedType
  /** Confiance du matcher (0–100). */
  confidence:  number
  /** Erreur de parsing si la ligne est invalide. */
  error?:      string
}

export interface CsvParseResult {
  rows:    ParsedRow[]
  /** Lignes qui ont échoué le parsing (date/montant invalide). */
  errors:  number
  /** Délimiteur détecté. */
  delimiter: string
}

// ─── Patterns matchers ─────────────────────────────────────────────────────

interface Pattern {
  regex:   RegExp
  type:    GuessedType
  /** Direction attendue du montant : 'in' (positif), 'out' (négatif), 'any'. */
  direction: 'in' | 'out' | 'any'
  /** Confiance attribuée au match (0-100). */
  confidence: number
}

const PATTERNS: Pattern[] = [
  // Loyers (entrée)
  { regex: /\bloyer\b/i,                          type: 'rent_income',  direction: 'in',  confidence: 95 },
  { regex: /\brent\b/i,                           type: 'rent_income',  direction: 'in',  confidence: 90 },
  { regex: /location/i,                           type: 'rent_income',  direction: 'in',  confidence: 70 },
  { regex: /encaissement.*locataire/i,            type: 'rent_income',  direction: 'in',  confidence: 85 },

  // Mensualités crédit (sortie)
  { regex: /pr[eê]t.*immo/i,                      type: 'loan_payment', direction: 'out', confidence: 95 },
  { regex: /[eé]ch[eé]ance.*pr[eê]t/i,            type: 'loan_payment', direction: 'out', confidence: 95 },
  { regex: /[eé]ch[eé]ance.*cr[eé]dit/i,          type: 'loan_payment', direction: 'out', confidence: 90 },
  { regex: /pr[eé]l[eè]vement.*banque/i,          type: 'loan_payment', direction: 'out', confidence: 60 },
  { regex: /\bmensualit[eé]\b/i,                  type: 'loan_payment', direction: 'out', confidence: 85 },
  { regex: /remboursement.*emprunt/i,             type: 'loan_payment', direction: 'out', confidence: 90 },

  // Impôts / taxes (sortie)
  { regex: /taxe fonci[eè]re/i,                   type: 'tax',          direction: 'out', confidence: 98 },
  { regex: /\bcfe\b/i,                            type: 'tax',          direction: 'out', confidence: 90 },
  { regex: /imp[oô]t.*foncier/i,                  type: 'tax',          direction: 'out', confidence: 92 },
  { regex: /pr[eé]l[eè]vement.*sociaux/i,         type: 'tax',          direction: 'out', confidence: 80 },

  // Charges récurrentes (sortie)
  { regex: /assurance.*pno/i,                     type: 'fee',          direction: 'out', confidence: 95 },
  { regex: /\bpno\b/i,                            type: 'fee',          direction: 'out', confidence: 90 },
  { regex: /assurance.*habitation/i,              type: 'fee',          direction: 'out', confidence: 85 },
  { regex: /\bgli\b/i,                            type: 'fee',          direction: 'out', confidence: 85 },
  { regex: /syndic|copropri[eé]t[eé]/i,           type: 'fee',          direction: 'out', confidence: 90 },
  { regex: /charges? immeuble/i,                  type: 'fee',          direction: 'out', confidence: 75 },
  { regex: /honoraires? gestion/i,                type: 'fee',          direction: 'out', confidence: 85 },
  { regex: /expert.*comptable|comptable/i,        type: 'fee',          direction: 'out', confidence: 80 },
  { regex: /entretien|r[eé]paration|travaux/i,    type: 'fee',          direction: 'out', confidence: 70 },
]

// ─── Parser CSV simple ─────────────────────────────────────────────────────

function detectDelimiter(line: string): string {
  // Compte les ; et les , dans la première ligne. Le plus fréquent gagne.
  const semi = (line.match(/;/g) ?? []).length
  const comma = (line.match(/,/g) ?? []).length
  return semi >= comma && semi > 0 ? ';' : ','
}

function parseDate(s: string): string | null {
  const trimmed = s.trim()
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // FR DD/MM/YYYY ou DD/MM/YY
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(trimmed)
  if (fr) {
    const day   = fr[1]!.padStart(2, '0')
    const month = fr[2]!.padStart(2, '0')
    let year    = fr[3]!
    if (year.length === 2) year = (Number(year) > 50 ? '19' : '20') + year
    return `${year}-${month}-${day}`
  }
  return null
}

function parseAmount(s: string): number | null {
  const cleaned = s.trim()
    .replace(/\s/g, '')      // supprime espaces (séparateur de milliers FR)
    .replace(/[€$£]/g, '')   // supprime devises
  // FR utilise virgule comme décimal — on la transforme en point
  // Mais si le nombre a déjà un point, on garde
  const normalized = cleaned.includes(',') && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(/,/g, '')   // sinon virgules sont des séparateurs de milliers
  const n = Number(normalized)
  return isNaN(n) ? null : n
}

/**
 * Parse une chaîne CSV et renvoie les lignes structurées.
 * Détecte automatiquement le délimiteur (`;` ou `,`) et le format de date.
 *
 * Header attendu : `Date`, `Libelle`/`Label`, `Montant`/`Amount` (insensible à la casse / accents).
 */
export function parseCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { rows: [], errors: 0, delimiter: ';' }

  const delimiter = detectDelimiter(lines[0]!)

  const headers = lines[0]!.split(delimiter).map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))

  // Trouve les colonnes par nom
  const dateIdx   = headers.findIndex((h) => /^date$/.test(h))
  const labelIdx  = headers.findIndex((h) => /^(libelle|label|description|libelle de l operation)$/i.test(h))
  const amountIdx = headers.findIndex((h) => /^(montant|amount|valeur)$/i.test(h))

  // Si pas de colonne montant mais débit/crédit séparés
  const debitIdx  = headers.findIndex((h) => /^(debit|debit eur|debit \(eur\))$/i.test(h))
  const creditIdx = headers.findIndex((h) => /^(credit|credit eur|credit \(eur\))$/i.test(h))

  const rows: ParsedRow[] = []
  let errors = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(delimiter)
    const dateRaw  = dateIdx  >= 0 ? cells[dateIdx]  ?? '' : ''
    const labelRaw = labelIdx >= 0 ? cells[labelIdx] ?? '' : ''

    let amount: number | null = null
    if (amountIdx >= 0) {
      amount = parseAmount(cells[amountIdx] ?? '')
    } else if (debitIdx >= 0 || creditIdx >= 0) {
      const d = debitIdx  >= 0 ? parseAmount(cells[debitIdx]  ?? '') ?? 0 : 0
      const c = creditIdx >= 0 ? parseAmount(cells[creditIdx] ?? '') ?? 0 : 0
      // Débit positif dans la colonne → en réalité une sortie (négatif)
      amount = (c > 0 ? c : 0) - (d > 0 ? d : 0)
    }

    const date = parseDate(dateRaw)

    if (!date || amount === null || amount === 0) {
      rows.push({
        rowIndex:    i,
        date:        date  ?? '',
        label:       labelRaw,
        amount:      amount ?? 0,
        guessedType: 'unknown',
        confidence:  0,
        error:       !date ? 'Date invalide' : amount === null ? 'Montant invalide' : 'Montant nul',
      })
      errors++
      continue
    }

    const { type, confidence } = guessTransactionType(labelRaw, amount)
    rows.push({
      rowIndex:    i,
      date,
      label:       labelRaw,
      amount,
      guessedType: type,
      confidence,
    })
  }

  return { rows, errors, delimiter }
}

// ─── Auto-matcher ──────────────────────────────────────────────────────────

/**
 * Devine le type d'une transaction à partir du libellé et du signe du montant.
 */
export function guessTransactionType(
  label:  string,
  amount: number,
): { type: GuessedType; confidence: number } {
  const labelNorm = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const isIncome  = amount > 0
  const isExpense = amount < 0

  let bestMatch: { type: GuessedType; confidence: number } = { type: 'unknown', confidence: 0 }

  for (const p of PATTERNS) {
    if (!p.regex.test(labelNorm)) continue
    if (p.direction === 'in'  && !isIncome)  continue
    if (p.direction === 'out' && !isExpense) continue
    if (p.confidence > bestMatch.confidence) {
      bestMatch = { type: p.type, confidence: p.confidence }
    }
  }

  return bestMatch
}
