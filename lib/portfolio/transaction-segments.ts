/**
 * Assembleur de segments TWR à partir de transactions de portefeuille (V1.3 P0.3).
 *
 * Reconstruit les `TwrSegment[]` consommés par `computeTwr()` à partir de la
 * liste des `transactions` (table append-only) + l'état courant des positions.
 *
 * **Sous-option (b) retenue** (cf. V1.3 cadrage) : aucune table d'historique
 * de prix séparée n'est consultée. Les prix intermédiaires sont reconstruits
 * uniquement depuis :
 *   - `transaction.unitPriceEur` aux dates de transaction (ancres exactes)
 *   - `position.currentMvEur / currentQuantity` à `asOfDate` (point final)
 *   - interpolation linéaire entre 2 ancres pour les dates intermédiaires
 *
 * **Périmètre** : positions cotées uniquement. L'immobilier et le cash sont
 * hors scope du TWR (ils relèvent du rendement net pondéré / taux servi).
 *
 * **Traitement des dividendes** : un `dividend` n'est PAS un flux externe.
 * Il représente un retour interne au portefeuille (cash distribué qui reste
 * dans l'enveloppe ou est réinvesti). En V1.3, les dividendes sont **ignorés
 * du calcul de segmentation** — leur impact sur la performance se manifeste
 * mécaniquement via la `currentMvEur` finale (le cash distribué reste dans
 * la poche, donc la MV agrège implicitement). Une future P1.X pourra
 * distinguer dividendes réinvestis vs dividendes sortis.
 */

import type { TwrSegment } from '@/lib/finance/twr'

// ─────────────────────────────────────────────────────────────────────
// Types publics (sous-ensemble dédié — cf. décision « shape réduit »)
// ─────────────────────────────────────────────────────────────────────

export type TransactionTypeForTwr = 'purchase' | 'sale' | 'dividend'

export interface TransactionForTwr {
  executedAt:   string                  // ISO date (YYYY-MM-DD ou ISO datetime)
  type:         TransactionTypeForTwr
  positionId:   string
  quantity:     number                  // toujours ≥ 0 (le sens vient du type)
  unitPriceEur: number                  // prix unitaire EUR à la date de transaction
  amountEur:    number                  // = quantity × unitPriceEur (≥ 0)
}

export interface PositionForSegments {
  positionId:        string
  /** MV courante de la position (€). `null` = position non valorisée (ignorée). */
  currentMvEur:      number | null
  /** Quantité actuellement détenue (pour reconstruire le prix actuel). */
  currentQuantity:   number
  /** Fallback acquisition_date (cf. Phase 5.2 trou n° 1) si aucune transaction. */
  acquisitionDate?:  string
  /** Fallback average_price (€) si aucune transaction historisée. */
  averagePriceEur?:  number
  /** V2.4 — Enveloppe de la position (PEA / CTO / AV / PER / crypto…).
   *  Permet à `twr-per-envelope.ts` de calculer un TWR par enveloppe. */
  envelopeId?:       string | null
}

export interface BuildSegmentsInput {
  transactions: TransactionForTwr[]
  positions:    PositionForSegments[]
  /** Date d'observation finale (typiquement « now » côté serveur). */
  asOfDate:     Date
}

// ─────────────────────────────────────────────────────────────────────
// Implémentation
// ─────────────────────────────────────────────────────────────────────

interface PortfolioEvent {
  date:        Date
  valueBefore: number
  valueAfter:  number
}

/**
 * Construit la liste des segments TWR pour un portefeuille.
 *
 * Algorithme :
 *   1. Génération de transactions synthétiques pour les positions avec
 *      fallback (`acquisitionDate` + `averagePriceEur`) mais sans transaction.
 *   2. Tri chronologique des transactions, filtrage des dividendes (cf. note).
 *   3. Pour chaque date de transaction T_i, valorisation du portefeuille
 *      `valueBefore` et `valueAfter` (en intégrant le flux de T_i).
 *   4. Construction des segments {after(T_i) → before(T_{i+1})} +
 *      segment final {after(T_n) → currentMv_total(asOfDate)}.
 */
