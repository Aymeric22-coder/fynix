/**
 * POST /api/portfolio/import — import CSV universel multi-broker
 *
 * Pipeline :
 *   1. Lecture brute du fichier (multipart/form-data ou JSON { csv })
 *   2. Détection encodage (UTF-8 ou ISO-8859-1) → string
 *   3. detectBroker + parser dédié → NormalizedTransaction[]
 *   4. aggregateToPositions → AggregatedPosition[]
 *   5. Enrichissement ISIN via cache (isin_cache) puis OpenFIGI / Yahoo
 *      pour les positions sans données ; insertion dans `instruments` si
 *      l'ISIN est inconnu du référentiel global.
 *   6. Upsert dans `positions` : si l'utilisateur a déjà une position sur
 *      cet instrument, on recalcule un PRU pondéré (existant + import) et
 *      on additionne les quantités.
 *
 * Sprint 2 — hardening :
 *   - D14 : limites taille (5 Mo) et lignes (5000) explicites.
 *   - D15 : validation Zod du body JSON.
 *   - D16 : nettoyage du nom d'instrument avant INSERT (catalogue partage).
 *   - D13 : insert ISIN-safe (ON CONFLICT + fallback SELECT en cas de race).
 *   - D19 : enrichissement ISIN paralelise via runInBatches.
 */

import { createHash } from 'node:crypto'
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import {
  parseBrokerCsv, aggregateToPositions, decodeCsvBytes,
  type BrokerFormat, type AggregatedPosition, type AssetClassNormalized,
} from '@/lib/portfolio/csvImport'
import { enrichISIN } from '@/lib/analyse/isinEnricher'
import { cleanInstrumentName } from '@/lib/portfolio/cleanInstrumentName'
import { ImportCsvBodySchema, formatZodErrors } from '@/lib/portfolio/importSchema'
import { runInBatches } from '@/lib/email/batch'
import type { AssetClass, CurrencyCode } from '@/types/database.types'

interface ImportSummary {
  broker_detected:    BrokerFormat
  total_rows:         number
  transactions_found: number
  positions_imported: number
  positions_updated:  number
  positions_skipped:  number
  errors:             Array<{ row?: number; isin?: string; reason: string }>
  preview:            AggregatedPosition[]
}

// ── Mapping classe normalisée → enum DB ───────────────────────────────
const ASSET_CLASS_MAP: Record<AssetClassNormalized, AssetClass> = {
  stock:      'equity',
  etf:        'etf',
  crypto:     'crypto',
  scpi:       'scpi',
  obligation: 'bond',
}

// Limites D14 — surface d'attaque CSV. Exportes pour les tests.
export const MAX_CSV_BYTES = 5 * 1024 * 1024   // 5 Mo
export const MAX_CSV_LINES = 5000              // lignes brutes

// Mapping enrichISIN.asset_type → AssetClass DB
const ENRICH_ASSET_CLASS_MAP: Record<string, AssetClass> = {
  stock: 'equity', etf: 'etf', bond: 'bond',
  crypto: 'crypto', scpi: 'scpi', metal: 'metal',
}

// ─────────────────────────────────────────────────────────────────────

interface ReadCsvResult {
  csv:           string | null
  brokerHint?:   BrokerFormat
  excludedKeys:  string[]
  /** Si défini, court-circuite avec ce code HTTP + message. */
  earlyError?:   { status: number; message: string }
}

