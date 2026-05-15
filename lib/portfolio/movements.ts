/**
 * Détection automatique des mouvements de capital lors de l'édition
 * d'une position.
 *
 * Quand l'utilisateur modifie quantity / average_price depuis la modale
 * d'édition, il fait implicitement l'une de ces trois choses :
 *
 *   1. Achat complémentaire (quantité augmente)
 *      → transaction 'purchase' pour le delta. Le prix unitaire est
 *        déduit du coût marginal : (new_qty * new_pru - old_qty * old_pru) / delta_qty.
 *        C'est l'ajustement comptable cohérent : la nouvelle moyenne pondérée
 *        est respectée par construction.
 *
 *   2. Vente partielle (quantité diminue)
 *      → transaction 'sale' pour |delta_qty|. Le prix unitaire est :
 *        - lastMarketPrice si fourni (ce qui donne une PNL réalisée correcte)
 *        - sinon l'ancien PRU (flux de cash neutre, pas de PNL réalisée)
 *
 *   3. Correction de PRU sans flux (quantité identique, PRU change)
 *      → null : aucune transaction. Pure correction comptable.
 *
 * Pourquoi un helper pur séparé :
 *   - logique non-triviale à tester sans Supabase
 *   - réutilisable côté UI (preview de la transaction avant submit)
 */

import type { CurrencyCode } from '@/types/database.types'

/**
 * Tolérance numérique pour détecter "pas de changement". Quantités décimales
 * et prix en float introduisent du bruit à 1e-9 ; on considère identique
 * en-dessous de 1e-6 (= 0,000001 part, négligeable pour tout usage).
 */
const EPSILON = 1e-6

export interface PositionSnapshot {
  quantity:      number
  averagePrice:  number
  currency:      CurrencyCode
  instrumentId:  string
  positionId:    string
}

export interface MovementInput {
  before:           PositionSnapshot
  after:            { quantity: number; averagePrice: number; currency?: CurrencyCode }
  /** Dernier prix de marché connu, sert de référence pour les ventes. */
  lastMarketPrice?: number | null
  /** Override explicite : date du mouvement (sinon now). */
  executedAt?:     Date
}

export type MovementType = 'purchase' | 'sale'

export interface MovementResult {
  type:           MovementType
  quantity:       number   // toujours positif (le signe est porté par `type`)
  unitPrice:      number
  amount:         number   // signé : négatif pour purchase (sortie cash), positif pour sale
  currency:       CurrencyCode
  instrumentId:   string
  positionId:     string
  executedAt:     Date
  label:          string
}

/**
 * Calcule la transaction implicite associée à une édition de position.
 *
 * @returns null si pas de mouvement (qty identique, ou les deux identiques)
 */
export function computePositionMovement(input: MovementInput): MovementResult | null {
  const { before, after, lastMarketPrice, executedAt } = input

  const oldQty = before.quantity
  const newQty = after.quantity
  const oldPru = before.averagePrice
  const newPru = after.averagePrice

  const deltaQty = newQty - oldQty
  if (Math.abs(deltaQty) < EPSILON) {
    // Quantité identique : on ne tracke pas les corrections de PRU isolées
    // (pas de flux de cash réel à enregistrer).
    return null
  }

  const currency = (after.currency ?? before.currency) as CurrencyCode
  const when     = executedAt ?? new Date()

  if (deltaQty > 0) {
    // Achat complémentaire : prix unitaire déduit pour respecter la nouvelle moyenne.
    const deltaCost  = newQty * newPru - oldQty * oldPru
    const unitPrice  = deltaCost / deltaQty
    return {
      type:         'purchase',
      quantity:     deltaQty,
      unitPrice,
      amount:       -deltaCost,           // sortie de cash
      currency,
      instrumentId: before.instrumentId,
      positionId:   before.positionId,
      executedAt:   when,
      label:        `Achat complémentaire ${deltaQty} × ${formatPrice(unitPrice)} (édition position)`,
    }
  }

  // Vente partielle (deltaQty < 0)
  const soldQty   = -deltaQty
  const unitPrice = (lastMarketPrice && lastMarketPrice > 0) ? lastMarketPrice : oldPru
  const amount    = soldQty * unitPrice   // entrée de cash
  return {
    type:         'sale',
    quantity:     soldQty,
    unitPrice,
    amount,
    currency,
    instrumentId: before.instrumentId,
    positionId:   before.positionId,
    executedAt:   when,
    label:        `Vente partielle ${soldQty} × ${formatPrice(unitPrice)} (édition position)`,
  }
}

function formatPrice(p: number): string {
  return p.toFixed(p < 10 ? 4 : 2)
}
