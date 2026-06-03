/**
 * PUT / DELETE `/api/cash/intents/[id]` — Cash V1.2 (cash volontaire).
 *
 * - `PUT`    : met à jour une intention. Même garde anti-dépassement que
 *              POST (`Σ intents.montant ≤ totalCash`), recalculée à partir
 *              des MONTANTS POST-PUT (on remplace l'ancien montant).
 * - `DELETE` : suppression hard. Pas de soft-delete en V1.2.
 *
 * RLS sécurise les writes : un user n'atteint que ses propres lignes via
 * `eq('user_id', user.id)` (double ceinture côté code).
 */
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import { computeCashTotals } from '@/lib/cash/totals'
import { computeMatelasEffectif } from '@/lib/cash/intents'
import type { User } from '@supabase/supabase-js'
import type { CashIntent } from '@/types/database.types'

type Ctx = { params: Promise<{ id: string }> }

const MOTIF_ENUM = z.enum([
  'apport_immo',
  'achat_planifie',
  'voyage',
  'precaution_assumee',
  'autre',
])

const updateBodySchema = z.object({
  montant:         z.number().positive('montant doit être > 0').optional(),
  motif:           MOTIF_ENUM.optional(),
  motif_libre:     z.string().max(280, 'motif_libre ≤ 280 caractères').optional().nullable(),
  cash_account_id: z.string().uuid('cash_account_id invalide').optional().nullable(),
  target_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'target_date attendue YYYY-MM-DD').optional().nullable(),
})

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const raw = await parseBody<Record<string, unknown>>(req)
  if (!raw) return err('Invalid JSON body')

  const parsed = updateBodySchema.safeParse(raw)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return err(firstIssue?.message ?? 'Invalid body', 400)
  }
  const body = parsed.data

  const supabase = await createServerClient()

  // Vérifie que l'intention existe et appartient à l'utilisateur.
  const { data: existing } = await supabase
    .from('cash_intents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!existing) return err('Intention introuvable', 404)

  // Validation cash_account_id si fourni.
  if (body.cash_account_id) {
    const { data: account } = await supabase
      .from('cash_accounts')
      .select('id')
      .eq('id', body.cash_account_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!account) return err('cash_account_id introuvable', 400)
  }

  // Garde anti-dépassement : on remplace l'ancien montant de l'intention
  // par le nouveau dans le total.
  if (body.montant !== undefined) {
    const [{ data: accounts }, { data: allIntents }] = await Promise.all([
      supabase.from('cash_accounts').select('id, asset_id, balance, currency, account_type').eq('user_id', user.id),
      supabase.from('cash_intents').select('*').eq('user_id', user.id),
    ])
    const totals = await computeCashTotals(
      (accounts ?? []).map((a) => ({
        id:           a.id,
        asset_id:     a.asset_id,
        balance:      Number(a.balance),
        currency:     a.currency ?? 'EUR',
        account_type: a.account_type,
      })),
    )
    // Simule le PUT : on enlève l'ancien montant de l'intention, on ajoute le nouveau.
    const projectedIntents = ((allIntents ?? []) as CashIntent[]).map((i) =>
      i.id === id ? { ...i, montant: body.montant! } : i,
    )
    const { totalIntentsActives } = computeMatelasEffectif(totals.totalEur, projectedIntents)
    if (totalIntentsActives > totals.totalEur) {
      return err(
        `La somme des intentions (${totalIntentsActives.toFixed(2)} €) `
        + `dépasserait ton cash disponible (${totals.totalEur.toFixed(2)} €).`,
        422,
      )
    }
  }

  const patch: Record<string, unknown> = {}
  if (body.montant         !== undefined) patch.montant         = body.montant
  if (body.motif           !== undefined) patch.motif           = body.motif
  if (body.motif_libre     !== undefined) patch.motif_libre     = body.motif_libre
  if (body.cash_account_id !== undefined) patch.cash_account_id = body.cash_account_id
  if (body.target_date     !== undefined) patch.target_date     = body.target_date

  const { data: updated, error: updErr } = await supabase
    .from('cash_intents')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (updErr) return err(updErr.message, 500)
  return ok({ intent: updated as CashIntent })
})

export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id } = await ctx.params
  const supabase = await createServerClient()
  const { error: delErr } = await supabase
    .from('cash_intents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (delErr) return err(delErr.message, 500)
  return ok({ deleted: id })
})