async function readCsv(req: Request): Promise<ReadCsvResult> {
  // D14 — taille max via Content-Length quand fourni par le client.
  const lenHeader = req.headers.get('content-length')
  if (lenHeader) {
    const len = parseInt(lenHeader, 10)
    if (Number.isFinite(len) && len > MAX_CSV_BYTES) {
      return {
        csv: null, excludedKeys: [],
        earlyError: { status: 413, message: 'Fichier trop volumineux (max 5 Mo)' },
      }
    }
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    const file = fd.get('file')
    if (!(file instanceof File)) return { csv: null, excludedKeys: [] }
    // D14 (fallback) : le browser fournit `size` sur File.
    if (file.size > MAX_CSV_BYTES) {
      return {
        csv: null, excludedKeys: [],
        earlyError: { status: 413, message: 'Fichier trop volumineux (max 5 Mo)' },
      }
    }
    const bytes = await file.arrayBuffer()
    const csv = decodeCsvBytes(bytes)
    const hint = fd.get('broker') as BrokerFormat | null
    const rawExcl = fd.get('excludedIds')
    const excludedKeys = typeof rawExcl === 'string'
      ? rawExcl.split(',').map((s) => s.trim()).filter(Boolean)
      : []
    return { csv, brokerHint: hint && hint !== 'unknown' ? hint : undefined, excludedKeys }
  }

  // JSON body : validation Zod (D15).
  let raw: unknown
  try { raw = await req.json() }
  catch { return { csv: null, excludedKeys: [] } }

  const parsed = ImportCsvBodySchema.safeParse(raw)
  if (!parsed.success) {
    return {
      csv: null, excludedKeys: [],
      earlyError: {
        status:  400,
        message: 'Body JSON invalide : ' + formatZodErrors(parsed.error).join(' ; '),
      },
    }
  }
  const body = parsed.data
  const excludedKeys = body.excludedIds ?? body._exclusions ?? []
  // D14 (JSON) — on mesure aussi la taille du csv string.
  if (body.csv && body.csv.length > MAX_CSV_BYTES) {
    return {
      csv: null, excludedKeys: [],
      earlyError: { status: 413, message: 'Fichier trop volumineux (max 5 Mo)' },
    }
  }
  return {
    csv:        body.csv ?? null,
    brokerHint: body.broker as BrokerFormat | undefined,
    excludedKeys,
  }
}

