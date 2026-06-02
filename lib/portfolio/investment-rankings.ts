/**
 * Classement Champions / Casseroles — rendement instantané par bucket (V2.4-BIS).
 *
 * **Pivot d'approche par rapport à V2.4** :
 *   V2.4 mesurait une performance ANNUALISÉE (TWR, yield, taux) avec un
 *   filtre minimum de 90 j d'historique. Pragmatique mais invisible
 *   tant que l'utilisateur n'avait pas 3 mois d'usage.
 *
 *   V2.4-BIS mesure un rendement INSTANTANÉ constaté maintenant :
 *     - financier : plus-value latente `(MV − cost_basis) / cost_basis × 100`
 *     - crypto    : idem financier
 *     - immo loc. : rendement locatif net `loyers_nets_annuels / valeur_actuelle × 100`
 *     - cash      : taux contractuel (`cash_accounts.interest_rate`)
 *
 *   Plus de seuil temporel. Plus d'extrapolation. Disponible dès le jour 1.
 *
 * **Pureté** : aucun I/O, aucun appel Supabase. La résidence principale est
 * exclue côté UI logique (présence de `fiscalRegime` non null = locatif).
 *
 * **Pas de mélange inter-classes** : 4 buckets strictement isolés (financier,
 * crypto, immobilier, cash). Décision V2.4 maintenue.
 *
 * **Code V2.4 conservé sur le repo** :
 *   `lib/portfolio/twr-per-envelope.ts`, `lib/real-estate/yield-per-property.ts`,
 *   `lib/cash/rate-per-account.ts` restent disponibles (tests dédiés
 *   toujours verts) — utilisables pour des analyses futures, simplement
 *   plus consommés par le Dashboard.
 */

// ─────────────────────────────────────────────────────────────────────
// Types V2.4-BIS — sortie consommée par ZoneChampionsCasseroles
// ─────────────────────────────────────────────────────────────────────

/** 4 catégories rigides, identiques V2.4 (séparation stricte inter-classes). */
export type InvestmentCategory = 'financier' | 'crypto' | 'immobilier' | 'cash'

/** Nature de la métrique exposée — informatif pour l'UI (tooltip, suffixe). */
export type InvestmentMetricType =
  | 'plus_value_latente'    // financier + crypto : (MV − CB) / CB × 100
  | 'rendement_locatif'     // immo locatif : loyers_nets_annuels / valeur × 100
  | 'taux_contractuel'      // cash : interest_rate (annualisé par construction)

/** Une ligne de classement, granularité position-level. */
export interface InvestmentRanking {
  /** ID unique (positionId / propertyId / accountId). */
  id:             string
  /** Libellé principal (ex: « MSCI World Swap », « Immeuble Tandoori », « LEP »). */
  label:          string
  /** Libellé de l'enveloppe pour le financier/crypto (ex: « PEA », « Wallet »). */
  envelopeLabel?: string
  /** Rendement instantané en %. Positif = gain, négatif = perte. */
  yieldPct:       number
  /** Nature de la métrique pour l'UI (tooltip + suffixe). */
  metricType:     InvestmentMetricType
  /** Valeur de référence en EUR pour info (MV courante / valeur estimée / solde). */
  rawValueEur?:   number
}

/**
 * Bucket d'une catégorie : meilleur et pire.
 *
 * Conventions V2.4-BIS :
 *   - `best`  = top 1 du bucket
 *   - `worst` = bottom 1 du bucket UNIQUEMENT si ≥ 2 positions (jamais
 *     égal à `best`). Vide si le bucket n'a qu'1 position.
 */
export interface InvestmentRankingBucket {
  best:  InvestmentRanking[]
  worst: InvestmentRanking[]
}

/**
 * Bundle final indexé par catégorie. Chaque clé est OPTIONNELLE : un
 * bucket sans aucune position éligible est absent du retour (le composant
 * UI ne génère aucune ligne placeholder).
 */
export interface InvestmentRankings {
  financier?:  InvestmentRankingBucket
  crypto?:     InvestmentRankingBucket
  immobilier?: InvestmentRankingBucket
  cash?:       InvestmentRankingBucket
}

// ─────────────────────────────────────────────────────────────────────
// Inputs bruts — alimentés par le pipeline (calc.ts)
// ─────────────────────────────────────────────────────────────────────

/** Sous-ensemble d'une position financière ou crypto. */
export interface PositionForRanking {
  id:             string
  label:          string
  /** « PEA », « CTO », « Wallet Ledger »… (optionnel — apparaît à droite du label). */
  envelopeLabel?: string
  /** asset_class : 'crypto' route vers le bucket crypto, sinon financier. */
  assetClass:     string
  /** Valeur de marché actuelle EUR. */
  marketValueEur: number | null
  /** Cost basis EUR (PRU × qty). Obligatoire pour calculer la plus-value. */
  costBasisEur:   number
}

