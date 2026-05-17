/**
 * API publique des tools ARIA. Expose :
 *   - ARIA_TOOLS : le tableau de schemas passe a Claude
 *   - executeTool : dispatcher qui route un tool_use vers l'executor
 *
 * Tous les executors recoivent un `ToolExecutionContext` qui contient
 * le `PatrimoineComplet` deja calcule (evite de re-fetcher) ainsi que
 * le client supabase + userId pour les tools qui touchent la DB.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PatrimoineComplet } from '@/types/analyse'
import { ARIA_TOOL_DEFINITIONS, type AriaToolDefinition } from './definitions'
import { executeSimulerNouveauDCA } from './executors/simulerNouveauDCA'
import { executeSimulerStressTest } from './executors/simulerStressTest'
import { executeSimulerAcquisitionFuture } from './executors/simulerAcquisitionFuture'
import { executeChercherPosition } from './executors/chercherPosition'
import { executeObtenirDetailBien } from './executors/obtenirDetailBien'
import { executeObtenirHistoriquePatrimoine } from './executors/obtenirHistoriquePatrimoine'

export const ARIA_TOOLS: ReadonlyArray<AriaToolDefinition> = ARIA_TOOL_DEFINITIONS

export interface ToolExecutionContext {
  supabase:    SupabaseClient
  userId:      string
  patrimoine:  PatrimoineComplet
}

export interface ToolResult {
  /** True si l'execution s'est passee sans throw. */
  success: boolean
  /** Resultat JSON (success=true) ou message d'erreur (success=false). */
  data:    unknown
}

/**
 * Dispatche un tool_use vers son executor. Capture les exceptions pour
 * eviter qu'une erreur d'executor ne casse la boucle Claude (on
 * renvoie alors une erreur structuree dans tool_result).
 */
export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const args = (input ?? {}) as Record<string, unknown>
    switch (name) {
      case 'simulerNouveauDCA':
        return {
          success: true,
          data: await executeSimulerNouveauDCA(ctx.patrimoine, args as unknown as Parameters<typeof executeSimulerNouveauDCA>[1]),
        }
      case 'simulerStressTest':
        return {
          success: true,
          data: await executeSimulerStressTest(ctx.patrimoine, args as unknown as Parameters<typeof executeSimulerStressTest>[1]),
        }
      case 'simulerAcquisitionFuture':
        return {
          success: true,
          data: await executeSimulerAcquisitionFuture(ctx.patrimoine, args as unknown as Parameters<typeof executeSimulerAcquisitionFuture>[1]),
        }
      case 'chercherPosition':
        return {
          success: true,
          data: await executeChercherPosition(ctx.patrimoine, args as unknown as Parameters<typeof executeChercherPosition>[1]),
        }
      case 'obtenirDetailBien':
        return {
          success: true,
          data: await executeObtenirDetailBien(ctx.patrimoine, args as unknown as Parameters<typeof executeObtenirDetailBien>[1]),
        }
      case 'obtenirHistoriquePatrimoine':
        return {
          success: true,
          data: await executeObtenirHistoriquePatrimoine(
            ctx.supabase, ctx.userId,
            args as unknown as Parameters<typeof executeObtenirHistoriquePatrimoine>[2],
          ),
        }
      default:
        return { success: false, data: { error: `Tool inconnu: ${name}` } }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: { error: msg } }
  }
}

// Re-exports pratiques
export type { AriaToolDefinition } from './definitions'
