/**
 * Classement Champions / Casseroles par catégorie d'investissement (V2.4 P0.7 ST4).
 *
 * Agrège les sorties des 3 moteurs spécialisés :
 *   - `computeTwrPerEnvelope`  → catégories `financier` et `crypto`
 *   - `computeYieldPerProperty` → catégorie `immobilier`
 *   - `computeRatePerAccount`  → catégorie `cash`
 *
 * Et produit, pour chaque catégorie, le top 2 best + top 2 worst
 * **strictement isolé par catégorie** (cf. décision V2.4 : pas de
 * mélange inter-classes ni dans le code, ni dans l'UI).
 *
 * **Pureté** : aucun I/O, aucun appel Supabase. Les inputs sont les
 * sorties des helpers spécialisés. Les libellés viennent du composant
 * UI (Z8.5), pas d'ici.
 */

import type { EnvelopeTwrResult } from './twr-per-envelope'
import type { PropertyYieldResult } from '@/lib/real-estate/yield-per-property'
import type { CashRateResult } from '@/lib/cash/rate-per-account'

export type InvestmentCategory = 'financier' | 'crypto' | 'immobilier' | 'cash'

/** Une ligne du classement (un investissement candidat, toutes catégories confondues). */
export interface InvestmentRankingItem {
  /** Identifiant unique (envelope_id / property_id / cash_account_id). */
  id:                  string
  /** Libellé affichable (« PEA Boursorama », « T2 Lyon », « Livret A »…). */
  label:               string
  /** Rentabilité annualisée (%) — TWR ou yield ou taux nominal. */
  annualizedReturnPct: number
  /** Jours de détention (ou ancienneté de l'enveloppe). */
  holdingDays:         number
  /** `true` si annualisation extrapolée (TWR < 365 j). Toujours `false` pour
   *  immobilier et cash (KPIs déjà annualisés par construction). */
  extrapole:           boolean
  /** Vrai si données partielles (uniquement immo en V2.4). */
  incompleteData?:     boolean
}

/** Une catégorie du classement (top 2 best + top 2 worst). */
export interface InvestmentRanking {
  category:        InvestmentCategory
  /** Top 2 best (rentabilité décroissante). */
  best:            InvestmentRankingItem[]
  /** Top 2 worst (rentabilité croissante). */
  worst:           InvestmentRankingItem[]
  /** Nombre de candidats après filtre 90 j. Permet à l'UI de masquer une
   *  catégorie vide ou de signaler « 1 seul investissement éligible ». */
  totalCandidates: number
}

/** Enveloppes financières → catégorie ('financier' ou 'crypto'). */
export interface EnvelopeWithType extends EnvelopeTwrResult {
  /** Type d'enveloppe (`'wallet_crypto'` → crypto, sinon financier). */
  envelopeType: string | null
}

export interface BuildInvestmentRankingsInput {
  envelopes:  EnvelopeWithType[]
  properties: PropertyYieldResult[]
  cashAccounts: CashRateResult[]
  /**
   * Nombre maximum d'entrées dans chaque liste (best et worst). Défaut 2
   * conforme au brief V2.4 (« Top 2 par catégorie, pas un top 5 global »).
   */
  topN?: number
}

const DEFAULT_TOP_N = 2

/**
 * Construit les 4 classements (financier / crypto / immobilier / cash).
 * Renvoie toujours 4 entrées, dans cet ordre, même si une catégorie est
 * vide (best & worst vides + totalCandidates 0). Le composant Z8.5
 * décidera de l'affichage / masquage.
 */
export function buildInvestmentRankings(
  input: BuildInvestmentRankingsInput,
): InvestmentRanking[] {
  const topN = input.topN ?? DEFAULT_TOP_N

  // ── Catégorie financier vs crypto : split sur envelopeType ───────────
  const financier:  InvestmentRankingItem[] = []
  const crypto:     InvestmentRankingItem[] = []
  for (const e of input.envelopes) {
    const item: InvestmentRankingItem = {
      id:                  e.envelopeId ?? '__no_envelope__',
      label:               e.envelopeLabel,
      annualizedReturnPct: e.twrAnnualisePct,
      holdingDays:         e.holdingDays,
      extrapole:           e.extrapole,
    }
    if (e.envelopeType === 'wallet_crypto') crypto.push(item)
    else                                    financier.push(item)
  }

  // ── Catégorie immobilier ─────────────────────────────────────────────
  const immobilier: InvestmentRankingItem[] = input.properties.map((p) => ({
    id:                  p.propertyId,
    label:               p.propertyLabel,
    annualizedReturnPct: p.netNetYieldPct,
    holdingDays:         p.holdingDays,
    extrapole:           p.extrapole,
    incompleteData:      p.incompleteData,
  }))

  // ── Catégorie cash ───────────────────────────────────────────────────
  const cash: InvestmentRankingItem[] = input.cashAccounts.map((c) => ({
    id:                  c.accountId,
    label:               c.accountLabel,
    annualizedReturnPct: c.interestRatePct,
    holdingDays:         c.holdingDays,
    extrapole:           c.extrapole,
  }))

  // ── Helpers tri ───────────────────────────────────────────────────────
  const bestOf  = (items: InvestmentRankingItem[]) =>
    [...items]
      .sort((a, b) => b.annualizedReturnPct - a.annualizedReturnPct || a.id.localeCompare(b.id))
      .slice(0, topN)
  const worstOf = (items: InvestmentRankingItem[]) =>
    [...items]
      .sort((a, b) => a.annualizedReturnPct - b.annualizedReturnPct || a.id.localeCompare(b.id))
      .slice(0, topN)

  return [
    { category: 'financier',  best: bestOf(financier),  worst: worstOf(financier),  totalCandidates: financier.length  },
    { category: 'crypto',     best: bestOf(crypto),     worst: worstOf(crypto),     totalCandidates: crypto.length     },
    { category: 'immobilier', best: bestOf(immobilier), worst: worstOf(immobilier), totalCandidates: immobilier.length },
    { category: 'cash',       best: bestOf(cash),       worst: worstOf(cash),       totalCandidates: cash.length       },
  ]
}