export const POST = withAuth(async (req: Request, user: User) => {
  const { csv, brokerHint, excludedKeys, earlyError } = await readCsv(req)
  if (earlyError) return err(earlyError.message, earlyError.status)
  if (!csv || csv.trim().length === 0) return err('Fichier CSV manquant', 400)

  // D14 — borne haute en nombre de lignes brutes (lecture rapide avant
  // d'allouer le parseur complet).
  const lineCount = (csv.match(/\n/g)?.length ?? 0) + 1
  if (lineCount > MAX_CSV_LINES) {
    return err(`Fichier trop long (max ${MAX_CSV_LINES} lignes, ${lineCount} detectees)`, 422)
  }

  // Hash SHA-256 du contenu : la dedup tient compte des exclusions pour
  // que l'utilisateur puisse re-importer le meme fichier avec une selection
  // differente (ex : il avait exclu a tort une position).
  const hashInput = csv + '|excl=' + [...excludedKeys].sort().join(',')
  const fileHash = createHash('sha256').update(hashInput).digest('hex')

  const supabase = await createServerClient()

  // Dedup : si le meme (user, hash) existe deja, on refuse l'import.
  {
    const { data: existing } = await supabase
      .from('import_history')
      .select('id, imported_at, row_count')
      .eq('user_id', user.id)
      .eq('file_hash', fileHash)
      .maybeSingle()
    if (existing) {
      return err(
        `Ce fichier a deja ete importe le ${new Date(existing.imported_at as string).toLocaleString('fr-FR')} (${existing.row_count} positions). Si tu veux le re-importer, exclus ou ajoute au moins une position differente.`,
        409,
      )
    }
  }

  const parsed = parseBrokerCsv(csv, brokerHint)
  const positions = aggregateToPositions(parsed.transactions, excludedKeys)

  const summary: ImportSummary = {
    broker_detected:    parsed.broker,
    total_rows:         parsed.total_rows,
    transactions_found: parsed.transactions.length,
    positions_imported: 0,
    positions_updated:  0,
    positions_skipped:  0,
    errors:             [...parsed.errors.map((e) => ({ row: e.line, reason: e.reason }))],
    preview:            positions,
  }

  if (positions.length === 0) return ok(summary)

  // ── 1) Pré-fetch des instruments existants par ISIN
  const isinsToResolve = positions
    .map((p) => p.isin)
    .filter((i): i is string => !!i)
  const instrumentByIsin = new Map<string, { id: string; asset_class: AssetClass }>()
  if (isinsToResolve.length > 0) {
    const { data } = await supabase
      .from('instruments')
      .select('id, isin, asset_class')
      .in('isin', isinsToResolve)
    for (const i of data ?? []) {
      if (i.isin) instrumentByIsin.set(i.isin as string, { id: i.id as string, asset_class: i.asset_class as AssetClass })
    }
  }

  // ── 2) Pré-fetch des positions existantes de l'utilisateur
  const existingInstrumentIds = Array.from(instrumentByIsin.values()).map((v) => v.id)
  const existingByInstrumentId = new Map<string, { id: string; quantity: number; average_price: number }>()
  if (existingInstrumentIds.length > 0) {
    const { data } = await supabase
      .from('positions')
      .select('id, instrument_id, quantity, average_price')
      .eq('user_id', user.id)
      .in('instrument_id', existingInstrumentIds)
    for (const p of data ?? []) {
      existingByInstrumentId.set(p.instrument_id as string, {
        id:            p.id as string,
        quantity:      Number(p.quantity),
        average_price: Number(p.average_price),
      })
    }
  }

  // ── 2b) D19 — Enrichissement ISIN paralelise par batch.
  //       Limite OpenFIGI sans cle API : 25 requetes/min.
  //       batchSize=5 + delayMs=2500ms → max 12 req/min en regime, large marge.
  const isinsToEnrich = positions
    .map((p) => p.isin)
    .filter((i): i is string => !!i && !instrumentByIsin.has(i))

  const enrichedByIsin = new Map<string, Awaited<ReturnType<typeof enrichISIN>>>()
  if (isinsToEnrich.length > 0) {
    const summaryBatch = await runInBatches(
      isinsToEnrich,
      async (isin) => {
        try { return { isin, data: await enrichISIN(isin) } }
        catch { return { isin, data: null } }
      },
      { batchSize: 5, delayMs: 2500 },
    )
    for (const r of summaryBatch.results) {
      if (r.ok && r.value.data) enrichedByIsin.set(r.value.isin, r.value.data)
    }
  }

  // ── 3) Traitement position par position
  for (const pos of positions) {
    try {
      if (pos.closed) { summary.positions_skipped++; continue }
      if (!pos.isin && !pos.ticker) {
        summary.errors.push({ reason: `${pos.name} : ni ISIN ni ticker — position ignorée` })
        summary.positions_skipped++
        continue
      }

      let instrument = pos.isin ? instrumentByIsin.get(pos.isin) : undefined

      // 3a — Création de l'instrument si absent du référentiel global
      if (!instrument && pos.isin) {
        let assetClassDb: AssetClass = ASSET_CLASS_MAP[pos.asset_class] ?? 'other'
        let resolvedName = pos.name
        const enriched = enrichedByIsin.get(pos.isin)
        if (enriched) {
          if (enriched.name) resolvedName = enriched.name
          if (enriched.asset_type && enriched.asset_type !== 'unknown') {
            assetClassDb = ENRICH_ASSET_CLASS_MAP[enriched.asset_type] ?? assetClassDb
          }
        }

        // D16 — nettoyage du libellé broker avant insertion dans le
        // catalogue partagé. Sinon "VENTE ALSTOM 15/03" se retrouve
        // visible par tous les autres users.
        const cleanedName = cleanInstrumentName({
          rawName: resolvedName,
          isin:    pos.isin,
          ticker:  pos.ticker,
        })

        // D13 — INSERT ISIN-safe : si une race condition a deja insere
        // cet ISIN par un autre user/autre import, on recupere son id.
        const insertPayload = {
          name:        cleanedName,
          asset_class: assetClassDb,
          ticker:      pos.ticker ?? null,
          isin:        pos.isin,
          currency:    (pos.currency as CurrencyCode) ?? 'EUR',
          data_source: 'import',
        }
        const insertResult = await supabase
          .from('instruments')
          .insert(insertPayload)
          .select('id, asset_class')
          .maybeSingle()

        let resolvedId: string | undefined = insertResult.data?.id as string | undefined
        let resolvedClass: AssetClass | undefined = insertResult.data?.asset_class as AssetClass | undefined

        if (!resolvedId) {
          // Conflit UNIQUE(isin) probable → on recupere l'existant.
          const existingByConflict = await supabase
            .from('instruments')
            .select('id, asset_class')
            .eq('isin', pos.isin)
            .maybeSingle()
          resolvedId    = existingByConflict.data?.id as string | undefined
          resolvedClass = existingByConflict.data?.asset_class as AssetClass | undefined
        }

        if (!resolvedId) {
          summary.errors.push({
            isin: pos.isin,
            reason: `Création instrument échouée : ${insertResult.error?.message ?? 'inconnu'}`,
          })
          continue
        }
        instrument = { id: resolvedId, asset_class: resolvedClass ?? assetClassDb }
        instrumentByIsin.set(pos.isin, instrument)
      }

      if (!instrument) {
        summary.errors.push({ isin: pos.isin ?? undefined, reason: 'Instrument non résolu (ISIN manquant)' })
        summary.positions_skipped++
        continue
      }

      // 3b — Upsert position
      const existing = existingByInstrumentId.get(instrument.id)
      if (existing) {
        // PRU pondéré : (existQty × existPRU + importQty × importPRU) / total
        const totalQty = existing.quantity + pos.quantity
        const newPru   = totalQty > 0
          ? (existing.quantity * existing.average_price + pos.quantity * pos.unit_price) / totalQty
          : pos.unit_price
        const { error: ue } = await supabase
          .from('positions')
          .update({
            quantity:      totalQty,
            average_price: Math.round(newPru * 10000) / 10000,
          })
          .eq('id', existing.id)
        if (ue) {
          summary.errors.push({ isin: pos.isin ?? undefined, reason: `Update position : ${ue.message}` })
          continue
        }
        summary.positions_updated++
      } else {
        const { error: pe } = await supabase
          .from('positions')
          .insert({
            user_id:          user.id,
            instrument_id:    instrument.id,
            quantity:         pos.quantity,
            average_price:    pos.unit_price,
            currency:         (pos.currency as CurrencyCode) ?? 'EUR',
            broker:           pos.broker,
            acquisition_date: pos.acquisition_date,
            status:           'active',
          })
        if (pe) {
          summary.errors.push({ isin: pos.isin ?? undefined, reason: `Insert position : ${pe.message}` })
          continue
        }
        summary.positions_imported++
        existingByInstrumentId.set(instrument.id, {
          id:            'new',
          quantity:      pos.quantity,
          average_price: pos.unit_price,
        })
      }
    } catch (e) {
      summary.errors.push({ isin: pos.isin ?? undefined, reason: (e as Error).message })
    }
  }

  // ── 4) Enregistre le hash pour bloquer les futurs imports identiques.
  const totalImported = summary.positions_imported + summary.positions_updated
  if (totalImported > 0) {
    const { error: he } = await supabase
      .from('import_history')
      .insert({
        user_id:     user.id,
        file_hash:   fileHash,
        row_count:   totalImported,
        broker_hint: parsed.broker,
      })
    if (he && process.env.NODE_ENV !== 'production') {
      console.warn('[import] history insert failed:', he.message)
    }
  }

  return ok(summary)
})
