/**
 * Édition / suppression de transactions historiques — cœur métier pur (Sprint 3).
 *
 * La table `positions` est la SOURCE DE VÉRITÉ (`quantity`, `average_price`),
 * et le journal `transactions` en est le reflet best-effort. Quand on édite ou
 * supprime une transaction, on doit recalculer la cohérence de la position
 * impactée (CUMP / PRU) à partir du ledger complet — mais SEULEMENT si le
 * ledger reconcilie déjà avec la position stockée. Sinon on refuse l'opération
 * pour ne JAMAIS écraser silencieusement des données réelles.
 *
 * Ce module est 100 % pur et testable : il ne touche ni à Supabase ni au réseau.
 * Il réutilise `computeRunningCump` (moteur CUMP déjà éprouvé) pour le calcul
 * financier, et ajoute :
 *   - l'adaptateur de vocabulaire DB → CUMP (`purchase`→`buy`, `sale`→`sell`) ;
 *   - le garde-fou « ledger désynchronisé » (pré-condition) ;
 *   - la validation d'invariant « une vente ne peut pas survendre » ;
 *   - le mapping `realized_pnl` par identifiant de transaction.
 *
 * Le résultat (`finalQty`, `finalPru`, `realizedUpdates`) est ensuite appliqué
 * ATOMIQUEMENT côté serveur via l'RPC `apply_transaction_mutation`.
 */

import { computeRunningCump, type NormalizedTransaction } from './csvImport'

/**
 * Tolérance de réconciliation quantité ledger ↔ position.
 *
 * 1e-6 couvre les actions/ETF (quantités entières ou décimales courantes) et la
 * grande majorité des cryptos. Au-delà, on considère le journal désynchronisé.
 */
export const POSITION_QUANTITY_EPSILON = 1e-6

/** Types DB éditables depuis le portefeuille (sous-ensemble de `TransactionType`). */
export type DbTxType = 'purchase' | 'sale' | 'dividend'

/** Vrai si le type DB est éditable/supprimable depuis la fiche position. */
export function isEditableDbType(t: string): t is DbTxType {
  return t === 'purchase' || t === 'sale' || t === 'dividend'
}

/**
 * Adaptateur de vocabulaire DB → CUMP.
 *   - `purchase` → `buy`
 *   - `sale`     → `sell`
 *   - `dividend` → `dividend`
 * (Inverse de `mapNormalizedToDbType` dans import-transactions.ts.)
 */
export function mapDbToCumpType(t: DbTxType): NormalizedTransaction['transaction_type'] {
  switch (t) {
    case 'purchase': return 'buy'
    case 'sale':     return 'sell'
    case 'dividend': return 'dividend'
  }
}

/** Ligne de ledger telle que chargée depuis la table `transactions`. */
export interface LedgerTx {
  id:               string
  transaction_type: DbTxType
  quantity:         number | null
  unit_price:       number | null
  fees:             number | null
  /** ISO timestamp (`executed_at`). Seule la date (10 premiers car.) sert au tri CUMP. */
  executed_at:      string
  realized_pnl:     number | null
}

/** Champs modifiables d'une transaction (le type N'est PAS modifiable — voir route). */
export interface TxEditPatch {
  quantity?:    number | null
  unit_price?:  number | null
  fees?:        number | null
  executed_at?: string
}

/** Opération demandée sur le ledger. */
export type EditOp =
  | { kind: 'update'; txId: string; patch: TxEditPatch }
  | { kind: 'delete'; txId: string }

/** Une ré-écriture de `realized_pnl` à appliquer à une transaction donnée. */
export interface RealizedUpdate {
  id:           string
  realized_pnl: number | null
}

/** Résultat discriminé du recalcul. */
export type RecomputeResult =
  | { status: 'not_found' }
  /** Le ledger actuel ne reconcilie pas avec la position stockée → on refuse. */
  | { status: 'ledger_desync'; storedQty: number; recomputedQty: number; gap: number }
  /** L'opération rendrait une vente invalide (survente à un instant donné). */
  | { status: 'invalid_sale'; date: string; heldQty: number; sellQty: number }
  /** OK : nouvel état cohérent prêt à être appliqué atomiquement. */
  | {
      status:          'ok'
      finalQty:        number
      finalPru:        number
      realizedUpdates: RealizedUpdate[]
    }

/** Date (YYYY-MM-DD) servant au tri chronologique CUMP. */
function dayKey(isoOrDate: string): string {
  return isoOrDate.slice(0, 10)
}

/** Convertit une ligne de ledger en `NormalizedTransaction` minimale pour le CUMP. */
function toNormalized(tx: LedgerTx): NormalizedTransaction {
  return {
    isin:             null,
    ticker:           null,
    name:             '',
    asset_class:      'stock',
    transaction_type: mapDbToCumpType(tx.transaction_type),
    date:             dayKey(tx.executed_at),
    quantity:         Number(tx.quantity ?? 0),
    unit_price:       Number(tx.unit_price ?? 0),
    currency:         'EUR',
    fees:             Number(tx.fees ?? 0),
    broker:           'generic',
    confidence:       'high',
    raw_row:          {},
  }
}

