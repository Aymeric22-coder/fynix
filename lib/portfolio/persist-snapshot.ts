/**
 * Persistance d'un snapshot portefeuille en DB.
 *
 * - Snapshot global (envelope_id = NULL) : 1 ligne par utilisateur par jour,
 *   comportement historique inchangé.
 * - Snapshots par enveloppe (envelope_id non-NULL, depuis migration 044) :
 *   1 ligne par utilisateur par jour par enveloppe distincte ayant au
 *   moins une position active. Permet le calcul TWR / MWR par enveloppe.
 *
 * Idempotence : contrainte UNIQUE NULLS NOT DISTINCT sur
 * (user_id, snapshot_date, envelope_id) → ON CONFLICT UPSERT écrase la
 * ligne existante du jour (dernier appel l'emporte).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPortfolioFromDb } from './build-from-db'
import { computeSnapshot, type PortfolioSnapshot } from './snapshots'
import type { PositionValuation } from './types'

export type SnapshotSource = 'cron' | 'manual' | 'refresh'

export interface PersistSnapshotResult {
  snapshot:           PortfolioSnapshot
  inserted:           boolean
  /** Nombre de snapshots par enveloppe persistés en complément du snapshot global (R6 / E12). */
  envelopeSnapshots:  number
}

/**
 * Calcule et persiste un snapshot pour l'utilisateur courant.
 *
 * Si le portfolio est vide (0 positions), on ne crée pas de snapshot
 * pour éviter de polluer la timeline avec des zéros.
 */
export async function persistPortfolioSnapshot(
  supabase: SupabaseClient,
  userId:   string,
  source:   SnapshotSource = 'manual',
): Promise<PersistSnapshotResult | null> {
  const result = await buildPortfolioFromDb(supabase, userId)
  if (result.summary.positionsCount === 0) return null

  const snapshot   = computeSnapshot(result)
  const snapshotAt = new Date().toISOString()

  // 1. Snapshot global (envelope_id = NULL) — comportement historique.
  const { error } = await supabase
    .from('portfolio_snapshots')
    .upsert({
      user_id:                userId,
      envelope_id:            null,
      snapshot_date:          snapshot.snapshotDate,
      snapshot_at:            snapshotAt,
      total_market_value:     snapshot.totalMarketValue,
      total_cost_basis:       snapshot.totalCostBasis,
      total_pnl:              snapshot.totalPnL,
      total_pnl_pct:          snapshot.totalPnLPct,
      positions_count:        snapshot.positionsCount,
      valued_count:           snapshot.valuedCount,
      allocation_by_class:    snapshot.allocationByClass,
      allocation_by_envelope: snapshot.allocationByEnvelope,
      reference_currency:     snapshot.referenceCurrency,
      source,
    }, { onConflict: 'user_id,snapshot_date,envelope_id' })

  if (error) {
    console.error('[snapshot] persist failed:', error.message)
    return null
  }

  // 2. Snapshots par enveloppe (migration 044). On agrège les positions
  //    actives ayant un envelopeId non-null. Les positions sans enveloppe
  //    ne génèrent pas de sub-snapshot (elles sont déjà capturées dans
  //    le snapshot global).
  const envelopeRows = buildEnvelopeSnapshotRows(result.positions, {
    userId,
    snapshotDate:      snapshot.snapshotDate,
    snapshotAt,
    referenceCurrency: snapshot.referenceCurrency,
    source,
  })

  let envelopeSnapshots = 0
  if (envelopeRows.length > 0) {
    const { error: envErr } = await supabase
      .from('portfolio_snapshots')
      .upsert(envelopeRows, { onConflict: 'user_id,snapshot_date,envelope_id' })
    if (envErr) {
      // On ne fait pas échouer le résultat global — le snapshot principal
      // a déjà été persisté avec succès. On log et on continue.
      console.warn('[snapshot] envelope snapshots persist failed:', envErr.message)
    } else {
      envelopeSnapshots = envelopeRows.length
    }
  }

  return { snapshot, inserted: true, envelopeSnapshots }
}

// ─── Helpers ───────────────────────────────────────────────────────────

interface EnvelopeRowContext {
  userId:            string
  snapshotDate:      string
  snapshotAt:        string
  referenceCurrency: string
  source:            SnapshotSource
}

/**
 * Construit une ligne snapshot par enveloppe distincte parmi les positions
 * actives. Agrège valeurs / costBasis / PnL en devise ref (champs
 * `*Ref` exposés par valuation.ts).
 *
 * Export pour tests unitaires — pas un point d'entrée API.
 */
export function buildEnvelopeSnapshotRows(
  positions: PositionValuation[],
  ctx:       EnvelopeRowContext,
): Array<Record<string, unknown>> {
  const byEnvelope = new Map<string, PositionValuation[]>()
  for (const p of positions) {
    if (p.status !== 'active') continue
    if (p.envelopeId === null)  continue
    const arr = byEnvelope.get(p.envelopeId) ?? []
    arr.push(p)
    byEnvelope.set(p.envelopeId, arr)
  }

  const rows: Array<Record<string, unknown>> = []
  for (const [envelopeId, posList] of byEnvelope) {
    let totalCostBasis        = 0
    let totalCostBasisValued  = 0
    let totalMarketValue      = 0
    let valuedCount           = 0
    const allocByClass: Record<string, number> = {}

    for (const p of posList) {
      totalCostBasis += p.costBasisRef
      if (p.marketValueRef !== null) {
        totalMarketValue       += p.marketValueRef
        totalCostBasisValued   += p.costBasisRef
        valuedCount++
        allocByClass[p.assetClass] = (allocByClass[p.assetClass] ?? 0) + p.marketValueRef
      } else {
        // Fallback cost_basis pour la valeur effective de l'allocation
        // (cohérent avec valuation.ts:200). Le PnL reste strictement
        // calculé sur les positions valorisées.
        totalMarketValue           += p.costBasisRef
        allocByClass[p.assetClass]  = (allocByClass[p.assetClass] ?? 0) + p.costBasisRef
      }
    }

    const totalPnL    = valuedCount > 0 ? totalMarketValue - totalCostBasisValued : 0
    const totalPnLPct =
      valuedCount > 0 && totalCostBasisValued > 0
        ? (totalPnL / totalCostBasisValued) * 100
        : null

    // Arrondi cohérent avec computeSnapshot (round2 / round4)
    const round2 = (n: number) => Math.round(n * 100) / 100
    const round4 = (n: number) => Math.round(n * 10000) / 10000
    const roundedAllocByClass: Record<string, number> = {}
    for (const [k, v] of Object.entries(allocByClass)) {
      roundedAllocByClass[k] = round2(v)
    }

    rows.push({
      user_id:                ctx.userId,
      envelope_id:            envelopeId,
      snapshot_date:          ctx.snapshotDate,
      snapshot_at:            ctx.snapshotAt,
      total_market_value:     round2(totalMarketValue),
      total_cost_basis:       round2(totalCostBasis),
      total_pnl:              round2(totalPnL),
      total_pnl_pct:          totalPnLPct !== null ? round4(totalPnLPct) : null,
      positions_count:        posList.length,
      valued_count:           valuedCount,
      allocation_by_class:    roundedAllocByClass,
      // Pour les sub-snapshots, allocation_by_envelope est trivial :
      // 100 % sur cette enveloppe. On l'expose tout de même pour rester
      // structurellement identique à un snapshot global.
      allocation_by_envelope: { [envelopeId]: round2(totalMarketValue) },
      reference_currency:     ctx.referenceCurrency,
      source:                 ctx.source,
    })
  }
  return rows
}
