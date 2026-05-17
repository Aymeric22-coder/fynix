/**
 * Nettoyage d'un libellé de position issu d'un export broker.
 *
 * Sprint 2 — D16 : avant cette fonction, le `name` etait inseré tel quel
 * dans `instruments`, qui est un catalogue PARTAGE entre tous les
 * utilisateurs. Conséquence : des libellés type "VENTE ALSTOM 15/03/24"
 * polluaient le cache vu par tout le monde.
 *
 * Logique :
 *   1. Retire les patterns de date (DD/MM, DD/MM/YY, DD/MM/YYYY).
 *   2. Retire les prefixes d'operation (VENTE, ACHAT, ACQUISITION,
 *      CESSION, VIRT, REMBT) — case-insensitive, debut de chaine.
 *   3. Trim + capitalise (1ere lettre majuscule, reste inchange).
 *   4. Si resultat < 2 caracteres : fallback ISIN > ticker > original.
 */

const DATE_PATTERN = /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g

// Prefixes d'operation broker (entree de chaine, suivi d'espace).
// Le pipe alternatif est volontairement enroule en classe nommee pour
// pouvoir l'etendre facilement (rajouter REPAS, DEPOT, etc.).
const OPERATION_PREFIX = /^(?:vente|achat|acquisition|cession|virt(?:ement)?|rembt|remboursement)\s+/i

function capitalize(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface CleanInstrumentNameInputs {
  /** Libellé brut tel que reçu du broker. */
  rawName:  string
  /** ISIN si disponible — sert de fallback si le nettoyage produit un nom trop court. */
  isin?:    string | null
  /** Ticker si disponible — fallback secondaire. */
  ticker?:  string | null
}

export function cleanInstrumentName(input: CleanInstrumentNameInputs): string {
  const raw = (input.rawName ?? '').trim()
  if (raw.length === 0) {
    return input.isin ?? input.ticker ?? ''
  }

  let cleaned = raw
    .replace(DATE_PATTERN, ' ')
    .replace(OPERATION_PREFIX, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  cleaned = capitalize(cleaned)

  if (cleaned.length < 2) {
    return input.isin ?? input.ticker ?? raw
  }
  return cleaned
}
