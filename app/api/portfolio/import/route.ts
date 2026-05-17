/**
 * POST /api/portfolio/import — import CSV broker (Boursorama / Degiro / Trade Republic)
 *
 * Accepte le CSV brut soit dans multipart/form-data (champ `file`) soit en
 * application/json (`{ csv: string, broker?: BrokerFormat }`).
 *
 * Pipeline :
 *   1. Détection broker + parsing CSV → liste de lignes normalisées
 *   2. Pour chaque ligne :
 *      - Cherche un instrument existant par ISIN
 *      - Si absent, crée l'instrument (asset_class = 'other' par défaut,
 *        à enrichir manuellement ou via un job d'enrichissement ultérieur)
 *      - Cherche si l'utilisateur a déjà une position sur cet instrument
 *        (skip si oui — évite les doublons sur ré-imports)
 *      - Insère la position
 *   3. Retourne un résumé { imported, skipped, errors, broker }
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import {
  parseBrokerCsv, type BrokerFormat, type ImportedPositionRow,
} from '@/lib/portfolio/csvImport'
import type { AssetClass, CurrencyCode } from '@/types/database.types'

interface ImportSummary {
  broker:   BrokerFormat
  imported: number
  skipped:  number
  errors:   Array<{ line?: number; isin?: string; reason: string }>
}

async function readBody(req: Request): Promise<{ csv: string | null; brokerHint: BrokerFormat | undefined }> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    const file = fd.get('file')
    if (!(file instanceof File)) return { csv: null, brokerHint: undefined }
    const csv = await file.text()
    const hint = (fd.get('broker') as BrokerFormat | null) ?? undefined
    return { csv, brokerHint: hint && hint !== 'unknown' ? hint : undefined }
  }
  try {
    const json = await req.json() as { csv?: string; broker?: BrokerFormat }
    return { csv: json.csv ?? null, brokerHint: json.broker }
  } catch {
    return { csv: null, brokerHint: undefined }
  }
}

export const POST = withAuth(async (req: Request, user: User) => {
  const { csv, brokerHint } = await readBody(req)
  if (!csv || csv.trim().length === 0) return err('Fichier CSV manquant', 400)

  const parsed = parseBrokerCsv(csv, brokerHint)
  if (parsed.broker === 'unknown') {
    return err('Format CSV non reconnu — utilisez un export Boursorama, Degiro ou Trade Republic.', 400)
  }

  const summary: ImportSummary = {
    broker:   parsed.broker,
    imported: 0,
    skipped:  0,
    errors:   parsed.errors.map((e) => ({ line: e.line, reason: e.reason })),
  }

  if (parsed.rows.length === 0) {
    return ok(summary)
  }

  const supabase = await createServerClient()

  // ── 1) Pré-fetch des instruments existants pour TOUTES les ISIN du fichier
  const isins = Array.from(new Set(parsed.rows.map((r) => r.isin)))
  const { data: existingInstruments } = await supabase
    .from('instruments')
    .select('id, isin')
    .in('isin', isins)
  const instrumentByIsin = new Map<string, string>()
  for (const i of existingInstruments ?? []) {
    if (i.isin) instrumentByIsin.set(i.isin as string, i.id as string)
  }

  // ── 2) Pré-fetch des positions de l'utilisateur sur ces instruments
  const existingInstrumentIds = Array.from(instrumentByIsin.values())
  const userInstrumentIds = new Set<string>()
  if (existingInstrumentIds.length > 0) {
    const { data: userPositions } = await supabase
      .from('positions')
      .select('instrument_id')
      .eq('user_id', user.id)
      .in('instrument_id', existingInstrumentIds)
    for (const p of userPositions ?? []) {
      userInstrumentIds.add(p.instrument_id as string)
    }
  }

  // ── 3) Insertion ligne par ligne
  for (const row of parsed.rows) {
    try {
      let instrumentId = instrumentByIsin.get(row.isin)

      // Création de l'instrument si absent du référentiel global.
      if (!instrumentId) {
        const { data: created, error: ie } = await supabase
          .from('instruments')
          .insert({
            name:        row.name ?? row.isin,
            asset_class: 'other' as AssetClass,
            ticker:      null,
            isin:        row.isin,
            currency:    (row.currency as CurrencyCode) ?? 'EUR',
            data_source: 'import',
          })
          .select('id')
          .single()
        if (ie || !created) {
          summary.errors.push({ isin: row.isin, reason: `Création instrument échouée : ${ie?.message ?? 'inconnu'}` })
          continue
        }
        instrumentId = created.id as string
        instrumentByIsin.set(row.isin, instrumentId)
      }

      // Skip si l'utilisateur a déjà une position sur cet instrument.
      if (userInstrumentIds.has(instrumentId)) {
        summary.skipped++
        continue
      }

      const { error: pe } = await supabase
        .from('positions')
        .insert({
          user_id:          user.id,
          instrument_id:    instrumentId,
          quantity:         row.quantity,
          average_price:    row.average_price,
          currency:         (row.currency as CurrencyCode) ?? 'EUR',
          broker:           row.broker,
          acquisition_date: row.acquisition_date,
          status:           'active',
        })
      if (pe) {
        summary.errors.push({ isin: row.isin, reason: `Insert position : ${pe.message}` })
        continue
      }
      userInstrumentIds.add(instrumentId)
      summary.imported++
    } catch (e) {
      summary.errors.push({ isin: row.isin, reason: (e as Error).message })
    }
  }

  return ok(summary)
})
