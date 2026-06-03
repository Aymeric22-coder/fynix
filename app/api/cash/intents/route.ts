/**
 * GET / POST `/api/cash/intents` — Cash V1.2 (cash volontaire).
 *
 * - `GET`  : liste les intents de l'utilisateur.
 * - `POST` : crée une intent. Garde applicative : `Σ intents.montant ≤
 *   totalCash` (corrigé du cash courant). Sinon 422 avec message clair.
 *
 * RLS verrouille déjà l'accès aux lignes d'un autre user ; les filtres
 * `eq('user_id', user.id)` sont une double ceinture.
 */
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import { computeCashTotals } from '@/lib/cash/totals'
import { computeMatelasEffectif } from '@/lib/cash/intents'
import type { User } from '@supabase/supabase-js'
import type { CashIntent } from '@/types/database.types'

const MOTIF_ENUM = z.enum([
  'apport_immo',
  'achat_planifie',
  'voyage',
  'precaution_assumee',
  'autre',
])

const createBodySchema = z.object({
  montant:         z.number().positive('montant doit être > 0'),
  motif:           MOTIF_ENUM,
  motif_libre:     z.string().max(280, 'motif_libre ≤ 280 caractères').optional().nullable(),
  cash_account_id: z.string().uuid('cash_account_id invalide').optional().nullable(),
  target_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'target_date attendue YYYY-MM-DD').optional().nullable(),
})

export const GET = withAuth(async (_req: Request, user: User) => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('cash_intents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return ok({ items: (data ?? []) as CashIntent[] })
})

export const POST = withAuth(async (req: Request, user: User) => {
  const raw = await parseBody<Record<string, unknown>>(req)
  if (!raw) return err('Invalid JSON body')

  const parsed = createBodySchema.safeParse(raw)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return err(firstIssue?.message ?? 'Invalid body', 400)
  }
  const body = parsed.data

  const supabase = await createServerClient()

  // Si `cash_account_id` fourni, vérifier qu'il appartient à l'utilisateur.
  if (body.cash_account_id) {
    const { data: account } = await supabase
      .from('cash_accounts')
      .select('id')
      .eq('id', body.cash_account_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!account) return err('cash_account_id introuvable', 400)
  }

  // ── Garde applicative anti-dépassement ─────────────────────────────
  // On charge le cash brut + les intents existantes, puis on vérifie que
  // l'ajout du nouveau montant ne fait pas passer Σ intents > totalCash.
  const [{ data: accounts }, { data: existingIntents }] = await Promise.all([
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
  const { totalIntentsActives } = computeMatelasEffectif(
    totals.totalEur,
    (existingIntents ?? []) as CashIntent[],
  )
  if (totalIntentsActives + body.montant > totals.totalEur) {
    return err(
      `La somme des intentions (${(totalIntentsActives + body.montant).toFixed(2)} €) `
      + `dépasserait ton cash disponible (${totals.totalEur.toFixed(2)} €).`,
      422,
    )
  }

  const { data: created, error: insertErr } = await supabase
    .from('cash_intents')
    .insert({
      user_id:         user.id,
      cash_account_id: body.cash_account_id ?? null,
      montant:         body.montant,
      motif:           body.motif,
      motif_libre:     body.motif_libre ?? null,
      target_date:     body.target_date ?? null,
    })
    .select()
    .single()

  if (insertErr) return err(insertErr.message, 500)
  return ok({ intent: created as CashIntent }, 201)
})
