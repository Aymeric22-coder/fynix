/**
 * TWR par enveloppe (V2.4 P0.7).
 *
 * Étend le moteur TWR V1.3 pour calculer un TWR **par enveloppe financière**
 * (PEA, CTO, AV, PER, crypto wallet…) plutôt qu'un TWR agrégé du portefeuille.
 *
 * **Pourquoi par enveloppe et pas par position atomique ?**
 *   Sinon on aurait 17 lignes au lieu de 4-5 dans le classement Champions /
 *   Casseroles — incohérent avec la cible V2.3 (top consolidé par enveloppe).
 *   Une enveloppe = un bucket cohérent du point de vue fiscal et utilisateur.
 *
 * **Pureté** : aucun I/O. La granularité est imposée par les inputs
 * (`positions[].envelopeId` doit être renseigné par le loader).
 */

import { computeTwr, type TwrResult } from '@/lib/finance/twr'
import {
  buildTwrSegments,
  type TransactionForTwr,
  type PositionForSegments,
} from './transaction-segments'

/** Résultat d'un TWR pour une enveloppe donnée. */
export interface EnvelopeTwrResult {
  /** ID de l'enveloppe (`null` = positions sans envelope_id renseigné). */
  envelopeId:        string | null
  /** Libellé prêt à afficher (« PEA », « CTO Bourso », « AV Linxea »…). */
  envelopeLabel:     string
  /** TWR annualisé en % (positif = gain, négatif = perte). */
  twrAnnualisePct:   number
  /** TWR cumulé en % (non annualisé). */
  twrCumulePct:      number
  /** Nombre de jours de détention (du 1er flux à `asOfDate`). */
  holdingDays:       number
  /** Nombre de segments effectivement utilisés par le moteur TWR. */
  segmentCount:      number
  /** `true` si `holdingDays ∈ [90, 365)` — annualisation extrapolée. */
  extrapole:         boolean
  /** Nombre de positions actives de l'enveloppe (info indicative). */
  positionCount:     number
}

export interface ComputeTwrPerEnvelopeInput {
  transactions: TransactionForTwr[]
  positions:    PositionForSegments[]
  /** Map `envelopeId → libellé`. Les enveloppes absentes utilisent l'`envelopeId` brut. */
  envelopeLabels: Map<string, string>
  asOfDate:     Date
  /**
   * Seuil minimum de détention (en jours) pour qu'une enveloppe figure
   * dans le résultat. Défaut 90 j (cf. décision V1.0 §5.2 + brief V2.4).
   * Les enveloppes plus jeunes sont exclues du retour (biais statistique).
   */
  minHoldingDays?: number
}

const DEFAULT_MIN_HOLDING_DAYS = 90
const DAY_MS = 86_400_000

/**
 * Calcule le TWR annualisé par enveloppe pour le classement Champions /
 * Casseroles. Les enveloppes avec un historique < `minHoldingDays` sont
 * exclues du retour.
 */
export function computeTwrPerEnvelope(input: ComputeTwrPerEnvelopeInput): EnvelopeTwrResult[] {
  const minDays = input.minHoldingDays ?? DEFAULT_MIN_HOLDING_DAYS

  // Groupement par envelopeId (null = "Sans enveloppe").
  const envelopeIds = new Set<string | null>()
  const positionsByEnvelope = new Map<string | null, PositionForSegments[]>()
  for (const p of input.positions) {
    const key = p.envelopeId ?? null
    envelopeIds.add(key)
    const arr = positionsByEnvelope.get(key) ?? []
    arr.push(p)
    positionsByEnvelope.set(key, arr)
  }

  const results: EnvelopeTwrResult[] = []

  for (const envId of envelopeIds) {
    const positions = positionsByEnvelope.get(envId) ?? []
    const positionIds = new Set(positions.map((p) => p.positionId))

    // Filtre des transactions qui touchent une position de l'enveloppe.
    const transactions = input.transactions.filter((t) => positionIds.has(t.positionId))

    // Assemblage des segments pour cette enveloppe.
    const segments = buildTwrSegments({
      transactions,
      positions,
      asOfDate: input.asOfDate,
    })

    // Détermination de la durée de détention : 1er flux → asOfDate.
    // Si aucun flux ET aucun fallback : on ignore l'enveloppe.
    const firstTxDate = pickFirstTransactionDate(transactions, positions)
    if (firstTxDate === null) continue

    const holdingDays = Math.round((input.asOfDate.getTime() - firstTxDate) / DAY_MS)
    if (holdingDays < minDays) continue

    const twr: TwrResult | null = computeTwr(segments)
    if (twr === null) continue

    const envelopeLabel = envId === null
      ? 'Sans enveloppe'
      : input.envelopeLabels.get(envId) ?? envId

    results.push({
      envelopeId:      envId,
      envelopeLabel,
      twrAnnualisePct: twr.twrAnnualisePct,
      twrCumulePct:    twr.twrCumulePct,
      holdingDays,
      segmentCount:    twr.segmentCount,
      extrapole:       twr.extrapole,
      positionCount:   positions.filter((p) => p.currentMvEur !== null).length,
    })
  }

  return results
}

/**
 * Renvoie la date (en ms) de la première « ancre » disponible pour le
 * portefeuille d'une enveloppe :
 *   - 1ʳᵉ transaction historisée ou
 *   - 1ʳᵉ acquisition_date de fallback (positions legacy sans transaction).
 *
 * Renvoie `null` si aucune ancre n'est disponible (l'enveloppe est alors
 * exclue du classement).
 */
function pickFirstTransactionDate(
  transactions: TransactionForTwr[],
  positions:    PositionForSegments[],
): number | null {
  let minMs = Number.POSITIVE_INFINITY
  for (const t of transactions) {
    const ms = new Date(t.executedAt).getTime()
    if (Number.isFinite(ms) && ms < minMs) minMs = ms
  }
  for (const p of positions) {
    if (!p.acquisitionDate) continue
    const ms = new Date(p.acquisitionDate).getTime()
    if (Number.isFinite(ms) && ms < minMs) minMs = ms
  }
  return Number.isFinite(minMs) ? minMs : null
}
