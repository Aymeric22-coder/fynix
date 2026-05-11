/**
 * POST /api/portfolio/refresh-prices
 *
 * Variante user-triggered de /api/cron/refresh-prices.
 * Pas d'auth Bearer (RLS via session) : ne rafraîchit que les instruments
 * détenus par l'utilisateur courant.
 *
 * Utilise le service-role key pour pouvoir écrire dans instrument_prices
 * (lecture authenticated, écriture par cron uniquement, sauf via cette route).
 */

import { createClient } from '@supabase/supabase-js'
import { ok, err, withAuth } from '@/lib/utils/api'
import { createServerClient } from '@/lib/supabase/server'
import { buildOrchestrator } from '@/lib/portfolio/providers'
import { persistPortfolioSnapshot } from '@/lib/portfolio/persist-snapshot'
import type { User } from '@supabase/supabase-js'
import type { AssetClass } from '@/types/database.types'
import type { InstrumentLookup } from '@/lib/portfolio/providers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InstrumentRow {
  id:          string
  name:        string
  ticker:      string | null
  isin:        string | null
  provider_id: string | null
  asset_class: AssetClass
}

export const POST = withAuth(async (_req: Request, user: User) => {
  // 1. Lecture des instruments détenus (RLS user)
  const userClient = await createServerClient()
  const { data: held, error: heldErr } = await userClient
    .from('positions')
    .select('instrument_id')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (heldErr) return err(heldErr.message, 500)

  const ids = Array.from(new Set((held ?? []).map((r) => r.instrument_id as string)))
  if (ids.length === 0) {
    return ok({ refreshed: 0, skipped: 0, errors: 0, message: 'Aucune position active' })
  }

  // 2. Service-role pour bypass RLS sur instruments + instrument_prices
  const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SERVICE_KEY) {
    return err('SUPABASE_SERVICE_ROLE_KEY non configurée', 500)
  }

  const admin = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: instruments, error: instErr } = await admin
    .from('instruments')
    .select('id, name, ticker, isin, provider_id, asset_class')
    .in('id', ids)

  if (instErr) return err(instErr.message, 500)

  // 3. Orchestrateur + fetch
  const orchestrator = await buildOrchestrator(admin)

  const inserts: Array<{
    instrument_id: string; price: number; currency: string;
    priced_at: string; source: string; confidence: string;
  }> = []
  let refreshed = 0, skipped = 0, errors = 0

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
      console.error(`[user-refresh] failed for ${inst.id}:`, e)
      errors++
    }
  }

  if (inserts.length > 0) {
    const { error: insErr } = await admin
      .from('instrument_prices')
      .upsert(inserts, { onConflict: 'instrument_id,priced_at,source', ignoreDuplicates: true })

    if (insErr) return err(insErr.message, 500)
  }

  // Auto-snapshot apres refresh : on photographie le portefeuille avec
  // les nouveaux prix. Permet de construire la timeline progressivement
  // au gre des refresh utilisateur (et du cron quotidien).
  let snapshotPersisted = false
  try {
    const snap = await persistPortfolioSnapshot(userClient, user.id, 'refresh')
    snapshotPersisted = snap !== null
  } catch (e) {
    console.warn('[user-refresh] snapshot failed:', e)
  }

  return ok({
    refreshed,
    skipped,
    errors,
    instrumentsScanned: instruments?.length ?? 0,
    snapshotPersisted,
  })
})
