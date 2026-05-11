/**
 * Conversion transactions DB → CashFlow[] pour analytics portefeuille.
 *
 * Conventions :
 *   - `transactions.amount` est dans la perspective du compte cash de l'utilisateur :
 *       achat   (purchase) → amount NÉGATIF (cash sort du compte)
 *       vente   (sale)     → amount POSITIF (cash entre)
 *   - `CashFlow.amount` est dans la perspective DU PORTEFEUILLE :
 *       apport  (deposit) → POSITIF (cash entre dans le portefeuille)
 *       retrait (withdraw)→ NÉGATIF
 *
 *   Donc `cashFlow.amount = -transaction.amount` pour les deux types.
 *
 * On ne garde QUE les transactions liées au portefeuille (position_id ou
 * instrument_id non null) et de type purchase / sale. Dividendes, intérêts,
 * fees, taxes sont ignorés : ils n'affectent pas le capital apporté, juste
 * la valeur de marché (déjà reflétée dans les snapshots).
 */

import type { CashFlow } from './analytics'

export interface TxRow {
  transaction_type: string
  amount:           number
  executed_at:      string  // ISO timestamp
  position_id?:     string | null
  instrument_id?:   string | null
}

/**
 * Filtre + mappe les transactions vers des cash flows utilisables par
 * computeTWR / computeMWR. Tri chronologique croissant.
 */
export function transactionsToCashFlows(rows: TxRow[]): CashFlow[] {
  const flows = rows
    .filter((t) => {
      // Doit toucher le portefeuille
      const touchesPortfolio = !!(t.position_id || t.instrument_id)
      if (!touchesPortfolio) return false
      // Doit être un mouvement d'achat ou de vente
      return t.transaction_type === 'purchase' || t.transaction_type === 'sale'
    })
    .map<CashFlow>((t) => ({
      date:   t.executed_at.slice(0, 10),  // tronque à yyyy-MM-dd
      amount: -Number(t.amount),            // inversion de la convention
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return flows
}
