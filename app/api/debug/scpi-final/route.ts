/**
 * GET /api/debug/scpi-final?name=...&isin=...&class=scpi
 *
 * Test direct du BoursoramaProvider avec les mêmes inputs que le formulaire.
 * Auth-free pour debug.
 */

import { ok, err } from '@/lib/utils/api'
import { BoursoramaProvider } from '@/lib/portfolio/providers/boursorama'
import type { AssetClass } from '@/types/database.types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const name   = searchParams.get('name')?.trim()   || null
  const isin   = searchParams.get('isin')?.trim()   || null
  const ticker = searchParams.get('ticker')?.trim() || null
  const assetClass = (searchParams.get('class') as AssetClass | null) ?? 'scpi'

  const provider = new BoursoramaProvider()
  const lookup = {
    ticker,
    isin,
    providerId: null,
    assetClass,
    name,
  }

  let result: unknown = null
  let error: string | null = null
  try {
    result = await provider.fetchQuote(lookup)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  if (!result && !error) return err('Provider returned null')
  return ok({ lookup, result, error })
}
