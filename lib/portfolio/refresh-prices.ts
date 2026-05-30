/**
 * Boucle factorisee de refresh des prix d'instruments.
 *
 * Mutualise la logique entre :
 *   - `/api/cron/refresh-prices` (cron Vercel quotidien, tous utilisateurs)
 *   - `/api/portfolio/refresh-prices` (refresh manuel, 1 utilisateur)
 *
 * Chaque route prepare sa liste `instrumentIds` (selon son perimetre) et
 * appelle ce helper. Ce qui RESTE specifique a chaque route :
 *   - le scope user (tous vs 1)
 *   - le type de snapshot final ('cron' vs 'refresh')
 *
 * Ce qui est mutualise ici :
 *   - chargement de `instruments` (catalogue partage)
 *   - boucle fetch via l'orchestrateur de providers
 *   - upsert idempotent dans `instrument_prices`
 *   - P2 : UPDATE batch `instruments.last_refresh_attempted_at` pour tous
 *     les instruments TRAVERSES (peu importe l'issue)
 *   - P6 : protection des prix manuels recents contre l'ecrasement
 *     (constante MANUAL_PRICE_PROTECTION_DAYS — etape 2 du chantier REFR)
 *
 * Le client supabase passe en argument DOIT etre service-role : ecritures
 * sur `instrument_prices` et `instruments` (RLS verrouillee aux non-admins).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildOrchestrator } from './providers'
import type { InstrumentLookup } from './providers'
import { YahooFinanceProvider } from '@/lib/providers/market-data/yahoo'
import type { AssetClass } from '@/types/database.types'

/**
 * Seuil de protection d'un prix manuel recent (P6).
 * Un prix `source = 'manual'` plus recent que ce seuil empeche tout
 * fetch auto sur le meme instrument — evite qu'un parsing Boursorama
 * accidentel ecrase une saisie utilisateur deliberee.
 * Constante exportee pour ajustement et tests.
 */
export const MANUAL_PRICE_PROTECTION_DAYS = 7

export interface RefreshInstrumentPricesResult {
  /** Nb d'instruments avec un prix effectivement obtenu et inseré (ou no-op duplicate). */
  refreshed:           number
  /** Nb d'instruments sans cotation disponible (orchestrator a renvoye null). */
  skipped:             number
  /** Nb d'instruments dont le fetch a leve une exception. */
  errors:              number
  /** Nb d'instruments proteges par un prix manuel recent (P6 — etape 2 a venir). */
  protectedManual:     number
  /** Nb total d'instruments charges et traverses. */
  instrumentsScanned:  number
}

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

/**
 * Refresh les prix d'une liste d'instruments. Pure cote periode user :
 * l'appelant a deja filtre les `instrumentIds` selon son perimetre.
 *
 * Throws : uniquement si le chargement initial des instruments echoue ou
 * si l'upsert final echoue. Les echecs PAR INSTRUMENT sont catches en
 * interne (compteur `errors`), pour ne pas casser tout le batch.
 */
