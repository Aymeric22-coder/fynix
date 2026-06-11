/**
 * Édition / suppression d'une transaction historique (Sprint 3).
 *
 * Architecture : la table `positions` est la SOURCE DE VÉRITÉ. Toute mutation
 * d'une transaction rattachée à une position déclenche un recalcul CUMP/PRU de
 * la position impactée + une réécriture des `realized_pnl` des ventes restantes.
 *
 * Garde-fous (cf. lib/portfolio/transaction-edit.ts) :
 *   - 404 si la transaction n'existe pas / n'appartient pas à l'utilisateur ;
 *   - 422 si la transaction n'est pas rattachée à une position ou n'est pas
 *     d'un type éditable (purchase / sale / dividend) ;
 *   - 409 si le journal de la position ne reconcilie plus avec la quantité
 *     stockée (ledger désynchronisé) — on refuse plutôt que corrompre ;
 *   - 422 si l'opération rendrait une vente invalide (survente à une date).
 *
 * L'application est ATOMIQUE via l'RPC `apply_transaction_mutation` (migration
 * 056) : mutation de la ligne + position + realized_pnl dans une seule
 * transaction Postgres.
 *
 * ⚠️ Snapshots historiques laissés intacts (décision Sprint 3 / option F) — le
 *    prochain snapshot quotidien capturera l'état corrigé.
 *
 * Note : la création de transactions (POST /api/transactions) reste inchangée.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import {
  recomputeLedgerAfterEdit,
  isEditableDbType,
  type LedgerTx,
  type TxEditPatch,
  type DbTxType,
  type RealizedUpdate,
} from '@/lib/portfolio/transaction-edit'
import type { SupabaseClient, User } from '@supabase/supabase-js'

type Ctx = { params: Promise<{ id: string }> }

const TARGET_SELECT =
  'id, transaction_type, quantity, unit_price, fees, executed_at, realized_pnl, position_id, currency'
const LEDGER_SELECT =
  'id, transaction_type, quantity, unit_price, fees, executed_at, realized_pnl'

interface EditBody {
  quantity?:   number | string | null
  unit_price?: number | string | null
  fees?:       number | string | null
  amount?:     number | string | null
  currency?:   string | null
  date?:       string | null
}

interface TargetTx {
  id:               string
  transaction_type: string
  position_id:      string | null
}

interface PositionRow {
  id:            string
  quantity:      number
  average_price: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function toIso(date?: string | null): string | undefined {
  if (!date) return undefined
  return `${date.slice(0, 10)}T00:00:00.000Z`
}

function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Charge la transaction cible + le ledger complet + la position impactée. */
type Loaded =
  | { ok: false; response: ReturnType<typeof err> }
  | { ok: true; target: TargetTx; ledger: LedgerTx[]; position: PositionRow }

