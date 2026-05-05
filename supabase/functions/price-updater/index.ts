/**
 * Edge Function : price-updater
 *
 * Déclenchée toutes les heures via Supabase Cron.
 * Rafraîchit les prix des actifs financiers (actions, ETF, crypto)
 * pour tous les utilisateurs — en déduplicant les tickers.
 *
 * Planification :
 *   cron: "0 * * * *"   → toutes les heures
 *   cron: "0 8-18 * * 1-5" → toutes les heures en semaine 8h-18h (optimisé marchés)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const PRICE_TTL_MS = 15 * 60 * 1000  // 15 minutes

interface YahooQuote {
  regularMarketPrice?: number
  currency?: string
  regularMarketChangePercent?: number
  marketCap?: number
}

async function fetchYahooQuote(ticker: string): Promise<YahooQuote | null> {
  try {
    // Yahoo Finance v8 — endpoint public non officiel
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return null
    const json = await res.json() as {
      chart?: { result?: Array<{
        meta?: { regularMarketPrice?: number; currency?: string; regularMarketChangePercent?: number }
      }> }
    }

    const meta = json?.chart?.result?.[0]?.meta
    if (!meta || meta.regularMarketPrice === undefined) return null

    return {
      regularMarketPrice: meta.regularMarketPrice,
      currency: meta.currency,
      regularMarketChangePercent: meta.regularMarketChangePercent,
    }
  } catch {
    return null
  }
}

Deno.serve(async () => {
  const startedAt = Date.now()
  const updated: string[] = []
  const failed: string[] = []

  try {
    // 1. Récupérer tous les tickers distincts avec actifs actifs
    const { data: financialAssets, error } = await supabase
      .from('financial_assets')
      .select('ticker, asset_id')
      .not('ticker', 'is', null)

    if (error) throw error

    // Dédupliquer les tickers
    const tickerMap = new Map<string, string[]>()
    for (const fa of financialAssets ?? []) {
      if (!fa.ticker) continue
      const assetIds = tickerMap.get(fa.ticker) ?? []
      assetIds.push(fa.asset_id)
      tickerMap.set(fa.ticker, assetIds)
    }

    console.log(`[price-updater] ${tickerMap.size} unique tickers to update`)

    const expiresAt = new Date(Date.now() + PRICE_TTL_MS).toISOString()

    // 2. Mettre à jour chaque ticker (séquentiel pour respecter rate limits)
    for (const [ticker, assetIds] of tickerMap.entries()) {
      const quote = await fetchYahooQuote(ticker)

      if (!quote || quote.regularMarketPrice === undefined) {
        failed.push(ticker)
        continue
      }

      const price = quote.regularMarketPrice
      const now = new Date().toISOString()

      // Upsert dans market_price_cache
      await supabase.from('market_price_cache').upsert({
        ticker,
        price,
        currency: quote.currency ?? 'USD',
        change_24h: quote.regularMarketChangePercent ?? null,
        source: 'yahoo',
        fetched_at: now,
        expires_at: expiresAt,
      })

      // Mettre à jour financial_assets + assets (current_value)
      await supabase
        .from('financial_assets')
        .update({ current_price: price, current_price_at: now })
        .eq('ticker', ticker)

      // Pour chaque asset lié, recalculer current_value = quantity × price
      for (const assetId of assetIds) {
        const { data: fa } = await supabase
          .from('financial_assets')
          .select('quantity')
          .eq('asset_id', assetId)
          .single()

        if (fa) {
          await supabase
            .from('assets')
            .update({
              current_value: Math.round(fa.quantity * price * 100) / 100,
              last_valued_at: now,
              confidence: 'high',
              data_source: 'api',
            })
            .eq('id', assetId)
        }
      }

      updated.push(ticker)

      // Pause 200ms entre les appels pour limiter le rate limit Yahoo
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    const elapsed = Date.now() - startedAt
    console.log(`[price-updater] Done in ${elapsed}ms — updated=${updated.length} failed=${failed.length}`)

    return new Response(
      JSON.stringify({
        ok: true,
        updated: updated.length,
        failed: failed.length,
        failed_tickers: failed,
        elapsed_ms: elapsed,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[price-updater] Fatal error:', e)
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
