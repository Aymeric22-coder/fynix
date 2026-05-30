/**
 * Route one-shot : backfill de l'historique de prix des benchmarks (BNCH).
 *
 * POST /api/cron/backfill-benchmarks
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (meme pattern que
 *        le cron refresh-prices). Fail-closed si CRON_SECRET absent.
 *
 * Cette route est un PROXY vers l'Edge Function Supabase du meme nom. La
 * raison : Yahoo Finance rate-limite (HTTP 429) toutes les requetes
 * historiques depuis la plage IP Vercel iad1. Les IPs Supabase Edge,
 * elles, recoivent du JSON propre — la logique reelle (fetch Yahoo +
 * upsert instrument_prices) vit donc dans
 * `supabase/functions/backfill-benchmarks/index.ts`. Cette route conserve
 * l'endpoint Vercel historique et le meme secret pour ne casser ni la
 * curl manuelle ni un eventuel cron Vercel.
 *
 * Idempotent : l'index unique (instrument_id, priced_at, source) cote DB
 * empeche les doublons. Re-runs surs.
 *
 * Reponse propagee telle quelle depuis l'Edge Function :
 *   { windowStart, windowEnd, inserted, errors, perBenchmark }
 *
 * Declenchement manuel :
 *   curl -X POST https://<app>/api/cron/backfill-benchmarks \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CRON_SECRET  = process.env.CRON_SECRET

export async function POST(req: Request) {
  if (!CRON_SECRET) {
    return new Response('Server misconfigured', { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!SUPABASE_URL) {
    return Response.json({ error: 'Missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 })
  }

  // Proxy vers l'Edge Function Supabase. Le secret est partage : meme
  // CRON_SECRET cote Vercel et cote Edge Function.
  const edgeUrl = `${SUPABASE_URL}/functions/v1/backfill-benchmarks`
  try {
    const res = await fetch(edgeUrl, {
      method:  'POST',
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    const body = await res.json().catch(() => ({ error: 'invalid JSON response from edge function' }))
    return Response.json(body, { status: res.status })
  } catch (e) {
    return Response.json(
      { error: `Edge function unreachable: ${(e as Error).message}` },
      { status: 502 },
    )
  }
}