async function loadContext(
  supabase: SupabaseClient,
  userId:   string,
  txId:     string,
): Promise<Loaded> {
  const { data: target, error: tErr } = await supabase
    .from('transactions')
    .select(TARGET_SELECT)
    .eq('id', txId)
    .eq('user_id', userId)
    .maybeSingle()

  if (tErr) return { ok: false, response: err(tErr.message, 500) }
  if (!target) return { ok: false, response: err('Transaction introuvable.', 404) }
  if (!target.position_id) {
    return { ok: false, response: err("Cette transaction n'est pas rattachée à une position et n'est pas éditable ici.", 422) }
  }
  if (!isEditableDbType(target.transaction_type)) {
    return { ok: false, response: err('Ce type de transaction n\'est pas éditable depuis le portefeuille.', 422) }
  }

  const [ledgerRes, positionRes] = await Promise.all([
    supabase
      .from('transactions')
      .select(LEDGER_SELECT)
      .eq('user_id', userId)
      .eq('position_id', target.position_id),
    supabase
      .from('positions')
      .select('id, quantity, average_price')
      .eq('id', target.position_id)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (ledgerRes.error) return { ok: false, response: err(ledgerRes.error.message, 500) }
  if (positionRes.error) return { ok: false, response: err(positionRes.error.message, 500) }
  if (!positionRes.data) return { ok: false, response: err('Position introuvable.', 404) }

  // On ne garde que les types qui pèsent sur le CUMP (purchase / sale / dividend).
  const ledger = (ledgerRes.data ?? [])
    .filter((r) => isEditableDbType(r.transaction_type as string))
    .map((r) => ({
      id:               r.id as string,
      transaction_type: r.transaction_type as DbTxType,
      quantity:         r.quantity as number | null,
      unit_price:       r.unit_price as number | null,
      fees:             r.fees as number | null,
      executed_at:      r.executed_at as string,
      realized_pnl:     r.realized_pnl as number | null,
    }))

  const position: PositionRow = {
    id:            positionRes.data.id as string,
    quantity:      Number(positionRes.data.quantity),
    average_price: Number(positionRes.data.average_price),
  }

  return { ok: true, target: target as TargetTx, ledger, position }
}

type Built =
  | { ok: false; message: string }
  | { ok: true; patch: TxEditPatch; txJson: Record<string, unknown> }

/** Construit le patch (recompute) + le payload RPC à partir du corps + du type. */
function buildPatch(type: DbTxType, body: EditBody): Built {
  const executed_at = toIso(body.date)
  if (executed_at && executed_at.slice(0, 10) > today()) {
    return { ok: false, message: 'La date ne peut pas être future.' }
  }

  if (type === 'dividend') {
    const amount = num(body.amount)
    if (amount === undefined || amount <= 0) return { ok: false, message: 'Montant invalide (> 0).' }
    const txJson: Record<string, unknown> = { amount }
    if (body.currency) txJson.currency = body.currency
    if (executed_at) txJson.executed_at = executed_at
    const patch: TxEditPatch = {}
    if (executed_at) patch.executed_at = executed_at
    return { ok: true, patch, txJson }
  }

  // purchase / sale
  const quantity = num(body.quantity)
  const unit_price = num(body.unit_price)
  if (quantity === undefined || quantity <= 0) return { ok: false, message: 'Quantité invalide (> 0).' }
  if (unit_price === undefined || unit_price <= 0) return { ok: false, message: 'Prix unitaire invalide (> 0).' }
  const fees = type === 'purchase' ? (num(body.fees) ?? 0) : 0
  const amount = type === 'purchase' ? -(quantity * unit_price + fees) : quantity * unit_price

  const patch: TxEditPatch = { quantity, unit_price, fees }
  if (executed_at) patch.executed_at = executed_at

  const txJson: Record<string, unknown> = { quantity, unit_price, fees, amount }
  if (executed_at) txJson.executed_at = executed_at

  return { ok: true, patch, txJson }
}

function desyncMessage(storedQty: number, recomputedQty: number): string {
  const gap = Math.abs(storedQty - recomputedQty)
  const gapStr = Number.isInteger(gap) ? String(gap) : gap.toFixed(6).replace(/0+$/, '')
  return (
    `Édition désactivée : le journal de cette position n'est pas synchronisé avec ` +
    `la quantité actuelle (écart de ${gapStr} unité(s)). Pour corriger, ajoute une ` +
    `transaction d'ajustement via « Nouvelle transaction », puis réessaie.`
  )
}

function invalidSaleMessage(date: string, heldQty: number, sellQty: number): string {
  return (
    `Opération refusée : elle rendrait la vente du ${frDate(date)} invalide ` +
    `(quantité insuffisante au moment de la vente — ${heldQty} part(s) détenue(s) ` +
    `pour ${sellQty} vendue(s)).`
  )
}

/** Appelle l'RPC atomique et mappe les erreurs métier en codes HTTP. */
async function applyMutation(
  supabase:    SupabaseClient,
  userId:      string,
  txId:        string,
  op:          'update' | 'delete',
  positionId:  string,
  finalQty:    number,
  finalPru:    number,
  txJson:      Record<string, unknown> | null,
  realized:    RealizedUpdate[],
): Promise<{ ok: false; response: ReturnType<typeof err> } | { ok: true; data: unknown }> {
  const { data, error } = await supabase.rpc('apply_transaction_mutation', {
    p_user_id:     userId,
    p_tx_id:       txId,
    p_op:          op,
    p_position_id: positionId,
    p_new_qty:     finalQty,
    p_new_pru:     finalPru,
    p_tx:          txJson,
    p_pnl:         realized,
  })
  if (error) {
    if (error.message?.includes('TX_NOT_OWNED')) return { ok: false, response: err('Accès refusé.', 403) }
    if (error.message?.includes('TX_NOT_FOUND')) return { ok: false, response: err('Transaction introuvable.', 404) }
    return { ok: false, response: err(error.message, 500) }
  }
  return { ok: true, data }
}

// ─── PUT — édition ────────────────────────────────────────────────────────────

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await parseBody<EditBody>(req)
  if (!body) return err('Corps de requête invalide.')

  const supabase = await createServerClient()
  const loaded = await loadContext(supabase, user.id, id)
  if (!loaded.ok) return loaded.response
  const { target, ledger, position } = loaded

  const type = target.transaction_type as DbTxType
  const built = buildPatch(type, body)
  if (!built.ok) return err(built.message, 422)

  const result = recomputeLedgerAfterEdit({
    ledger,
    storedQty: position.quantity,
    op:        { kind: 'update', txId: id, patch: built.patch },
  })

  if (result.status === 'not_found') return err('Transaction introuvable.', 404)
  if (result.status === 'ledger_desync') {
    return err(desyncMessage(result.storedQty, result.recomputedQty), 409)
  }
  if (result.status === 'invalid_sale') {
    return err(invalidSaleMessage(result.date, result.heldQty, result.sellQty), 422)
  }

  const applied = await applyMutation(
    supabase, user.id, id, 'update', target.position_id!,
    result.finalQty, result.finalPru, built.txJson, result.realizedUpdates,
  )
  if (!applied.ok) return applied.response
  return ok(applied.data)
})

// ─── DELETE — suppression ─────────────────────────────────────────────────────

export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params

  const supabase = await createServerClient()
  const loaded = await loadContext(supabase, user.id, id)
  if (!loaded.ok) return loaded.response
  const { target, ledger, position } = loaded

  const result = recomputeLedgerAfterEdit({
    ledger,
    storedQty: position.quantity,
    op:        { kind: 'delete', txId: id },
  })

  if (result.status === 'not_found') return err('Transaction introuvable.', 404)
  if (result.status === 'ledger_desync') {
    return err(desyncMessage(result.storedQty, result.recomputedQty), 409)
  }
  if (result.status === 'invalid_sale') {
    return err(invalidSaleMessage(result.date, result.heldQty, result.sellQty), 422)
  }

  const applied = await applyMutation(
    supabase, user.id, id, 'delete', target.position_id!,
    result.finalQty, result.finalPru, null, result.realizedUpdates,
  )
  if (!applied.ok) return applied.response
  return ok({ deleted: true, position: applied.data })
})