export async function refreshInstrumentPrices(
  admin:         SupabaseClient,
  instrumentIds: string[],
): Promise<RefreshInstrumentPricesResult> {
  if (instrumentIds.length === 0) {
    return {
      refreshed: 0, skipped: 0, errors: 0,
      protectedManual: 0, instrumentsScanned: 0,
    }
  }

  // 1. Catalogue des instruments a traiter
  const { data: instruments, error: instErr } = await admin
    .from('instruments')
    .select('id, name, ticker, isin, provider_id, asset_class')
    .in('id', instrumentIds)
  if (instErr) {
    throw new Error(`refresh-prices: load instruments failed: ${instErr.message}`)
  }
  const insts = (instruments ?? []) as InstrumentRow[]

  // 2. P6 — Pre-fetch des prix manuels recents pour proteger les saisies
  //    utilisateur de l'ecrasement par un fetch auto. Un prix `source='manual'`
  //    plus recent que MANUAL_PRICE_PROTECTION_DAYS bloque le fetch (l'instrument
  //    est tout de meme considere comme "tente" pour P2 — son cas a ete evalue).
  const protectionCutoffIso = new Date(
    Date.now() - MANUAL_PRICE_PROTECTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const { data: manualRows, error: manualErr } = await admin
    .from('instrument_prices')
    .select('instrument_id, priced_at')
    .eq('source', 'manual')
    .gte('priced_at', protectionCutoffIso)
    .in('instrument_id', instrumentIds)
  if (manualErr) {
    // Pas bloquant : on continue sans protection plutot que de casser
    // tout le batch. Un echec ici est ultra rare (lecture simple).
    console.warn('[refresh-prices] manual pre-fetch failed, skipping P6 protection:', manualErr.message)
  }
  // Index : instrument_id → priced_at du prix manuel le plus recent dans la fenetre
  const recentManualByInstrument = new Map<string, string>()
  for (const r of manualRows ?? []) {
    const id = r.instrument_id as string
    const at = r.priced_at as string
    const prev = recentManualByInstrument.get(id)
    if (!prev || at > prev) recentManualByInstrument.set(id, at)
  }

  // 3. Orchestrateur (chaine de providers triee par priority)
  const orchestrator = await buildOrchestrator(admin)

  // 4. Boucle fetch — chaque echec est CATCH par instrument
  const inserts: PriceInsertRow[] = []
  let refreshed = 0
  let skipped = 0
  let errors = 0
  let protectedManual = 0

  for (const inst of insts) {
    // P6 — Si prix manuel recent existe, on saute le fetch.
    //      `last_refresh_attempted_at` sera quand meme mis a jour pour
    //      cet instrument (cf. UPDATE batch ci-dessous) : son cas a bien
    //      ete evalue par le batch.
    const protectedSince = recentManualByInstrument.get(inst.id)
    if (protectedSince) {
      protectedManual++
      console.log(
        `[refresh-prices] ${inst.id} (${inst.name}) — skip fetch : ` +
        `prix manuel recent (${protectedSince}, < ${MANUAL_PRICE_PROTECTION_DAYS}j)`,
      )
      continue
    }

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

      // Tronque la timestamp a la minute pour eviter de polluer l'index
      // unique (instrument_id, priced_at, source) sur des re-jeux dans la
      // meme minute.
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
      console.error(`[refresh-prices] failed for ${inst.id} (${inst.name}):`, e)
      errors++
    }
  }

  // 5. Upsert batch idempotent
  if (inserts.length > 0) {
    const { error: upErr } = await admin
      .from('instrument_prices')
      .upsert(inserts, {
        onConflict:       'instrument_id,priced_at,source',
        ignoreDuplicates: true,
      })
    if (upErr) {
      throw new Error(`refresh-prices: upsert prices failed: ${upErr.message}`)
    }
  }

  // 6. P2 — UPDATE batch `last_refresh_attempted_at` pour TOUS les
  //    instruments traverses (succes, skip, error, protected).
  //    Volontairement NON BLOQUANT : un echec ici n'invalide pas le batch
  //    qui a deja insere les prix avec succes. On warn et on continue.
  const attemptedIds = insts.map((i) => i.id)
  if (attemptedIds.length > 0) {
    const nowIso = new Date().toISOString()
    const { error: updErr } = await admin
      .from('instruments')
      .update({ last_refresh_attempted_at: nowIso })
      .in('id', attemptedIds)
    if (updErr) {
      console.warn('[refresh-prices] last_refresh_attempted_at update failed:', updErr.message)
    }
  }

  return {
    refreshed, skipped, errors, protectedManual,
    instrumentsScanned: insts.length,
  }
}

// ─────────────────────────────────────────────────────────────────────
// BNCH — Benchmarks (indices de reference)
// ─────────────────────────────────────────────────────────────────────
//
// Les benchmarks (is_benchmark = TRUE) sont traites par un chemin
// YAHOO-DIRECT (pas l'orchestrateur), pour 2 raisons :
//   1. Cohérence de source : backfill (getHistory) et forward (getQuote)
//      stockent tous deux source='yahoo' → une seule serie lisible.
//   2. ^FCHI (CAC 40, asset_class='other') n'est route par AUCUN provider
//      de l'orchestrateur ('other' non supporte) ; yahoo-direct le sert.
//
// Aucune position n'est rattachee aux benchmarks → ils ne sont PAS
// inclus dans le refresh standard (base sur positions actives).

interface BenchmarkRow {
  id:       string
  name:     string
  ticker:   string | null
  currency: string
}

export interface RefreshBenchmarksResult {
  refreshed: number
  skipped:   number
  errors:    number
}

/** Tronque une timestamp a la minute (coherent avec refreshInstrumentPrices). */
function truncMinute(d: Date): string {
  const t = new Date(d)
  t.setSeconds(0, 0)
  return t.toISOString()
}

/**
 * Forward-tracking : recupere le QUOTE COURANT de chaque benchmark via
 * yahoo direct et l'insere (source='yahoo'). Idempotent via la cle unique
 * (instrument_id, priced_at, source). Appele par le cron quotidien.
 */
