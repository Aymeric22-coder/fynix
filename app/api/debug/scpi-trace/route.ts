/**
 * GET /api/debug/scpi-trace?name=Iroko+Zen&isin=...&class=scpi
 *
 * Trace step-by-step ce que fait BoursoramaProvider quand on lui passe
 * une SCPI. Pour chaque query (providerId, ISIN, ticker, name), montre :
 *   - URL appelée
 *   - URL finale après redirection
 *   - status HTTP
 *   - longueur HTML
 *   - symbol extrait
 *   - prix parsé
 *   - HTML snippet autour de "Prix de souscription"
 */

import { ok, err, withAuth } from '@/lib/utils/api'
import { parseBoursoramaHtml } from '@/lib/portfolio/providers/boursorama'
import type { User } from '@supabase/supabase-js'

const BASE       = 'https://www.boursorama.com'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface QueryTrace {
  query:        string
  requestUrl:   string
  status:       number | null
  finalUrl:     string | null
  htmlLength:   number | null
  symbol:       string | null
  parsedPrice:  number | null
  parsedCurrency: string | null
  scpiSnippet:  string | null
  blocked:      boolean
  error:        string | null
}

async function traceQuery(query: string): Promise<QueryTrace> {
  const trace: QueryTrace = {
    query,
    requestUrl:     `${BASE}/recherche/?query=${encodeURIComponent(query)}`,
    status:         null,
    finalUrl:       null,
    htmlLength:     null,
    symbol:         null,
    parsedPrice:    null,
    parsedCurrency: null,
    scpiSnippet:    null,
    blocked:        false,
    error:          null,
  }

  try {
    const res = await fetch(trace.requestUrl, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    })
    trace.status   = res.status
    trace.finalUrl = res.url

    if (!res.ok) {
      trace.error = `HTTP ${res.status}`
      return trace
    }

    const html = await res.text()
    trace.htmlLength = html.length
    trace.blocked = html.includes('Cloudflare') || html.includes('captcha') || res.status === 403

    const symMatch = res.url.match(/\/cours\/([^/?#]+)\/?/)
    trace.symbol = symMatch?.[1] ?? null

    const parsed = parseBoursoramaHtml(html)
    trace.parsedPrice    = parsed?.price ?? null
    trace.parsedCurrency = parsed?.currency ?? null

    // Snippet autour de "Prix de souscription" si présent
    const idx = html.search(/Prix de souscription/i)
    if (idx >= 0) {
      trace.scpiSnippet = html.slice(Math.max(0, idx - 30), idx + 300)
    }
  } catch (e) {
    trace.error = e instanceof Error ? e.message : String(e)
  }

  return trace
}

export const GET = withAuth(async (req: Request, _user: User) => {
  const { searchParams } = new URL(req.url)
  const name   = searchParams.get('name')?.trim()   || null
  const isin   = searchParams.get('isin')?.trim()   || null
  const ticker = searchParams.get('ticker')?.trim() || null

  const queries: string[] = []
  if (isin)   queries.push(isin)
  if (ticker) queries.push(ticker)
  if (name)   queries.push(name)

  if (queries.length === 0) return err('?name=, ?isin= or ?ticker= required')

  const traces: QueryTrace[] = []
  for (const q of queries) {
    traces.push(await traceQuery(q))
  }

  return ok({
    inputs: { name, isin, ticker },
    traces,
  })
})