/** Sous-ensemble d'un bien immobilier. */
export interface PropertyForRanking {
  id:               string
  label:            string
  /** Loyers nets annuels (€). Si null → bien exclu (probable RP / pas de bail). */
  netAnnualRentEur: number | null
  /** Valeur estimée actuelle (€). Si null/0 → bien exclu (calcul impossible). */
  currentValueEur:  number | null
  /** Régime fiscal locatif. `null` = pas de régime déclaré → présumé RP, exclu. */
  fiscalRegime:     string | null
}

/** Sous-ensemble d'un compte cash. */
export interface CashAccountForRanking {
  id:             string
  label:          string
  /** Taux nominal annuel (%). Si null/NaN → compte exclu (compte courant typique). */
  interestRatePct: number | null
  /** Solde courant (€) — affiché à titre indicatif. */
  balanceEur:     number
}

export interface BuildInvestmentRankingsInput {
  positions:    PositionForRanking[]
  properties:   PropertyForRanking[]
  cashAccounts: CashAccountForRanking[]
}

// ─────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit les 4 buckets de classement à partir des inputs bruts du
 * Dashboard. Les buckets vides sont absents du retour (clé omise).
 */
export function buildInvestmentRankings(
  input: BuildInvestmentRankingsInput,
): InvestmentRankings {
  // ── Financier + Crypto (positions) ───────────────────────────────────
  const financierRows: InvestmentRanking[] = []
  const cryptoRows:    InvestmentRanking[] = []

  for (const p of input.positions) {
    if (p.marketValueEur === null) continue           // pas de MV → calcul impossible
    if (!(p.costBasisEur > 0)) continue                // CB nul → calcul impossible (exclu silencieux)
    const yieldPct = ((p.marketValueEur - p.costBasisEur) / p.costBasisEur) * 100
    if (!Number.isFinite(yieldPct)) continue
    const row: InvestmentRanking = {
      id:           p.id,
      label:        p.label,
      ...(p.envelopeLabel ? { envelopeLabel: p.envelopeLabel } : {}),
      yieldPct,
      metricType:   'plus_value_latente',
      rawValueEur:  p.marketValueEur,
    }
    if (p.assetClass === 'crypto') cryptoRows.push(row)
    else                            financierRows.push(row)
  }

  // ── Immobilier locatif (RP exclue par absence de fiscalRegime) ──────
  const immobilierRows: InvestmentRanking[] = []
  for (const r of input.properties) {
    if (r.fiscalRegime === null) continue              // pas de régime → RP, exclu
    if (r.netAnnualRentEur === null) continue          // pas de loyers → exclu
    if (r.currentValueEur === null || r.currentValueEur <= 0) continue
    const yieldPct = (r.netAnnualRentEur / r.currentValueEur) * 100
    if (!Number.isFinite(yieldPct)) continue
    immobilierRows.push({
      id:          r.id,
      label:       r.label,
      yieldPct,
      metricType:  'rendement_locatif',
      rawValueEur: r.currentValueEur,
    })
  }

  // ── Cash (interest_rate) ─────────────────────────────────────────────
  const cashRows: InvestmentRanking[] = []
  for (const a of input.cashAccounts) {
    if (a.interestRatePct === null) continue           // compte courant pur, exclu
    if (!Number.isFinite(a.interestRatePct)) continue
    cashRows.push({
      id:          a.id,
      label:       a.label,
      yieldPct:    a.interestRatePct,
      metricType:  'taux_contractuel',
      rawValueEur: a.balanceEur,
    })
  }

  // ── Assemblage final (clé omise si bucket vide) ──────────────────────
  const out: InvestmentRankings = {}
  const financier  = toBucket(financierRows)
  const crypto     = toBucket(cryptoRows)
  const immobilier = toBucket(immobilierRows)
  const cash       = toBucket(cashRows)
  if (financier)  out.financier  = financier
  if (crypto)     out.crypto     = crypto
  if (immobilier) out.immobilier = immobilier
  if (cash)       out.cash       = cash
  return out
}

/**
 * Convertit une liste de candidats d'une catégorie en bucket best/worst.
 *
 * Règles :
 *   - 0 candidat → renvoie `null` (la catégorie est absente du retour final).
 *   - 1 candidat → uniquement dans `best`. `worst` reste vide.
 *   - ≥ 2 candidats → meilleur dans `best[0]`, pire dans `worst[0]`.
 *     `best[0]` et `worst[0]` sont garantis différents (id distincts).
 *
 * Tie-breaker : `id.localeCompare` (déterminisme).
 */
function toBucket(rows: InvestmentRanking[]): InvestmentRankingBucket | null {
  if (rows.length === 0) return null
  const byBest  = [...rows].sort((a, b) => b.yieldPct - a.yieldPct || a.id.localeCompare(b.id))
  const best    = byBest[0]!
  if (rows.length === 1) {
    return { best: [best], worst: [] }
  }
  const byWorst = [...rows].sort((a, b) => a.yieldPct - b.yieldPct || a.id.localeCompare(b.id))
  const worst   = byWorst[0]!
  // Garantie d'égalité d'IDs entre best et worst quand 2 lignes ont même
  // yieldPct (cas extrême) : on garde best uniquement, worst vide.
  if (worst.id === best.id) {
    return { best: [best], worst: [] }
  }
  return { best: [best], worst: [worst] }
}
