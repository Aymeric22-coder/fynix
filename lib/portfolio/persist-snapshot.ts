/**
 * Persistance d'un snapshot portefeuille en DB.
 *
 * UPSERT sur (user_id, snapshot_date) : 1 snapshot par jour, le dernier
 * appel de la journée écrase le précédent.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPortfolioFromDb } from './build-from-db'
import { computeSnapshot, type PortfolioSnapshot } from './snapshots'

export type SnapshotSource = 'cron' | 'manual' | 'refresh'

export interface PersistSnapshotResult {
  snapshot: PortfolioSnapshot
  inserted: boolean
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

  const snapshot = computeSnapshot(result)

  const { error } = await supabase
    .from('portfolio_snapshots')
    .upsert({
      user_id:                userId,
      snapshot_date:          snapshot.snapshotDate,
      snapshot_at:            new Date().toISOString(),
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
    }, { onConflict: 'user_id,snapshot_date' })

  if (error) {
    console.error('[snapshot] persist failed:', error.message)
    return null
  }

  return { snapshot, inserted: true }
}
