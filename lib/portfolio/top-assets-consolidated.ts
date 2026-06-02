/**
 * Top 5 actifs consolidé par enveloppe / bien / compte (V2.3 — BUG-5).
 *
 * **Correctif** : l'ancien `topAssets` mélangeait les granularités —
 * un bien immo entier à 410 k€ avec une position atomique ETF à 13 k€.
 * Le classement devenait inintelligible et dominé par l'immo.
 *
 * **V2.3** : on consolide à 3 granularités cohérentes :
 *   - 1 ligne par **enveloppe financière** (PEA, CTO, AV, PER, wallet crypto…)
 *     somme des MV de toutes les positions de l'enveloppe
 *   - 1 ligne par **bien immobilier** (current_value du bien)
 *   - 1 ligne par **compte cash** (livret réglementé OU compte courant —
 *     Livret A séparé de LDDS séparé de LEP, décision V1.0)
 *
 * **Fallback** : si ≥ 50 % des positions financières actives sont sans
 * `envelopeId`, on agrège plutôt par `assetClass` (sinon on aurait une
 * grosse ligne « Sans enveloppe » qui n'aide pas l'utilisateur).
 *
 * **Tri** : par `totalValueEur` décroissant, tie-breaker `key.localeCompare`
 * (déterminisme). Limité aux 5 premiers.
 *
 * **Pureté** : aucun I/O. Les sources sont alimentées par le pipeline
 * (`calc.ts`) à partir de `DashboardPipelineInputs`.
 */

import type {
  TopAssetConsolidated,
  ConsolidatedEnvelopeType,
} from '@/lib/analyse/dashboard-pipeline/types'

// ─────────────────────────────────────────────────────────────────────
// Inputs bruts (collectés par calc.ts)
// ─────────────────────────────────────────────────────────────────────

/** Position de portefeuille (sous-ensemble dédié au top consolidé). */
export interface PositionForTop {
  positionId:  string
  /** ID d'enveloppe (PEA / CTO / wallet…). `null` = position orpheline (fallback potentiel). */
  envelopeId:  string | null
  /** Classe d'actif (`'etf'`, `'actions'`, `'crypto'`, `'or_metaux'`…) — utilisée par le fallback. */
  assetClass:  string
  /** Valeur de marché en €. `null` = position non valorisée, exclue de la somme. */
  marketValueEur: number | null
  /** Nom de la position pour debug (non affiché en consolidé, peut servir au fallback). */
  name?:       string
}

/** Méta d'une enveloppe pour libellé + typage. */
export interface EnvelopeForTop {
  id:           string
  name:         string
  envelopeType: string             // 'pea' | 'cto' | 'assurance_vie' | 'per' | 'wallet_crypto' | 'other'
}

/** Bien immobilier — 1 entrée par bien (PAS d'agrégation entre biens). */
export interface PropertyForTop {
  /** ID stable côté `assets` (ou `real_estate_properties.id`). */
  id:               string
  name:             string
  /** Valeur estimée actuelle (`assets.current_value`). */
  currentValueEur:  number
}

/** Compte cash — 1 entrée par compte (livret OU CC). */
export interface CashAccountForTop {
  id:           string
  label:        string                       // ex: « Livret A — Crédit Agricole »
  /** Type de compte pour différencier livret réglementé vs CC. */
  accountType:  string                       // 'livret_a' | 'ldds' | 'lep' | … | 'compte_courant'
  balanceEur:   number
}

export interface BuildTopAssetsConsolidatedInput {
  positions:    PositionForTop[]
  envelopes:    EnvelopeForTop[]
  properties:   PropertyForTop[]
  cashAccounts: CashAccountForTop[]
  /** Patrimoine BRUT pour le calcul du `percentOfGross`. */
  grossValueEur: number
  /** Limite du top (défaut 5). */
  limit?:        number
}

// ─────────────────────────────────────────────────────────────────────
// Mapping métier — type enveloppe + libellé + href
// ─────────────────────────────────────────────────────────────────────

/** Mappe le `envelope_type` Supabase vers le sous-ensemble consolidé. */
function envelopeTypeToConsolidated(supabaseType: string | undefined | null): ConsolidatedEnvelopeType {
  switch (supabaseType) {
    case 'pea':           return 'pea'
    case 'cto':           return 'cto'
    case 'assurance_vie': return 'av'
    case 'per':           return 'per'
    case 'wallet_crypto': return 'wallet_crypto'
    default:              return 'other'
  }
}

/**
 * Distingue les livrets réglementés (rémunérés) des comptes courants
 * (non rémunérés, surface 0 % par défaut).
 */
function cashTypeToConsolidated(accountType: string | undefined | null): ConsolidatedEnvelopeType {
  if (accountType === 'compte_courant') return 'cash_courant'
  return 'cash_livret'
}

const DEFAULT_LIMIT = 5
/** Seuil de fallback : si plus de 50 % des positions actives sont sans `envelopeId`. */
const NO_ENVELOPE_FALLBACK_RATIO = 0.5

/**
 * Libellés humains pour les classes d'actif quand le fallback est actif.
 * Couvre les principales sorties de `mapToTaxonomy` côté positions.
 */
const ASSET_CLASS_LABELS: Record<string, string> = {
  actions:    'Actions',
  etf:        'ETF / Fonds',
  crypto:     'Crypto',
  scpi:       'SCPI',
  or_metaux:  'Or / Métaux',
  obligations:'Obligations',
}

// ─────────────────────────────────────────────────────────────────────
// Orchestration principale
// ─────────────────────────────────────────────────────────────────────

