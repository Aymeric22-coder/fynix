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
 * Réponse :
 *   {
 *     broker_detected:    string,
 *     total_rows:         number,
 *     transactions_found: number,
 *     positions_imported: number,
 *     positions_updated:  number,
 *     positions_skipped:  number,
 *     errors:             Array<{ row?: number; isin?: string; reason: string }>,
 *     preview:            AggregatedPosition[],
 *   }
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import {
  parseBrokerCsv, aggregateToPositions, decodeCsvBytes,
  type BrokerFormat, type AggregatedPosition, type AssetClassNormalized,
} from '@/lib/portfolio/csvImport'
import { enrichISIN } from '@/lib/analyse/isinEnricher'
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

// ─────────────────────────────────────────────────────────────────────

async function readCsv(req: Request): Promise<{ csv: string | null; brokerHint?: BrokerFormat }> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    const file = fd.get('file')
    if (!(file instanceof File)) return { csv: null }
    const bytes = await file.arrayBuffer()
    const csv = decodeCsvBytes(bytes)
    const hint = fd.get('broker') as BrokerFormat | null
    return { csv, brokerHint: hint && hint !== 'unknown' ? hint : undefined }
  }
  try {
    const json = await req.json() as { csv?: string; broker?: BrokerFormat }
    return { csv: json.csv ?? null, brokerHint: json.broker }
  } catch {
    return { csv: null }
  }
}

export const POST = withAuth(async (req: Request, user: User) => {
  const { csv, brokerHint } = await readCsv(req)
  if (!csv || csv.trim().length === 0) return err('Fichier CSV manquant', 400)

  const parsed = parseBrokerCsv(csv, brokerHint)
  const positions = aggregateToPositions(parsed.transactions)

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

  const supabase = await createServerClient()

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
        // Enrichissement via le pipeline existant (cache + OpenFIGI + Yahoo).
        // Erreurs silencieuses : si l'enrichissement échoue, on insère avec
        // les données du CSV et asset_class=mapping CSV → DB.
        let assetClassDb: AssetClass = ASSET_CLASS_MAP[pos.asset_class] ?? 'other'
        let resolvedName = pos.name
        try {
          const enriched = await enrichISIN(pos.isin)
          if (enriched.name) resolvedName = enriched.name
          // Si l'enrichissement détecte une classe différente, on lui fait
          // confiance (ex : Trade Republic dit "STOCK" mais ISIN est un ETF).
          if (enriched.asset_type && enriched.asset_type !== 'unknown') {
            const map: Record<string, AssetClass> = {
              stock: 'equity', etf: 'etf', bond: 'bond',
              crypto: 'crypto', scpi: 'scpi', metal: 'metal',
            }
            assetClassDb = map[enriched.asset_type] ?? assetClassDb
          }
        } catch (e) {
          // L'enrichissement ne doit pas planter l'import.
          console.warn(`[import] enrichISIN ${pos.isin} a échoué :`, (e as Error).message)
        }

        const { data: created, error: ie } = await supabase
          .from('instruments')
          .insert({
            name:        resolvedName,
            asset_class: assetClassDb,
            ticker:      pos.ticker ?? null,
            isin:        pos.isin,
            currency:    (pos.currency as CurrencyCode) ?? 'EUR',
            data_source: 'import',
          })
          .select('id, asset_class')
          .single()
        if (ie || !created) {
          summary.errors.push({ isin: pos.isin, reason: `Création instrument échouée : ${ie?.message ?? 'inconnu'}` })
          continue
        }
        instrument = { id: created.id as string, asset_class: created.asset_class as AssetClass }
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
        // Marque la position comme désormais existante pour la suite de la boucle
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

  return ok(summary)
})
