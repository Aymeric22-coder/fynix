/**
 * Catégorisation haut niveau du portefeuille.
 *
 * Les 17 valeurs de l'ENUM `asset_class` sont regroupées en 7 catégories
 * affichables sous forme d'onglets / sous-vues filtrables sur le cockpit.
 * Chaque catégorie a un slug stable utilisé dans l'URL (`?cat=bourse`).
 *
 * La catégorie 'global' n'est pas une catégorie au sens strict : c'est la
 * vue par défaut qui affiche TOUTES les positions (équivalent à pas de filtre).
 */

import type { AssetClass } from '@/types/database.types'
import type {
  PortfolioResult, PortfolioSummary, PositionValuation,
} from './types'

export interface PortfolioCategoryDef {
  id:      string
  label:   string
  /** Classes incluses. `null` = toutes (vue Global). */
  classes: AssetClass[] | null
}

export const PORTFOLIO_CATEGORIES: ReadonlyArray<PortfolioCategoryDef> = [
  { id: 'global',           label: 'Global',           classes: null },
  { id: 'bourse',           label: 'Bourse',           classes: ['equity', 'etf'] },
  { id: 'fonds',            label: 'Fonds',            classes: ['fund'] },
  { id: 'immobilier_papier',label: 'Immo papier',      classes: ['scpi', 'reit', 'siic', 'opci'] },
  { id: 'crypto',           label: 'Crypto',           classes: ['crypto', 'defi'] },
  { id: 'obligataire',      label: 'Obligataire',      classes: ['bond', 'private_debt'] },
  { id: 'metaux',           label: 'Métaux',           classes: ['metal'] },
  { id: 'alternatif',       label: 'Alternatif',       classes: ['private_equity', 'crowdfunding', 'structured', 'derivative', 'other'] },
]

export type CategoryId = typeof PORTFOLIO_CATEGORIES[number]['id']

/** Retourne le slug de catégorie pour une asset_class donnée. */
export function categoryForClass(c: AssetClass): CategoryId {
  for (const cat of PORTFOLIO_CATEGORIES) {
    if (cat.id === 'global') continue
    if (cat.classes && cat.classes.includes(c)) return cat.id
  }
  return 'alternatif'
}

/** Vérifie qu'un id de catégorie est valide. */
export function isValidCategoryId(id: string | null | undefined): id is CategoryId {
  if (!id) return false
  return PORTFOLIO_CATEGORIES.some((c) => c.id === id)
}

// ─── Filtrage + ré-agrégation ─────────────────────────────────────────

/**
 * Filtre un PortfolioResult par catégorie et recalcule les agrégats.
 *
 * - 'global' ou catégorie invalide → renvoie le résultat tel quel.
 * - Autres : filtre les positions, recalcule le summary (totaux + allocations
 *   + freshness) sur le sous-ensemble.
 *
 * NOTE : la conversion FX est supposée déjà appliquée dans les
 * PositionValuation (marketValue est dans la devise de la position, on
 * suppose 1:1 vers la devise de référence pour l'instant — cohérent avec
 * l'usage actuel en EUR mono-devise).
 */
export function filterPortfolioByCategory(
  result:   PortfolioResult,
  category: string,
): PortfolioResult {
  if (!category || category === 'global') return result

  const def = PORTFOLIO_CATEGORIES.find((c) => c.id === category)
  if (!def || !def.classes) return result

  const allowed = new Set<string>(def.classes)
  const filtered = result.positions.filter((p) => allowed.has(p.assetClass))

  if (filtered.length === 0) {
    return {
      positions: [],
      summary:   emptySummary(result.summary.referenceCurrency),
    }
  }

  return {
    positions: filtered,
    summary:   recomputeSummary(filtered, result.summary.referenceCurrency),
  }
}

/**
 * Recalcule un PortfolioSummary à partir d'une liste de PositionValuation
 * déjà enrichies. Utilisé pour les vues filtrées.
 *
 * Les valeurs sont en devise de la position ; on suppose FX 1:1 vers `ref`
 * (cohérent avec l'usage EUR mono-devise actuel). Quand le multi-devise
 * sera activé, cette fonction prendra un `fx` en argument.
 */
export function recomputeSummary(
  valuations: PositionValuation[],
  ref:        PortfolioSummary['referenceCurrency'],
): PortfolioSummary {
  const actives = valuations.filter((v) => v.status === 'active')

  let totalCostBasis        = 0
  let totalCostBasisValued  = 0
  let totalMarketValue      = 0
  let freshCount            = 0
  let valuedCount           = 0

  const byClass    = new Map<AssetClass, number>()
  const byEnvelope = new Map<string | null, number>()

  for (const v of actives) {
    totalCostBasis += v.costBasis
    if (v.marketValue !== null) {
      totalMarketValue       += v.marketValue
      totalCostBasisValued   += v.costBasis
      valuedCount++
      if (!v.priceStale) freshCount++
      byClass.set(v.assetClass, (byClass.get(v.assetClass) ?? 0) + v.marketValue)
      byEnvelope.set(v.envelopeId, (byEnvelope.get(v.envelopeId) ?? 0) + v.marketValue)
    }
  }

  const totalUnrealizedPnL =
    valuedCount > 0 ? totalMarketValue - totalCostBasisValued : null
  const totalUnrealizedPnLPct =
    valuedCount > 0 && totalCostBasisValued > 0
      ? ((totalMarketValue - totalCostBasisValued) / totalCostBasisValued) * 100
      : null

  const allocationByClass = Array.from(byClass.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      weightPct: totalMarketValue > 0 ? (value / totalMarketValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  const allocationByEnvelope = Array.from(byEnvelope.entries())
    .map(([envelopeId, value]) => ({
      envelopeId,
      value,
      weightPct: totalMarketValue > 0 ? (value / totalMarketValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    positionsCount:        actives.length,
    valuedPositionsCount:  valuedCount,
    totalCostBasis,
    totalCostBasisValued,
    totalMarketValue,
    totalUnrealizedPnL,
    totalUnrealizedPnLPct,
    freshnessRatio:        valuedCount > 0 ? freshCount / valuedCount : 0,
    allocationByClass,
    allocationByEnvelope,
    referenceCurrency:     ref,
  }
}

function emptySummary(ref: PortfolioSummary['referenceCurrency']): PortfolioSummary {
  return {
    positionsCount:        0,
    valuedPositionsCount:  0,
    totalCostBasis:        0,
    totalCostBasisValued:  0,
    totalMarketValue:      0,
    totalUnrealizedPnL:    null,
    totalUnrealizedPnLPct: null,
    freshnessRatio:        0,
    allocationByClass:     [],
    allocationByEnvelope:  [],
    referenceCurrency:     ref,
  }
}

// ─── Helpers UI : compteurs par catégorie ─────────────────────────────

export interface CategorySummary {
  id:             CategoryId
  label:          string
  positionsCount: number
  totalValue:     number
}

/**
 * Calcule pour CHAQUE catégorie : nombre de positions actives + valeur de
 * marché totale. Utilisé pour afficher des badges sur les onglets.
 */
export function summarizeCategories(
  positions: PositionValuation[],
): CategorySummary[] {
  return PORTFOLIO_CATEGORIES.map((cat) => {
    const inCat = cat.classes === null
      ? positions
      : positions.filter((p) => cat.classes!.includes(p.assetClass))
    const actives = inCat.filter((p) => p.status === 'active')
    return {
      id:             cat.id,
      label:          cat.label,
      positionsCount: actives.length,
      totalValue:     actives.reduce((s, p) => s + (p.marketValue ?? 0), 0),
    }
  })
}
