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

    const linkMatch   = html.match(/href="([^"]*\/cours\/[^/"?#]+\/?)"/)?.[1] ?? null

    // Tentatives multiples de pattern pour le prix
    const patterns: Record<string, string | null> = {
      data_ist_last:        html.match(/data-ist-last="([0-9.,]+)"/)?.[1] ?? null,
      c_instrument_last:    html.match(/class="[^"]*c-instrument--last[^"]*"[^>]*>\s*([0-9][0-9 ]*[.,][0-9]+)/)?.[1] ?? null,
      c_faceplate_price:    html.match(/class="[^"]*c-faceplate__price[^"]*"[^>]*>\s*([0-9][0-9 ]*[.,][0-9]+)/)?.[1] ?? null,
      json_ld_price:        html.match(/"price"\s*:\s*"?([0-9.]+)"?/)?.[1] ?? null,
      og_price_amount:      html.match(/<meta[^>]*property="og:price:amount"[^>]*content="([0-9.]+)"/)?.[1] ?? null,
      itemprop_price:       html.match(/itemprop="price"[^>]*content="([0-9.]+)"/)?.[1] ?? null,
      data_price:           html.match(/data-price="([0-9.,]+)"/)?.[1] ?? null,
      // Cherche un nombre format prix juste après une mention "EUR" ou avant
      eur_followed:         html.match(/([0-9][0-9 ]{0,3}[.,][0-9]{2,4})\s*<\/?\w*[^>]*>\s*EUR/)?.[1] ?? null,
    }

    // Détection blocage anti-bot fréquent
    const looksBlocked = html.includes('Cloudflare') ||
                         html.includes('captcha') ||
                         html.includes('Access denied') ||
                         status === 403

    // Trouve toutes les occurrences "c-instrument" pour voir la structure
    const cInstrumentSnippets: string[] = []
    let searchIdx = 0
    while (cInstrumentSnippets.length < 3) {
      const idx = html.indexOf('c-instrument', searchIdx)
      if (idx === -1) break
      cInstrumentSnippets.push(html.slice(Math.max(0, idx - 50), idx + 250))
      searchIdx = idx + 12
    }

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
        firstCoursLink: linkMatch,
        looksBlocked,
        patterns,
      },
      cInstrumentSnippets,
    })
  } catch (e) {
    return err(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`, 500)
  }
})
