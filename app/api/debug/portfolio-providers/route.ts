/**
 * GET /api/debug/portfolio-providers?isin=...&class=etf
 *
 * Diagnostic complet de la chaîne de providers :
 *   1. Liste les providers configurés en DB
 *   2. Appelle BoursoramaProvider DIRECTEMENT (sans orchestrateur)
 *   3. Appelle l'orchestrateur tel qu'il est utilisé en prod
 *   4. Renvoie ce que chaque étape produit
 */

import { ok, err, withAuth } from '@/lib/utils/api'
import { createServerClient } from '@/lib/supabase/server'
import { BoursoramaProvider, buildOrchestrator } from '@/lib/portfolio/providers'
import type { User } from '@supabase/supabase-js'
import type { AssetClass } from '@/types/database.types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withAuth(async (req: Request, _user: User) => {
  const { searchParams } = new URL(req.url)
  const isin       = searchParams.get('isin')?.trim().toUpperCase()
  const ticker     = searchParams.get('ticker')?.trim().toUpperCase() ?? null
  const assetClass = (searchParams.get('class') as AssetClass) ?? 'etf'
  if (!isin && !ticker) return err('?isin=... ou ?ticker=... requis')

  const supabase = await createServerClient()

  // ── 1. Config DB ────────────────────────────────────────────────────
  const { data: configRows, error: configErr } = await supabase
    .from('price_providers')
    .select('code, is_active, priority, supported_classes, api_key_env')

  // ── 2. BoursoramaProvider direct ────────────────────────────────────
  let directResult: unknown = null
  let directError: string | null = null
  try {
    const provider = new BoursoramaProvider()
    const lookup = {
      ticker:     ticker,
      isin:       isin ?? null,
      providerId: null,
      assetClass,
    }
    directResult = await provider.fetchQuote(lookup)
  } catch (e) {
    directError = e instanceof Error ? e.message : String(e)
  }

  // ── 3. Orchestrator (chaîne complète) ───────────────────────────────
  let orchestratorResult: unknown = null
  let orchestratorError: string | null = null
  let chainCodes: string[] = []
  try {
    const orchestrator = await buildOrchestrator(supabase)
    chainCodes = orchestrator.buildChain(assetClass).map((p) => p.code)
    orchestratorResult = await orchestrator.getQuote({
      ticker:     ticker,
      isin:       isin ?? null,
      providerId: null,
      assetClass,
    })
  } catch (e) {
    orchestratorError = e instanceof Error ? e.message : String(e)
  }

  return ok({
    input: { isin, ticker, assetClass },
    db: {
      providers: configRows ?? [],
      error:     configErr?.message ?? null,
    },
    direct: {
      result: directResult,
      error:  directError,
    },
    orchestrator: {
      chainForClass: chainCodes,
      result:        orchestratorResult,
      error:         orchestratorError,
    },
  })
})
