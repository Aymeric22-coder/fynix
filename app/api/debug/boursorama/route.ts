/**
 * GET /api/debug/boursorama?q=<isin-ou-ticker>
 *
 * Endpoint debug : montre exactement ce que Boursorama renvoie
 * quand on l'interroge depuis Vercel. Permet de diagnostiquer
 * blocage WAF, redirection inattendue, ou DOM différent.
 *
 * À retirer une fois la diagnostic terminée.
 */

import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'

const BASE       = 'https://www.boursorama.com'
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = withAuth(async (req: Request, _user: User) => {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim().toUpperCase()
  if (!query) return err('?q=<isin-ou-ticker> requis')

  const url = `${BASE}/recherche/?query=${encodeURIComponent(query)}`

  try {
    const res     = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    })
    const finalUrl    = res.url
    const status      = res.status
    const contentType = res.headers.get('content-type')
    const html        = await res.text()

    // Extraction des infos clés
    const symMatch    = finalUrl.match(/\/cours\/([^/?#]+)\/?/)
    const symbol      = symMatch?.[1] ?? null

    const h1Match     = html.match(/<h1[^>]*>\s*([0-9][0-9 ]*[.,][0-9]+)\s*([A-Z]{3})\s*<\/h1>/)
    const h1Price     = h1Match?.[1] ?? null
    const h1Currency  = h1Match?.[2] ?? null

    const dataIstLast = html.match(/data-ist-last="([0-9.,]+)"/)?.[1] ?? null

    const linkMatch   = html.match(/href="([^"]*\/cours\/[^/"?#]+\/?)"/)?.[1] ?? null

    // Détection blocage anti-bot fréquent
    const looksBlocked = html.includes('Cloudflare') ||
                         html.includes('captcha') ||
                         html.includes('Access denied') ||
                         status === 403

    return ok({
      query,
      requestUrl: url,
      response: {
        status,
        finalUrl,
        contentType,
        htmlLength: html.length,
      },
      extraction: {
        symbol,
        h1Price,
        h1Currency,
        dataIstLast,
        firstCoursLink: linkMatch,
        looksBlocked,
      },
      htmlPreview: html.slice(0, 500),
      htmlAroundH1: html.includes('<h1') ? html.slice(Math.max(0, html.indexOf('<h1') - 100), html.indexOf('<h1') + 400) : null,
    })
  } catch (e) {
    return err(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`, 500)
  }
})
