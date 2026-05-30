/**
 * Edge Function : backfill-benchmarks (BNCH)
 *
 * Backfille l'historique de prix journaliers des benchmarks (instruments
 * `is_benchmark = true`) en tapant directement Yahoo Finance v8 chart API
 * depuis le runtime Deno Supabase. Pourquoi ici et pas dans la route Next.js :
 * Yahoo rate-limite (HTTP 429 "Too Many Requests") la plage IP Vercel iad1
 * sur tous les endpoints historiques (v7 download + v8 chart). Les IPs
 * Supabase Edge ne sont pas dans ce blocage. Pattern symetrique de
 * `monthly-report` mais en sens inverse : ici toute la logique vit dans
 * l'Edge Function, et la route Vercel n'est qu'un proxy de declenchement.
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}` (meme secret partage
 * que monthly-report + la route Vercel /api/cron/backfill-benchmarks).
 * Fail-closed si CRON_SECRET absent.
 *
 * Fenetre : du plus ancien `portfolio_snapshots` global (envelope_id IS NULL)
 * jusqu'a aujourd'hui. Defaut : 2 ans en arriere si aucun snapshot.
 *
 * Idempotent : index unique (instrument_id, priced_at, source) + upsert
 * ignoreDuplicates → re-runs sans doublon.
 *
 * Configuration (Supabase Dashboard → Edge Functions → Secrets) :
 *   SUPABASE_URL              (preset par Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY (preset par Supabase)
 *   CRON_SECRET               (meme valeur que cote Vercel)
 *
 * Deploy :
 *   supabase functions deploy backfill-benchmarks --no-verify-jwt
 *
 * Le flag --no-verify-jwt est volontaire : on gere l'auth nous-memes via
 * Authorization Bearer CRON_SECRET, pas via le JWT Supabase de l'appelant.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — module Deno resolu uniquement a l'execution dans l'Edge Function
import { createClient } from 'jsr:@supabase/supabase-js@2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET  = Deno.env.get('CRON_SECRET') ?? ''

// User-Agent browser-like : Yahoo bloque le UA Deno/undici par defaut, meme
// hors plage Vercel. Avec un UA Chrome desktop, /v8/finance/chart/ repond
// en JSON propre.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000

interface Benchmark {
  id:       string
  name:     string
  ticker:   string | null
  currency: string
}

interface PriceRow {
  instrument_id: string
  price:         number
  currency:      string
  priced_at:     string
  source:        string
  confidence:    string
}

/**
 * Fetch l'historique journalier d'un ticker via Yahoo v8 chart API.
 * Format retour : tableau de { date, close }, filtre des points invalides
 * (close null ou <= 0).
 */
async function fetchYahooHistory(
  ticker: string, fromSec: number, toSec: number,
): Promise<Array<{ date: Date; close: number }>> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${fromSec}&period2=${toSec}&interval=1d`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const j = await res.json() as {
    chart?: {
      result?: Array<{
        timestamp?: number[]
        indicators?: { quote?: Array<{ close?: Array<number | null> }> }
      }>
      error?: unknown
    }
  }
  const result = j?.chart?.result?.[0]
  if (!result) throw new Error('Yahoo: no chart.result[0]')
  const timestamps = result.timestamp
  const closes     = result.indicators?.quote?.[0]?.close
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) return []
  const out: Array<{ date: Date; close: number }> = []
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i]
    const c  = closes[i]
    if (typeof ts === 'number' && typeof c === 'number' && c > 0) {
      out.push({ date: new Date(ts * 1000), close: c })
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Deno.serve(async (req: any) => {
  // Auth
  if (!CRON_SECRET) {
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing Supabase credentials' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Fenetre : plus ancien snapshot global, sinon 2 ans
  const { data: oldest } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date')
    .is('envelope_id', null)
    .order('snapshot_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const now = new Date()
  const fromDate = oldest?.snapshot_date
    ? new Date(`${oldest.snapshot_date}T00:00:00.000Z`)
    : new Date(now.getTime() - TWO_YEARS_MS)
  const fromSec = Math.floor(fromDate.getTime() / 1000)
  const nowSec  = Math.floor(now.getTime() / 1000)

  // Load benchmarks
  const { data: benchmarks, error: bErr } = await supabase
    .from('instruments')
    .select('id, name, ticker, currency')
    .eq('is_benchmark', true)
  if (bErr) {
    return new Response(
      JSON.stringify({ error: `Load benchmarks: ${bErr.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const rows = (benchmarks ?? []) as Benchmark[]

  let inserted = 0, errors = 0
  const perBenchmark: Array<{ id: string; name: string; points: number; error?: string }> = []

  for (const b of rows) {
    if (!b.ticker) {
      perBenchmark.push({ id: b.id, name: b.name, points: 0 })
      continue
    }
    try {
      const history = await fetchYahooHistory(b.ticker, fromSec, nowSec)
      if (history.length === 0) {
        perBenchmark.push({ id: b.id, name: b.name, points: 0 })
        continue
      }
      const inserts: PriceRow[] = history.map((h) => ({
        instrument_id: b.id,
        price:         h.close,
        currency:      b.currency,
        // Histo daily → priced_at canonique 00:00:00Z (evite les conflits
        // d'index avec d'eventuels prix forward sur la meme journee).
        priced_at:     `${h.date.toISOString().slice(0, 10)}T00:00:00.000Z`,
        source:        'yahoo',
        confidence:    'high',
      }))
      const { error: upErr } = await supabase
        .from('instrument_prices')
        .upsert(inserts, { onConflict: 'instrument_id,priced_at,source', ignoreDuplicates: true })
      if (upErr) throw new Error(`upsert: ${upErr.message}`)
      inserted += inserts.length
      perBenchmark.push({ id: b.id, name: b.name, points: inserts.length })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[backfill-benchmarks] failed for ${b.id} (${b.name}):`, msg)
      errors++
      perBenchmark.push({ id: b.id, name: b.name, points: 0, error: msg })
    }
  }

  return new Response(
    JSON.stringify({
      windowStart: fromDate.toISOString().slice(0, 10),
      windowEnd:   now.toISOString().slice(0, 10),
      inserted, errors, perBenchmark,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