/**
 * Construit le top 5 consolidé.
 *
 * Algorithme :
 *   1. Décide du mode pour les positions financières : `envelope` ou `asset_class`
 *      (`fallback` activé si ≥ 50 % de positions sans `envelopeId`).
 *   2. Agrège les positions selon le mode → entrées « financier ».
 *   3. Ajoute 1 entrée par bien immo et 1 entrée par compte cash.
 *   4. Trie par `totalValueEur` desc, tie-breaker `key.localeCompare`.
 *   5. Tronque à `limit`.
 *   6. Calcule `percentOfGross` pour chaque entrée retenue.
 */
export function buildTopAssetsConsolidated(
  input: BuildTopAssetsConsolidatedInput,
): TopAssetConsolidated[] {
  const limit = input.limit ?? DEFAULT_LIMIT

  // ── 1. Choix du mode pour les positions financières ────────────────
  const validPositions = input.positions.filter((p) => p.marketValueEur !== null && p.marketValueEur > 0)
  const totalActive    = validPositions.length
  const noEnvelopeCount = validPositions.filter((p) => p.envelopeId === null).length
  const useAssetClassFallback = totalActive > 0
    && (noEnvelopeCount / totalActive) >= NO_ENVELOPE_FALLBACK_RATIO

  const envelopeLabelById = new Map(input.envelopes.map((e) => [e.id, e.name]))
  const envelopeTypeById  = new Map(input.envelopes.map((e) => [e.id, e.envelopeType]))

  // ── 2. Agrégation des positions ────────────────────────────────────
  const rows: TopAssetConsolidated[] = []

  if (useAssetClassFallback) {
    // Mode fallback : agréger par `assetClass`.
    const byClass = new Map<string, { total: number; count: number }>()
    for (const p of validPositions) {
      const key = p.assetClass || 'other'
      const acc = byClass.get(key) ?? { total: 0, count: 0 }
      acc.total += p.marketValueEur ?? 0
      acc.count += 1
      byClass.set(key, acc)
    }
    for (const [assetClass, { total, count }] of byClass.entries()) {
      rows.push({
        key:                      `class:${assetClass}`,
        label:                    ASSET_CLASS_LABELS[assetClass] ?? assetClass,
        envelopeType:             'asset_class',
        totalValueEur:            total,
        percentOfGross:           0,                // recalculé après slice
        underlyingPositionsCount: count,
        href:                     '/portefeuille',
      })
    }
  } else {
    // Mode normal : agréger par `envelopeId`.
    const byEnvelope = new Map<string, { total: number; count: number }>()
    const orphanPositions: PositionForTop[] = []
    for (const p of validPositions) {
      if (p.envelopeId === null) {
        orphanPositions.push(p)
        continue
      }
      const acc = byEnvelope.get(p.envelopeId) ?? { total: 0, count: 0 }
      acc.total += p.marketValueEur ?? 0
      acc.count += 1
      byEnvelope.set(p.envelopeId, acc)
    }
    for (const [envId, { total, count }] of byEnvelope.entries()) {
      const supabaseType = envelopeTypeById.get(envId)
      const consolidated = envelopeTypeToConsolidated(supabaseType)
      rows.push({
        key:                      `envelope:${envId}`,
        label:                    envelopeLabelById.get(envId) ?? envId,
        envelopeType:             consolidated,
        totalValueEur:            total,
        percentOfGross:           0,
        underlyingPositionsCount: count,
        href:                     '/portefeuille',
      })
    }
    // Bucket « Sans enveloppe » si quelques positions orphelines restent
    // sous le seuil de fallback global (cas minoritaire mais représenté).
    if (orphanPositions.length > 0) {
      const total = orphanPositions.reduce((s, p) => s + (p.marketValueEur ?? 0), 0)
      rows.push({
        key:                      'envelope:__none__',
        label:                    'Sans enveloppe',
        envelopeType:             'other',
        totalValueEur:            total,
        percentOfGross:           0,
        underlyingPositionsCount: orphanPositions.length,
        href:                     '/portefeuille',
      })
    }
  }

  // ── 3. Biens immo (1 ligne par bien, RP incluse) ───────────────────
  for (const re of input.properties) {
    if (re.currentValueEur <= 0) continue
    rows.push({
      key:                      `re:${re.id}`,
      label:                    re.name,
      envelopeType:             'real_estate',
      totalValueEur:            re.currentValueEur,
      percentOfGross:           0,
      underlyingPositionsCount: 1,
      href:                     `/immobilier/${re.id}`,
    })
  }

  // ── 4. Comptes cash (1 ligne par compte) ───────────────────────────
  for (const c of input.cashAccounts) {
    if (c.balanceEur <= 0) continue
    rows.push({
      key:                      `cash:${c.id}`,
      label:                    c.label,
      envelopeType:             cashTypeToConsolidated(c.accountType),
      totalValueEur:            c.balanceEur,
      percentOfGross:           0,
      underlyingPositionsCount: 1,
      href:                     '/cash',
    })
  }

  // ── 5. Tri + tronquage ─────────────────────────────────────────────
  rows.sort((a, b) => (b.totalValueEur - a.totalValueEur) || a.key.localeCompare(b.key))
  const top = rows.slice(0, limit)

  // ── 6. Calcul du % du brut sur les entrées retenues ─────────────────
  const denom = input.grossValueEur > 0 ? input.grossValueEur : 1
  return top.map((r) => ({
    ...r,
    percentOfGross: (r.totalValueEur / denom) * 100,
  }))
}
