/**
 * Job cron Vercel : rafraîchit les prix de tous les instruments.
 *
 * Trigger : Vercel Cron (cf. vercel.json).
 * Auth    : header `authorization: Bearer ${CRON_SECRET}` requis en prod.
 *           Vercel injecte automatiquement ce header pour les routes /api/cron/*.
 *
 * Stratégie :
 *   1. Liste les instruments distincts pour lesquels au moins une `position`
 *      active existe (inutile de rafraîchir un instrument que personne ne détient).
 *   2. Pour chaque instrument, appelle l'orchestrateur de providers.
 *   3. Insère les prix obtenus dans `instrument_prices` (UNIQUE par triplet
 *      instrument_id + priced_at + source → on tronque la précision pour
 *      éviter de spammer la table).
 *
 * Utilise le service-role key pour bypasser la RLS (lecture/écriture
 * cross-utilisateur sur instruments / instrument_prices).
 */

import { createClient } from '@supabase/supabase-js'
import { buildOrchestrator } from '@/lib/portfolio/providers'
import { persistPortfolioSnapshot } from '@/lib/portfolio/persist-snapshot'
import type { AssetClass } from '@/types/database.types'
import type { InstrumentLookup } from '@/lib/portfolio/providers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

interface InstrumentRow {
  id:          string
  name:        string
  ticker:      string | null
  isin:        string | null
  provider_id: string | null
  asset_class: AssetClass
}

interface PriceInsertRow {
  instrument_id: string
  price:         number
  currency:      string
  priced_at:     string
  source:        string
  confidence:    string
}

export async function GET(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  if (!SERVICE_URL || !SERVICE_KEY) {
    return Response.json(
      { error: 'Missing Supabase service credentials' },
      { status: 500 },
    )
  }

  const supabase = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 1. Instruments à rafraîchir (ceux détenus dans au moins une position active) ──
  const { data: held, error: e1 } = await supabase
    .from('positions')
    .select('instrument_id')
    .eq('status', 'active')

  if (e1) {
    return Response.json({ error: e1.message }, { status: 500 })
  }

  const ids = Array.from(new Set((held ?? []).map((r) => r.instrument_id as string)))
  if (ids.length === 0) {
    return Response.json({ refreshed: 0, skipped: 0, errors: 0, message: 'no active positions' })
  }

  const { data: instruments, error: e2 } = await supabase
    .from('instruments')
    .select('id, name, ticker, isin, provider_id, asset_class')
    .in('id', ids)

  if (e2) {
    return Response.json({ error: e2.message }, { status: 500 })
  }

  // ── 2. Orchestrateur ────────────────────────────────────────────────────
  const orchestrator = await buildOrchestrator(supabase)

  // ── 3. Fetch + insert ───────────────────────────────────────────────────
  const inserts: PriceInsertRow[] = []
  let refreshed = 0
  let skipped = 0
  let errors = 0

  for (const inst of (instruments ?? []) as InstrumentRow[]) {
    const lookup: InstrumentLookup = {
      ticker:     inst.ticker,
      isin:       inst.isin,
      providerId: inst.provider_id,
      assetClass: inst.asset_class,
      name:       inst.name,
    }

    try {
      const quote = await orchestrator.getQuote(lookup)
      if (!quote) { skipped++; continue }

      // Tronque la timestamp à la minute pour éviter la collision de l'index UNIQUE
      const pricedAt = new Date(quote.pricedAt)
      pricedAt.setSeconds(0, 0)

      inserts.push({
        instrument_id: inst.id,
        price:         quote.price,
        currency:      quote.currency,
        priced_at:     pricedAt.toISOString(),
        source:        quote.source,
        confidence:    quote.confidence,
      })
      refreshed++
    } catch (e) {
      console.error(`[cron] refresh failed for ${inst.id}:`, e)
      errors++
    }
  }

  if (inserts.length > 0) {
    // upsert pour éviter les duplicatas si la même minute est re-jouée
    const { error: e3 } = await supabase
      .from('instrument_prices')
      .upsert(inserts, { onConflict: 'instrument_id,priced_at,source', ignoreDuplicates: true })

    if (e3) {
      return Response.json({ error: e3.message, refreshed: 0 }, { status: 500 })
    }
  }

  // ── 4. Snapshot quotidien pour chaque utilisateur qui detient des positions ──
  const { data: usersWithPos } = await supabase
    .from('positions')
    .select('user_id')
    .eq('status', 'active')

  const uniqueUserIds = Array.from(new Set((usersWithPos ?? []).map((r) => r.user_id as string)))
  let snapshotsCreated = 0
  for (const uid of uniqueUserIds) {
    try {
      const snap = await persistPortfolioSnapshot(supabase, uid, 'cron')
      if (snap) snapshotsCreated++
    } catch (e) {
      console.warn(`[cron] snapshot failed for user ${uid}:`, e)
    }
  }

  return Response.json({
    refreshed,
    skipped,
    errors,
    instrumentsScanned: instruments?.length ?? 0,
    snapshotsCreated,
  })
}
