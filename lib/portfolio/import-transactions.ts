/**
 * Helpers serveur pour la persistance des transactions importées (E5).
 *
 * Module séparé de `csvImport.ts` car il importe `node:crypto`,
 * incompatible avec les Client Components qui consomment csvImport
 * pour le parser brut (import-csv-modal.tsx, etc.).
 *
 * Ne PAS importer ce module depuis un fichier 'use client'.
 */

import { createHash } from 'node:crypto'
import { computeRunningCump, type NormalizedTransaction } from './csvImport'

/** Mapping NormalizedTransaction → enum DB `transaction_type`. */
export type DbImportTransactionType = 'purchase' | 'sale' | 'dividend'

export function mapNormalizedToDbType(
  t: NormalizedTransaction['transaction_type'],
): DbImportTransactionType | null {
  switch (t) {
    case 'buy':      return 'purchase'
    case 'sell':     return 'sale'
    case 'dividend': return 'dividend'
    default:         return null  // type CSV non reconnu côté DB → skip + log
  }
}

/** Ligne prête à être insérée dans la table `transactions`. */
export interface ImportTransactionRow {
  user_id:          string
  position_id:      string
  instrument_id:    string
  transaction_type: DbImportTransactionType
  amount:           number
  currency:         string
  fx_rate_to_ref:   number
  executed_at:      string  // ISO timestamp UTC (yyyy-mm-ddT00:00:00.000Z)
  quantity:         number
  unit_price:       number
  fees:             number
  label:            string
  data_source:      string
  external_ref:     string  // sha256 hex, cf. migration 033
  /**
   * Plus-value réalisée (R3 + R6). Renseignée par
   * `buildTransactionRowsForImport({ withRealizedPnl: true })` sur les
   * lignes `transaction_type='sale'` à partir du trail D4 de
   * `computeRunningCump`. Toujours `null` pour les achats et les
   * dividendes (contrainte SQL chk_realized_pnl_sale_only, migration 039).
   */
  realized_pnl:     number | null
}

export interface ImportRowBuildContext {
  userId:       string
  positionId:   string
  instrumentId: string
}

/**
 * Construit la ligne DB pour une NormalizedTransaction. Retourne null
 * si le type CSV ne se mappe sur aucun type DB connu — l'appelant
 * doit alors la skipper et la logger.
 *
 * `external_ref` = sha256 hex de
 *   userId | instrumentId | executed_at | qty | price | dbType
 *
 * (cf. migration 033 — index unique partiel `(user_id, external_ref)
 *  WHERE external_ref IS NOT NULL`). Garantit l'idempotence des
 *  ré-imports d'un même CSV (ou de CSV qui se recoupent).
 */
export function buildImportTransactionRow(
  t:   NormalizedTransaction,
  ctx: ImportRowBuildContext,
): ImportTransactionRow | null {
  const dbType = mapNormalizedToDbType(t.transaction_type)
  if (!dbType) return null

  const executedAt = `${t.date}T00:00:00.000Z`

  // Conventions amounts (cf. lib/portfolio/cash-flows.ts) :
  //   purchase (sortie de cash) → amount NÉGATIF
  //   sale     (entrée de cash) → amount POSITIF
  //   dividend (entrée de cash) → amount POSITIF
  //
  // R3 — pour les dividendes, on accepte un `t.amount` direct fourni
  // par le parser quand le CSV ne décompose pas en quantity × price.
  // À défaut on retombe sur quantity × unit_price (rétrocompatible avec
  // les lignes dividend déjà persistées avant R3).
  let amount: number
  switch (dbType) {
    case 'purchase': amount = -(t.quantity * t.unit_price + t.fees); break
    case 'sale':     amount =  (t.quantity * t.unit_price - t.fees); break
    case 'dividend': amount =  (t.amount ?? t.quantity * t.unit_price); break
  }

  // Hash déterministe. toFixed force un format stable pour qu'un même
  // (qty, price) donne toujours le même hash quel que soit l'arrondi flottant.
  // R3 — pour les dividendes on intègre explicitement `amount` dans le
  // hash (en plus de quantity/price = 1/amount par convention) pour qu'un
  // même montant donne toujours le même external_ref, même si le parser
  // évolue dans sa façon de remplir quantity/unit_price.
  const payload = [
    ctx.userId, ctx.instrumentId, executedAt,
    t.quantity.toFixed(8), t.unit_price.toFixed(6), dbType,
    ...(dbType === 'dividend' ? [amount.toFixed(6)] : []),
  ].join('|')
  const externalRef = createHash('sha256').update(payload).digest('hex')

  const verb = dbType === 'purchase' ? 'Achat' : dbType === 'sale' ? 'Vente' : 'Dividende'
  const label = `${verb} ${t.quantity} × ${t.name} (import ${t.broker})`.trim()

  return {
    user_id:          ctx.userId,
    position_id:      ctx.positionId,
    instrument_id:    ctx.instrumentId,
    transaction_type: dbType,
    amount,
    currency:         t.currency,
    fx_rate_to_ref:   1,
    executed_at:      executedAt,
    quantity:         t.quantity,
    unit_price:       t.unit_price,
    fees:             t.fees,
    label,
    data_source:      'manual',
    external_ref:     externalRef,
    realized_pnl:     null,
  }
}

export interface BuildRowsOptions {
  /**
   * Si `true`, exécute `computeRunningCump` sur le batch et reporte la
   * plus-value réalisée sur chaque ligne `'sale'` produite. Le tri
   * chronologique est interne à `computeRunningCump` ; la fonction
   * conserve l'ordre d'entrée dans `rows`.
   * Défaut : `false` (rétrocompatibilité avec les appelants existants).
   */
  withRealizedPnl?: boolean
}

/**
 * Helper batch : sépare les lignes valides des transactions skippées.
 *
 * Si `options.withRealizedPnl` est vrai, calcule en plus la PV réalisée
 * pour chaque vente via le trail CUMP (D4) et la propage sur
 * `row.realized_pnl`. Sans cette option, `realized_pnl` reste `null`.
 */
export function buildTransactionRowsForImport(
  txs: NormalizedTransaction[],
  ctx: ImportRowBuildContext,
  options: BuildRowsOptions = {},
): { rows: ImportTransactionRow[]; skipped: NormalizedTransaction[] } {
  // R3 — pré-calcul du trail CUMP : on en extrait une map
  // `tx référence → realizedPnl` pour ne pas avoir à apparier par date
  // (deux transactions same-day deviendraient ambiguës par date seule).
  // `computeRunningCump` trie en interne, on aligne sur le même tri ici.
  let pnlByTxRef: Map<NormalizedTransaction, number> | null = null
  if (options.withRealizedPnl) {
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const { trail } = computeRunningCump(sorted)
    pnlByTxRef = new Map()
    for (let i = 0; i < sorted.length; i++) {
      const t    = sorted[i]!
      const snap = trail[i]!
      if (t.transaction_type === 'sell' && snap.realizedPnl !== null) {
        pnlByTxRef.set(t, snap.realizedPnl)
      }
    }
  }

  const rows: ImportTransactionRow[] = []
  const skipped: NormalizedTransaction[] = []
  for (const t of txs) {
    const row = buildImportTransactionRow(t, ctx)
    if (!row) { skipped.push(t); continue }
    if (pnlByTxRef && row.transaction_type === 'sale') {
      const pnl = pnlByTxRef.get(t)
      if (pnl !== undefined) row.realized_pnl = pnl
    }
    rows.push(row)
  }
  return { rows, skipped }
}