export async function refreshBenchmarkPrices(
  admin: SupabaseClient,
): Promise<RefreshBenchmarksResult> {
  const { data: benchmarks, error } = await admin
    .from('instruments')
    .select('id, name, ticker, currency')
    .eq('is_benchmark', true)
  if (error) {
    throw new Error(`refresh-benchmarks: load failed: ${error.message}`)
  }
  const rows = (benchmarks ?? []) as BenchmarkRow[]
  if (rows.length === 0) return { refreshed: 0, skipped: 0, errors: 0 }

  const provider = new YahooFinanceProvider()
  const inserts: PriceInsertRow[] = []
  let refreshed = 0, skipped = 0, errors = 0

  for (const b of rows) {
    if (!b.ticker) { skipped++; continue }
    try {
      const q = await provider.getQuote(b.ticker)
      if (!q || !(q.price > 0)) { skipped++; continue }
      inserts.push({
        instrument_id: b.id,
        price:         q.price,
        currency:      q.currency,
        priced_at:     truncMinute(q.fetchedAt),
        source:        'yahoo',
        confidence:    q.confidence,
      })
      refreshed++
    } catch (e) {
      console.error(`[refresh-benchmarks] failed for ${b.id} (${b.name}):`, e)
      errors++
    }
  }

  if (inserts.length > 0) {
    const { error: upErr } = await admin
      .from('instrument_prices')
      .upsert(inserts, { onConflict: 'instrument_id,priced_at,source', ignoreDuplicates: true })
    if (upErr) throw new Error(`refresh-benchmarks: upsert failed: ${upErr.message}`)
  }

  // P2 : tracer la tentative pour les benchmarks aussi.
  const ids = rows.map((b) => b.id)
  const { error: updErr } = await admin
    .from('instruments')
    .update({ last_refresh_attempted_at: new Date().toISOString() })
    .in('id', ids)
  if (updErr) console.warn('[refresh-benchmarks] last_refresh_attempted_at update failed:', updErr.message)

  return { refreshed, skipped, errors }
}

export interface BackfillBenchmarksResult {
  inserted:  number
  errors:    number
  perBenchmark: Array<{ id: string; name: string; points: number }>
}

/**
 * Backfill historique : pour chaque benchmark, fetch l'historique de prix
 * via yahoo getHistory(ticker, from, to) et insere (source='yahoo').
 * Idempotent via la cle unique → un re-run n'ajoute aucun doublon.
 *
 * Appele par la route one-shot POST /api/cron/backfill-benchmarks.
 */
export async function backfillBenchmarkHistory(
  admin: SupabaseClient,
  from:  Date,
  to:    Date = new Date(),
): Promise<BackfillBenchmarksResult> {
  const { data: benchmarks, error } = await admin
    .from('instruments')
    .select('id, name, ticker, currency')
    .eq('is_benchmark', true)
  if (error) throw new Error(`backfill-benchmarks: load failed: ${error.message}`)
  const rows = (benchmarks ?? []) as BenchmarkRow[]

  const provider = new YahooFinanceProvider()
  let inserted = 0, errors = 0
  const perBenchmark: BackfillBenchmarksResult['perBenchmark'] = []

  for (const b of rows) {
    if (!b.ticker) { perBenchmark.push({ id: b.id, name: b.name, points: 0 }); continue }
    try {
      const history = await provider.getHistory(b.ticker, from, to)
      if (history.length === 0) {
        perBenchmark.push({ id: b.id, name: b.name, points: 0 })
        continue
      }

      const inserts: PriceInsertRow[] = history
        .filter((h) => typeof h.close === 'number' && h.close > 0)
        .map((h) => ({
          instrument_id: b.id,
          price:         h.close,
          currency:      b.currency,
          // Histo daily → priced_at canonique 00:00:00Z, evite les conflits
          // d'index avec d'eventuels prix forward sur la meme journee.
          priced_at:     `${h.date}T00:00:00.000Z`,
          source:        'yahoo',
          confidence:    'high',
        }))

      if (inserts.length > 0) {
        const { error: upErr } = await admin
          .from('instrument_prices')
          .upsert(inserts, { onConflict: 'instrument_id,priced_at,source', ignoreDuplicates: true })
        if (upErr) throw new Error(`upsert: ${upErr.message}`)
        inserted += inserts.length
      }
      perBenchmark.push({ id: b.id, name: b.name, points: inserts.length })
    } catch (e) {
      console.error(`[backfill-benchmarks] failed for ${b.id} (${b.name}):`, e)
      errors++
      perBenchmark.push({ id: b.id, name: b.name, points: 0 })
    }
  }

  return { inserted, errors, perBenchmark }
}
