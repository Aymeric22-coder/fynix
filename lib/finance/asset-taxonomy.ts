/**
 * Taxonomie unifiée des classes d'actifs (V1.2 P0.6).
 *
 * Cible : éliminer BUG-6 du Dashboard — les anciennes clés du donut
 * mélangeaient `asset:real_estate` / `asset:cash` / `asset:other` (depuis la
 * table `assets`) avec `class:etf` / `class:actions` / `class:scpi`… (depuis
 * `portfolioSummary.allocationByClass`). Ces préfixes hétérogènes rendaient
 * la lecture du donut peu lisible et empêchaient toute agrégation propre.
 *
 * Cette taxonomie est la **source unique de vérité** pour la classification
 * des actifs côté Dashboard. Elle sera étendue (et NON remplacée) au fur et
 * à mesure que le modèle de données supportera de nouveaux types (SCI,
 * holding, démembrement en P2.2/P2.3).
 */

/** Clés canoniques de la taxonomie. L'ordre est sémantique (du plus
 *  « patrimonial classique » au plus « divers »), pas un ordre de tri. */
export const ASSET_TAXONOMY = [
  'immobilier_physique',
  'actions',
  'etf',
  'obligations',
  'scpi',
  'crypto',
  'cash',
  'or_metaux',
  'autres',
] as const

export type TaxonomyKey = (typeof ASSET_TAXONOMY)[number]

/** Libellés en français pour l'UI. */
export const TAXONOMY_LABELS: Record<TaxonomyKey, string> = {
  immobilier_physique: 'Immobilier',
  actions:             'Actions',
  etf:                 'ETF',
  obligations:         'Obligations',
  scpi:                'SCPI',
  crypto:              'Crypto',
  cash:                'Cash',
  or_metaux:           'Or / Métaux',
  autres:              'Autres',
}

/** Couleurs canoniques (alignées sur la palette emerald + tokens existants). */
export const TAXONOMY_COLORS: Record<TaxonomyKey, string> = {
  immobilier_physique: '#E8B84B',   // or (la seule classe à utiliser cet accent — cf. CLAUDE.md)
  actions:             '#3b82f6',   // bleu
  etf:                 '#10b981',   // emerald (couleur d'accent globale)
  obligations:         '#8b5cf6',   // violet
  scpi:                '#f59e0b',   // amber
  crypto:              '#f97316',   // orange
  cash:                '#71717a',   // zinc 500 (cohérent avec --color-secondary)
  or_metaux:           '#a16207',   // brun-or
  autres:              '#6b7280',   // gris neutre (gray-500)
}

/**
 * Source d'une clé d'origine — distingue les deux pipelines historiques :
 *   - `'asset_type'` : valeur de `assets.asset_type` (Supabase)
 *   - `'asset_class'` : valeur de `instruments.asset_class` (positions
 *     financières via `portfolioSummary.allocationByClass`)
 */
export type TaxonomySource = 'asset_type' | 'asset_class'

/**
 * Mapping vers la taxonomie canonique.
 *
 * Stratégie : table de correspondance explicite + fallback vers `'autres'`
 * pour les valeurs inconnues (jamais d'erreur silencieuse — l'utilisateur
 * voit ses actifs même si la classification rate). Les warnings de
 * classification doivent rester côté `lib/analyse` (pas d'I/O ici).
 *
 * Cas ambigus documentés :
 *   - `'fonds_euros'` : majoritairement obligataire (>70 % typiquement) →
 *     mappé sur `'obligations'`. C'est la décision la plus défendable
 *     prudentiellement ; on perd la nuance « capital garanti » mais elle
 *     n'est pas pertinente pour la répartition par classe d'actifs.
 *   - `'metaux'` / `'or'` : mappés sur `'or_metaux'`.
 *   - `'asset:other'` (proxy SCI / holding / non coté dans Fynix actuel) →
 *     mappé sur `'autres'` jusqu'à ce que P2.2 livre un modèle dédié.
 */
export function mapToTaxonomy(input: { source: TaxonomySource; key: string }): TaxonomyKey {
  const k = input.key.toLowerCase()

  if (input.source === 'asset_type') {
    switch (k) {
      case 'real_estate': return 'immobilier_physique'
      case 'cash':        return 'cash'
      case 'other':       return 'autres'
      default:            return 'autres'
    }
  }

  // source === 'asset_class' (positions portfolio)
  switch (k) {
    case 'etf':           return 'etf'
    case 'actions':       return 'actions'
    case 'action':        return 'actions'
    case 'obligations':   return 'obligations'
    case 'obligation':    return 'obligations'
    case 'fonds_euros':   return 'obligations'  // cf. note ambiguïté
    case 'scpi':          return 'scpi'
    case 'crypto':        return 'crypto'
    case 'cash':          return 'cash'
    case 'or':            return 'or_metaux'
    case 'metaux':        return 'or_metaux'
    case 'gold':          return 'or_metaux'
    case 'real_estate':   return 'immobilier_physique'  // si une position est tagguée ainsi
    default:              return 'autres'
  }
}
