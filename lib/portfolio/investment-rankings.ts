/**
 * Classement Champions / Casseroles — rendement instantané par bucket
 * (V2.4-BIS / V2.4-TER).
 *
 * **Historique d'approche** :
 *   - V2.4 : performance annualisée (TWR, yield, taux) + seuil 90 j → zone
 *     invisible sur un compte récent. Approche abandonnée pour Z8.5.
 *   - V2.4-BIS : rendement INSTANTANÉ par catégorie (4 buckets : financier,
 *     crypto, immobilier, cash).
 *   - V2.4-TER : **fusion `financier` + `crypto` en bucket `marche`**
 *     (même métrique = plus-value latente, séparer les 2 n'apportait
 *     aucune information) ET **suppression complète du bucket `cash`**
 *     (le cash n'est pas un investissement au sens propre, c'est un
 *     parking sécurisé du capital ; le classer aux côtés du Nasdaq crée
 *     une confusion entre rendement contractuel et performance).
 *
 * **Métriques V2.4-TER** :
 *   - `marche`     : plus-value latente `(MV − cost_basis) / cost_basis × 100`
 *                    (positions financier + crypto fusionnées)
 *   - `immobilier` : rendement locatif net `loyers_nets_annuels / valeur × 100`
 *                    (RP exclue par `fiscalRegime === null`)
 *
 * Le cash conserve sa visibilité ailleurs sur le Dashboard :
 *   - Z7 « 🐷 Cash · X €/an » (ligne compacte, intacte)
 *   - Section `/cash` accessible via le lien « Voir le détail »
 *
 * **Pureté** : aucun I/O, aucun appel Supabase.
 * **Pas de mélange inter-classes** : `marche` (mobilier) et `immobilier`
 * (physique) restent strictement séparés — c'est leur nature liquide /
 * illiquide qui les sépare, pas leur volatilité intrinsèque.
 *
 * **Code V2.4 conservé sur le repo, décroché du pipeline** :
 *   `lib/portfolio/twr-per-envelope.ts`, `lib/real-estate/yield-per-property.ts`,
 *   `lib/cash/rate-per-account.ts` restent disponibles avec leurs tests
 *   dédiés. Utilisables pour des analyses futures.
 */

// ─────────────────────────────────────────────────────────────────────
// Types V2.4-TER — sortie consommée par ZoneChampionsCasseroles
// ─────────────────────────────────────────────────────────────────────

/** Catégories du classement V2.4-TER : 2 buckets seulement. */
export type InvestmentCategory = 'marche' | 'immobilier'

/**
 * Sous-type informatif (pour traçabilité interne uniquement). Permet à
 * d'éventuels consommateurs analytiques de re-séparer financier / crypto
 * dans le bucket `marche` ; ZoneChampionsCasseroles ne s'en sert PAS.
 */
export type InvestmentSubType = 'financier' | 'crypto'

/** Nature de la métrique exposée — informatif pour l'UI (tooltip). */
export type InvestmentMetricType =
  | 'plus_value_latente'    // marche : (MV − CB) / CB × 100
  | 'rendement_locatif'     // immobilier : loyers_nets_annuels / valeur × 100

/** Une ligne de classement. */
export interface InvestmentRanking {
  /** ID unique (positionId / propertyId). */
  id:             string
  /** Libellé principal (ex: « MSCI World Swap », « Immeuble Tandoori »). */
  label:          string
  /** Libellé de l'enveloppe pour les positions marché (ex: « PEA », « Wallet »). */
  envelopeLabel?: string
  /** Rendement instantané en %. Positif = gain, négatif = perte. */
  yieldPct:       number
  /** Nature de la métrique pour l'UI (tooltip). */
  metricType:     InvestmentMetricType
  /** Valeur de référence en EUR pour info (MV courante / valeur estimée). */
  rawValueEur?:   number
  /** V2.4-TER — sous-type informatif. Pas d'affichage différencié dans le bucket. */
  subType?:       InvestmentSubType
}

/**
 * Bucket d'une catégorie : meilleur et pire.
 *
 * Conventions inchangées vs V2.4-BIS :
 *   - `best`  = top 1 du bucket
 *   - `worst` = bottom 1 du bucket UNIQUEMENT si ≥ 2 positions
 */
