/**
 * Helper de batching pour traiter une liste d'items en parallèle par lots.
 *
 * Sprint 1 — B7 : avant, /api/email/monthly-report itérait sequentiellement
 * (~2 s/user). Avec 500 users → 1000 s = timeout Edge Function.
 *
 * Maintenant : lots de N items en parallèle, avec un délai entre les lots
 * pour respecter les rate-limits externes (Resend 100 req/s).
 *
 * Conventions :
 *   - Chaque item est traité par `fn` qui peut throw. Les erreurs sont
 *     capturées et reportées dans `results` ; un échec n'interrompt jamais
 *     les lots suivants.
 *   - `delayMs` ne s'applique PAS après le dernier lot.
 *   - `onBatch` (optionnel) est appelé après chaque lot pour permettre du
 *     logging dev-only via devLog.
 */
import { devLog } from '../utils/devLog'

export interface BatchOptions {
  /** Taille d'un lot. Défaut 10 (compromis parallélisme / rate-limit). */
  batchSize?: number
  /** Délai en ms entre deux lots. Défaut 100 ms = ≤100 req/s (Resend free). */
  delayMs?: number
  /** Callback de progression : (batchIdx, totalBatches, succeeded, failed). */
  onBatch?: (batchIdx: number, totalBatches: number, succeeded: number, failed: number) => void
  /** Sleep injectable pour les tests (par défaut setTimeout réel). */
  sleep?: (ms: number) => Promise<void>
}

export interface BatchResult<T, R> {
  item:     T
  ok:       true
  value:    R
}
export interface BatchError<T> {
  item:     T
  ok:       false
  error:    string
}
export type BatchOutcome<T, R> = BatchResult<T, R> | BatchError<T>

export interface BatchSummary<T, R> {
  total:        number
  succeeded:    number
  failed:       number
  results:      BatchOutcome<T, R>[]
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function runInBatches<T, R>(
  items: ReadonlyArray<T>,
  fn:    (item: T) => Promise<R>,
  opts:  BatchOptions = {},
): Promise<BatchSummary<T, R>> {
  const batchSize = Math.max(1, opts.batchSize ?? 10)
  const delayMs   = Math.max(0, opts.delayMs   ?? 100)
  const sleep     = opts.sleep ?? defaultSleep

  const results: BatchOutcome<T, R>[] = []
  let succeeded = 0
  let failed    = 0

  const totalBatches = Math.ceil(items.length / batchSize)

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const settled = await Promise.all(
      batch.map(async (item): Promise<BatchOutcome<T, R>> => {
        try {
          const value = await fn(item)
          return { item, ok: true, value }
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          return { item, ok: false, error }
        }
      }),
    )
    let batchSucceeded = 0
    let batchFailed    = 0
    for (const r of settled) {
      results.push(r)
      if (r.ok) { succeeded++; batchSucceeded++ }
      else      { failed++;    batchFailed++ }
    }

    const batchIdx = Math.floor(i / batchSize) + 1
    devLog(`[batch] ${batchIdx}/${totalBatches} envoye (${batchSucceeded} ok / ${batchFailed} ko)`)
    opts.onBatch?.(batchIdx, totalBatches, batchSucceeded, batchFailed)

    // Pause entre lots (sauf après le dernier) pour respecter le rate-limit.
    const hasNext = i + batchSize < items.length
    if (hasNext && delayMs > 0) await sleep(delayMs)
  }

  return { total: items.length, succeeded, failed, results }
}
