import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { getQuote, getHistory } from '@/lib/providers/market-data'
import { buildOrchestrator } from '@/lib/portfolio/providers'
import { createServerClient } from '@/lib/supabase/server'
import type { AssetClass } from '@/types/database.types'

type Ctx = { params: Promise<{ ticker: string }> }

// GET /api/prices/[ticker]
// ?mode=quote                → prix actuel (défaut)
// ?isin=...                  → fallback de résolution si le ticker ne suffit pas
// ?class=equity|etf|...      → asset_class pour aiguiller vers le bon provider
//                               (Boursorama pour ETF français, Yahoo pour US, etc.)
// ?mode=history&from&to      → historique OHLCV (Yahoo only pour l'instant)
export const GET = withAuth(async (req: Request, _user: User, ctx: Ctx) => {
  const { ticker } = await ctx!.params
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'quote'

  if (mode === 'history') {
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')

    if (!fromStr || !toStr) return err('from and to query params are required for history mode')

    const from = new Date(fromStr)
    const to = new Date(toStr)

    if (isNaN(from.getTime()) || isNaN(to.getTime())) return err('Invalid date format')
    if (from >= to) return err('from must be before to')

    const history = await getHistory(ticker.toUpperCase(), from, to)
    return ok(history)
  }

  // Mode quote
  const isin       = searchParams.get('isin')?.trim().toUpperCase() || undefined
  const assetClass = (searchParams.get('class') as AssetClass | null) ?? 'etf'
  const name       = searchParams.get('name')?.trim() || undefined

  // 1. Tente la chaîne complète de providers (Boursorama → Yahoo → CoinGecko…)
  //    via l'orchestrateur configuré en DB. Couvre les ETF français, SCPI,
  //    crypto, etc. Le `name` est utilisé en fallback de recherche textuelle
  //    par Boursorama (indispensable pour les SCPI sans ISIN ISO).
  try {
    const supabase     = await createServerClient()
    const orchestrator = await buildOrchestrator(supabase)
    const quote        = await orchestrator.getQuote({
      ticker:     ticker.toUpperCase(),
      isin:       isin ?? null,
      providerId: null,
      assetClass,
      name:       name ?? null,
    })
    if (quote) {
      return ok({
        ticker:     quote.query,
        price:      quote.price,
        currency:   quote.currency,
        change24h:  null,
        marketCap:  null,
        source:     quote.source,
        fetchedAt:  quote.pricedAt,
        confidence: quote.confidence,
      })
    }
  } catch (e) {
    console.warn('[prices] orchestrator failed, falling back to legacy:', e)
  }

  // 2. Fallback : ancien chemin Yahoo direct (avec cache mémoire/DB)
  const quote = await getQuote(ticker.toUpperCase(), isin)
  if (!quote) {
    return err(`No price available for ${ticker}`, 404)
  }
  return ok(quote)
})