export interface InvestmentRankingBucket {
  best:  InvestmentRanking[]
  worst: InvestmentRanking[]
}

/**
 * Bundle final indexé par catégorie. Clés OPTIONNELLES : un bucket sans
 * candidat est absent du retour (l'UI ne génère aucune ligne placeholder).
 *
 * V2.4-TER : **uniquement 2 clés possibles** — `marche` et `immobilier`.
 * Le bucket `cash` n'existe plus.
 */
export interface InvestmentRankings {
  marche?:     InvestmentRankingBucket
  immobilier?: InvestmentRankingBucket
}

// ─────────────────────────────────────────────────────────────────────
// Inputs bruts — alimentés par le pipeline (calc.ts)
// ─────────────────────────────────────────────────────────────────────

/** Sous-ensemble d'une position financière ou crypto. */
export interface PositionForRanking {
  id:             string
  label:          string
  /** « PEA », « CTO », « Wallet Ledger »… (apparaît à droite du label). */
  envelopeLabel?: string
  /**
   * asset_class de la position. V2.4-TER : utilisé uniquement pour porter
   * le `subType` informatif (`crypto` ↔ assetClass==='crypto', sinon
   * `financier`). Ne sépare PLUS les buckets — tout va dans `marche`.
   */
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

export interface BuildInvestmentRankingsInput {
  positions:  PositionForRanking[]
  properties: PropertyForRanking[]
}

// ─────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit les 2 buckets de classement à partir des inputs bruts. Les
 * buckets vides sont absents du retour (clé omise).
 *
 * V2.4-TER : `marche` fusionne financier + crypto. Plus de bucket `cash`.
 */
export function buildInvestmentRankings(
  input: BuildInvestmentRankingsInput,
): InvestmentRankings {
  // ── Marché (positions financier + crypto fusionnées) ────────────────
  const marcheRows: InvestmentRanking[] = []
  for (const p of input.positions) {
    if (p.marketValueEur === null) continue           // pas de MV → calcul impossible
    if (!(p.costBasisEur > 0)) continue                // CB nul → calcul impossible
    const yieldPct = ((p.marketValueEur - p.costBasisEur) / p.costBasisEur) * 100
    if (!Number.isFinite(yieldPct)) continue
    marcheRows.push({
      id:           p.id,
      label:        p.label,
      ...(p.envelopeLabel ? { envelopeLabel: p.envelopeLabel } : {}),
      yieldPct,
      metricType:   'plus_value_latente',
      rawValueEur:  p.marketValueEur,
      subType:      p.assetClass === 'crypto' ? 'crypto' : 'financier',
    })
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

  // ── Assemblage final (clé omise si bucket vide) ──────────────────────
  const out: InvestmentRankings = {}
  const marche     = toBucket(marcheRows)
  const immobilier = toBucket(immobilierRows)
  if (marche)     out.marche     = marche
  if (immobilier) out.immobilier = immobilier
  return out
}

/**
 * Convertit une liste de candidats en bucket best/worst.
 *
 * Règles inchangées :
 *   - 0 candidat → `null` (catégorie absente du retour final)
 *   - 1 candidat → uniquement dans `best`, `worst` vide
 *   - ≥ 2 candidats → best[0] (top) + worst[0] (bottom), id distincts
 *
 * Tie-breaker : `id.localeCompare` (déterminisme).
 */
function toBucket(rows: InvestmentRanking[]): InvestmentRankingBucket | null {
  if (rows.length === 0) return null
  const byBest = [...rows].sort((a, b) => b.yieldPct - a.yieldPct || a.id.localeCompare(b.id))
  const best   = byBest[0]!
  if (rows.length === 1) {
    return { best: [best], worst: [] }
  }
  const byWorst = [...rows].sort((a, b) => a.yieldPct - b.yieldPct || a.id.localeCompare(b.id))
  const worst   = byWorst[0]!
  if (worst.id === best.id) {
    return { best: [best], worst: [] }
  }
  return { best: [best], worst: [worst] }
}
