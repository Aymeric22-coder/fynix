import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { getQuote, getHistory } from '@/lib/providers/market-data'

type Ctx = { params: Promise<{ ticker: string }> }

// GET /api/prices/[ticker]
// ?mode=quote  → prix actuel (défaut)
// ?mode=history&from=2024-01-01&to=2024-12-31 → historique OHLCV
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

  // Mode quote (défaut)
  const quote = await getQuote(ticker.toUpperCase())

  if (!quote) {
    return err(`No price available for ${ticker}`, 404)
  }

  return ok(quote)
})
