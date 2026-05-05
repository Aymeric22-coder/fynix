import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import { round2 } from '@/lib/finance/formulas'

type Ctx = { params: Promise<{ id: string }> }

interface ValidateBody {
  // Données d'exécution réelles (peuvent différer du plan)
  actual_amount?: number       // montant réel investi
  actual_price?: number        // prix unitaire d'exécution
  actual_quantity?: number     // quantité achetée
  deviation_note?: string      // explication si écart

  // Action alternative
  action?: 'validate' | 'skip' | 'cancel'
}

/**
 * POST /api/dca/occurrences/[id]/validate
 *
 * Validation manuelle d'une occurrence DCA (CRITIQUE).
 * - Crée une transaction d'achat dans le journal
 * - Met à jour le financial_asset (quantité + PRU recalculé)
 * - Marque l'occurrence comme validated
 */
export const POST = withAuth(async (req: Request, user: User, ctx?: Ctx) => {
  const { id: occurrenceId } = await ctx!.params
  const body = await parseBody<ValidateBody>(req)
  if (!body) return err('Invalid JSON body')

  const action = body.action ?? 'validate'
  const supabase = await createServerClient()

  // Récupérer l'occurrence et vérifier l'appartenance
  const { data: occurrence } = await supabase
    .from('dca_occurrences')
    .select('*, dca_plan:dca_plans(*)')
    .eq('id', occurrenceId)
    .eq('user_id', user.id)
    .single()

  if (!occurrence) return err('DCA occurrence not found', 404)
  if (occurrence.status !== 'pending') {
    return err(`Occurrence is already ${occurrence.status}`, 409)
  }

  // ── Skip ou Cancel ─────────────────────────────────────────────────────────
  if (action === 'skip' || action === 'cancel') {
    const { data, error } = await supabase
      .from('dca_occurrences')
      .update({ status: action, deviation_note: body.deviation_note ?? null })
      .eq('id', occurrenceId)
      .select()
      .single()

    if (error) return err(error.message, 500)
    return ok(data)
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const plan = occurrence.dca_plan
  const actualAmount = body.actual_amount ?? occurrence.planned_amount
  const actualPrice = body.actual_price ?? null
  const actualQuantity = body.actual_quantity ??
    (actualPrice ? round2(actualAmount / actualPrice) : null)

  // 1. Créer la transaction d'achat dans le journal
  const { data: transaction, error: txErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      asset_id: plan.asset_id ?? null,
      transaction_type: 'purchase',
      amount: -actualAmount,  // sortie de cash
      currency: plan.currency ?? 'EUR',
      fx_rate_to_ref: 1,
      executed_at: new Date(occurrence.scheduled_date).toISOString(),
      label: `DCA ${plan.ticker} — ${occurrence.scheduled_date}`,
      notes: body.deviation_note ?? null,
      data_source: 'manual',
    })
    .select()
    .single()

  if (txErr) return err(txErr.message, 500)

  // 2. Mettre à jour le financial_asset si lié (quantité + PRU pondéré)
  if (plan.asset_id && actualQuantity && actualPrice) {
    const { data: fa } = await supabase
      .from('financial_assets')
      .select('quantity, average_price')
      .eq('asset_id', plan.asset_id)
      .single()

    if (fa) {
      const newQuantity = round2(fa.quantity + actualQuantity)
      // PRU pondéré = (ancienne quantité × ancien PRU + nouvelle quantité × nouveau prix) / total
      const newAvgPrice = round2(
        (fa.quantity * fa.average_price + actualQuantity * actualPrice) / newQuantity,
      )

      await supabase
        .from('financial_assets')
        .update({ quantity: newQuantity, average_price: newAvgPrice })
        .eq('asset_id', plan.asset_id)

      // Mettre à jour acquisition_price dans assets
      await supabase
        .from('assets')
        .update({ acquisition_price: round2(newQuantity * newAvgPrice) })
        .eq('id', plan.asset_id)
    }
  }

  // 3. Marquer l'occurrence comme validée
  const { data: updated, error: updErr } = await supabase
    .from('dca_occurrences')
    .update({
      status: 'validated',
      actual_amount: actualAmount,
      actual_price: actualPrice,
      actual_quantity: actualQuantity,
      validated_at: new Date().toISOString(),
      transaction_id: transaction.id,
      deviation_note: body.deviation_note ?? null,
    })
    .eq('id', occurrenceId)
    .select()
    .single()

  if (updErr) return err(updErr.message, 500)

  return ok({
    occurrence: updated,
    transaction_id: transaction.id,
    deviation: body.actual_amount
      ? round2(body.actual_amount - occurrence.planned_amount)
      : 0,
  })
})