/** Applique un patch sur une copie de la ligne (champs définis uniquement). */
function applyPatch(tx: LedgerTx, patch: TxEditPatch): LedgerTx {
  return {
    ...tx,
    quantity:    patch.quantity    !== undefined ? patch.quantity    : tx.quantity,
    unit_price:  patch.unit_price   !== undefined ? patch.unit_price   : tx.unit_price,
    fees:        patch.fees         !== undefined ? patch.fees         : tx.fees,
    executed_at: patch.executed_at !== undefined ? patch.executed_at : tx.executed_at,
  }
}

/** Tri chronologique stable identique à celui de `computeRunningCump`. */
function sortChrono(ledger: LedgerTx[]): LedgerTx[] {
  return [...ledger].sort((a, b) => dayKey(a.executed_at).localeCompare(dayKey(b.executed_at)))
}

/**
 * Valide l'invariant « la quantité détenue ne devient jamais négative » :
 * aucune vente ne peut porter sur plus de parts que détenues à sa date.
 * Renvoie la première vente fautive, ou `null` si tout est cohérent.
 *
 * Contrairement à `computeRunningCump` (qui CLAMPE les surventes), ici on
 * REJETTE : c'est précisément le garde-fou qui rend une édition/suppression sûre.
 */
function findInvalidSale(
  sorted: LedgerTx[],
): { date: string; heldQty: number; sellQty: number } | null {
  let held = 0
  for (const tx of sorted) {
    if (tx.transaction_type === 'purchase') {
      held += Number(tx.quantity ?? 0)
    } else if (tx.transaction_type === 'sale') {
      const sellQty = Number(tx.quantity ?? 0)
      if (held - sellQty < -POSITION_QUANTITY_EPSILON) {
        return { date: dayKey(tx.executed_at), heldQty: held, sellQty }
      }
      held -= sellQty
    }
    // dividend : sans effet sur la quantité détenue.
  }
  return null
}

/**
 * Recalcule l'état d'une position après édition/suppression d'une transaction.
 *
 * Étapes :
 *   1. localise la transaction cible (404 si absente) ;
 *   2. PRÉ-CONDITION — le ledger actuel doit reconcilier avec `storedQty`
 *      (sinon `ledger_desync`, on refuse pour ne pas corrompre la position) ;
 *   3. construit le nouveau ledger (patch appliqué, ou ligne retirée) ;
 *   4. valide l'invariant de non-survente (sinon `invalid_sale`) ;
 *   5. recalcule `finalQty` / `finalPru` via `computeRunningCump` et dérive
 *      le `realized_pnl` de chaque transaction (valeur pour les ventes, `null`
 *      sinon) — la liste couvre TOUTES les lignes restantes pour que l'RPC
 *      remette à `null` ce qui doit l'être (contrainte `chk_realized_pnl_sale_only`).
 */
export function recomputeLedgerAfterEdit(input: {
  ledger:    LedgerTx[]
  storedQty: number
  op:        EditOp
}): RecomputeResult {
  const { ledger, storedQty, op } = input

  const target = ledger.find((t) => t.id === op.txId)
  if (!target) return { status: 'not_found' }

  // ── 2. Garde-fou : le ledger actuel reconcilie-t-il avec la position ? ──
  const currentCump = computeRunningCump(ledger.map(toNormalized))
  const gap = Math.abs(currentCump.finalQty - storedQty)
  if (gap > POSITION_QUANTITY_EPSILON) {
    return {
      status:        'ledger_desync',
      storedQty,
      recomputedQty: currentCump.finalQty,
      gap,
    }
  }

  // ── 3. Nouveau ledger ──
  const newLedger: LedgerTx[] =
    op.kind === 'delete'
      ? ledger.filter((t) => t.id !== op.txId)
      : ledger.map((t) => (t.id === op.txId ? applyPatch(t, op.patch) : t))

  const sorted = sortChrono(newLedger)

  // ── 4. Invariant de non-survente ──
  const invalid = findInvalidSale(sorted)
  if (invalid) {
    return { status: 'invalid_sale', ...invalid }
  }

  // ── 5. Recompute + realized_pnl par id ──
  const cump = computeRunningCump(sorted.map(toNormalized))
  // `trail[i]` correspond à `sorted[i]` : l'entrée est déjà triée et le tri
  // interne de computeRunningCump est stable → l'ordre est préservé.
  const realizedUpdates: RealizedUpdate[] = sorted.map((tx, i) => ({
    id:           tx.id,
    realized_pnl: tx.transaction_type === 'sale' ? (cump.trail[i]?.realizedPnl ?? null) : null,
  }))

  return {
    status:          'ok',
    finalQty:        cump.finalQty,
    finalPru:        cump.finalPru,
    realizedUpdates,
  }
}
