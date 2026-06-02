/**
 * Pipeline Dashboard unifié — point d'entrée public (V1.1).
 *
 * Composition :
 *   buildDashboardData(supabase, userId)
 *     ├─ loadDashboardInputs(supabase, userId)      [load.ts]
 *     └─ computeDashboardData(inputs)               [calc.ts]
 *
 * En V1.1, ce module n'est PAS encore branché sur `dashboard/page.tsx` :
 * le bloc inline reste autoritaire pour l'utilisateur. La page basculera
 * derrière le feature flag `DASHBOARD_UNIFIED_PIPELINE` en V1.4.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardInputs } from './load'
import { computeDashboardData } from './calc'
import type { DashboardData } from './types'

/**
 * Charge les inputs depuis Supabase puis applique les formules du Dashboard.
 *
 * Équivalent strict du bloc inline `dashboard/page.tsx:207-367` en V1.1
 * (bugs inclus). Voir `dashboard-pipeline/calc.ts` pour les détails.
 */
export async function buildDashboardData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId:   string,
): Promise<DashboardData> {
  const inputs = await loadDashboardInputs(supabase, userId)
  return computeDashboardData(inputs)
}

export { computeDashboardData } from './calc'
export { loadDashboardInputs }   from './load'
export type {
  DashboardData,
  DashboardPipelineInputs,
  DashboardKpis,
  DashboardAllocationSlice,
  // V2.3 — Top 5 consolidé par enveloppe / bien / compte (BUG-5 corrigé).
  TopAssetConsolidated,
  ConsolidatedEnvelopeType,
  DashboardTimelinePoint,
  DashboardAlert,
  DashboardRealEstateDriftSummary,
} from './types'