export function buildTwrSegments(input: BuildSegmentsInput): TwrSegment[] {
  const positionsMap = new Map(input.positions.map((p) => [p.positionId, p]))

  // ── 1. Transactions synthétiques pour les positions avec fallback ────
  const allTxs: TransactionForTwr[] = [...input.transactions]
  const positionsWithTx = new Set(input.transactions.map((t) => t.positionId))

  for (const pos of input.positions) {
    if (positionsWithTx.has(pos.positionId)) continue
    if (pos.currentMvEur === null || pos.currentQuantity <= 0) continue
    if (!pos.acquisitionDate || pos.averagePriceEur === undefined) continue

    allTxs.push({
      executedAt:   pos.acquisitionDate,
      type:         'purchase',
      positionId:   pos.positionId,
      quantity:     pos.currentQuantity,
      unitPriceEur: pos.averagePriceEur,
      amountEur:    pos.currentQuantity * pos.averagePriceEur,
    })
  }

  // ── 2. Tri + filtrage dividendes ─────────────────────────────────────
  const eventTxs = allTxs
    .filter((t) => t.type !== 'dividend')
    .sort((a, b) => a.executedAt.localeCompare(b.executedAt))

  if (eventTxs.length === 0) return []

  // ── 3. Reconstruction valeur du portefeuille à chaque date ────────────
  const events: PortfolioEvent[] = []
  /** Quantité détenue par position au cours de l'itération. */
  const qtyByPos = new Map<string, number>()

  for (const tx of eventTxs) {
    const txDate = new Date(tx.executedAt)

    // (a) Valeur du portefeuille AVANT cette transaction = somme sur toutes
    //     positions déjà actives (qty > 0) de (qty × prix_à_txDate).
    let valueBefore = 0
    for (const [posId, qty] of qtyByPos.entries()) {
      if (qty <= 0) continue
      const pos = positionsMap.get(posId)
      if (!pos || pos.currentMvEur === null) continue
      const priceAtDate = computePriceAtDate(
        posId,
        txDate,
        eventTxs,
        pos,
        input.asOfDate,
      )
      valueBefore += qty * priceAtDate
    }

    // (b) Application du flux + calcul valueAfter.
    const prevQty = qtyByPos.get(tx.positionId) ?? 0
    const newQty  = tx.type === 'purchase'
      ? prevQty + tx.quantity
      : prevQty - tx.quantity   // 'sale'

    // valueAfter = valueBefore + (purchase → +amountEur) OU (sale → −amountEur)
    const cashFlow = tx.type === 'purchase' ? tx.amountEur : -tx.amountEur
    const valueAfter = valueBefore + cashFlow

    qtyByPos.set(tx.positionId, Math.max(0, newQty))

    events.push({ date: txDate, valueBefore, valueAfter })
  }

  // ── 4. Construction des segments ─────────────────────────────────────
  const segments: TwrSegment[] = []
  for (let i = 0; i < events.length - 1; i++) {
    const curr = events[i]!
    const next = events[i + 1]!
    segments.push({
      startDate:     curr.date,
      endDate:       next.date,
      startValueEur: curr.valueAfter,
      endValueEur:   next.valueBefore,
    })
  }

  // Segment final : dernière transaction → asOfDate (valeur = somme MV courantes)
  const lastEvent = events[events.length - 1]!
  const finalValue = input.positions.reduce(
    (s, p) => s + (p.currentMvEur ?? 0),
    0,
  )

  if (input.asOfDate.getTime() > lastEvent.date.getTime()) {
    segments.push({
      startDate:     lastEvent.date,
      endDate:       input.asOfDate,
      startValueEur: lastEvent.valueAfter,
      endValueEur:   finalValue,
    })
  }

  return segments
}

/**
 * Calcule le prix d'une position à une date arbitraire par interpolation
 * linéaire entre les ancres connues (transactions de cette position + prix
 * actuel dérivé de `currentMvEur / currentQuantity`).
 */
function computePriceAtDate(
  positionId: string,
  date:       Date,
  allEventTxs: TransactionForTwr[],
  position:   PositionForSegments,
  asOfDate:   Date,
): number {
  const txsOfPos = allEventTxs
    .filter((t) => t.positionId === positionId)
    .sort((a, b) => a.executedAt.localeCompare(b.executedAt))

  // Si la date correspond exactement à une transaction de la position, on
  // utilise son unit_price (ancre exacte).
  const dateMs = date.getTime()
  const exact = txsOfPos.find((t) => new Date(t.executedAt).getTime() === dateMs)
  if (exact) return exact.unitPriceEur

  // Sinon, interpolation entre la transaction la plus récente ≤ date et la
  // prochaine ancre connue (transaction suivante ou prix actuel).
  const prevTx = [...txsOfPos].reverse().find((t) => new Date(t.executedAt).getTime() < dateMs)
  if (!prevTx) {
    // Date antérieure à la première transaction de la position → 0 (qty = 0)
    return 0
  }

  const nextTx = txsOfPos.find((t) => new Date(t.executedAt).getTime() > dateMs)

  // Ancre haute : soit la transaction suivante, soit le prix actuel.
  let highDate: number
  let highPrice: number
  if (nextTx) {
    highDate  = new Date(nextTx.executedAt).getTime()
    highPrice = nextTx.unitPriceEur
  } else {
    highDate  = asOfDate.getTime()
    highPrice = (position.currentMvEur !== null && position.currentQuantity > 0)
      ? position.currentMvEur / position.currentQuantity
      : prevTx.unitPriceEur   // pas de prix actuel → flat
  }

  const lowDate  = new Date(prevTx.executedAt).getTime()
  const lowPrice = prevTx.unitPriceEur
  if (highDate <= lowDate) return lowPrice

  const ratio = (dateMs - lowDate) / (highDate - lowDate)
  return lowPrice + (highPrice - lowPrice) * ratio
}
