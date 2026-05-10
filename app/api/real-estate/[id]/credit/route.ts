/**
 * Route property-centric pour gérer LE crédit d'un bien immobilier.
 *
 * Migration 006 : 1 crédit max par bien (UNIQUE index sur asset_id WHERE status=active).
 * Cette route remplace `/api/debts/*` qui sera supprimée à l'étape 7.
 *
 * - GET    /api/real-estate/[id]/credit  → récupère le crédit du bien (null si aucun)
 * - PUT    /api/real-estate/[id]/credit  → upsert (crée ou met à jour) le crédit
 * - DELETE /api/real-estate/[id]/credit  → supprime le crédit du bien
 *
 * À chaque write, on recalcule le cache `monthly_payment` (mensualité hors
 * assurance, en tenant compte du différé) et `capital_remaining` (CRD à date)
 * via la lib pure `lib/real-estate/amortization.ts`.
 */

import { createServerClient } from '@/lib/supabase/server'
import { ok, err, withAuth, parseBody } from '@/lib/utils/api'
import type { User } from '@supabase/supabase-js'
import {
  computeMonthlyPayment,
  computeRemainingCapitalAt,
} from '@/lib/real-estate/amortization'
import type { LoanInput } from '@/lib/real-estate/types'
import { round2 } from '@/lib/finance/formulas'

type Ctx = { params: Promise<{ id: string }> }

// Body accepté en PUT : tous les champs optionnels pour permettre la saisie
// step-by-step (cf. comportement migration 005). Validation côté lib via
// `validateSimulationInput` au moment de la simulation.
interface CreditUpsertBody {
  name?:                string
  lender?:              string | null
  initial_amount?:      number | null
  interest_rate?:       number | null
  insurance_rate?:      number | null
  duration_months?:     number | null
  start_date?:          string | null
  deferral_type?:       'none' | 'partial' | 'total'
  deferral_months?:     number
  bank_fees?:           number
  guarantee_fees?:      number
  amortization_type?:   'constant' | 'linear' | 'in_fine'
  insurance_base?:      'capital_initial' | 'capital_remaining'
  insurance_quotite?:   number
  guarantee_type?:      'hypotheque' | 'caution' | 'ppd' | 'autre'
  notes?:               string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Récupère l'asset_id du bien immobilier après vérification d'appartenance.
 * Renvoie null si introuvable.
 */
async function getPropertyAssetId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId:   string,
  propertyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('real_estate_properties')
    .select('asset_id')
    .eq('id', propertyId)
    .eq('user_id', userId)
    .single()
  return data?.asset_id ?? null
}

/**
 * Recalcule les caches `monthly_payment` et `capital_remaining` depuis les
 * paramètres du crédit. Utilise la nouvelle lib `amortization.ts` (avec différé,
 * assurance variable, etc.).
 *
 * - `monthly_payment` = mensualité de la PHASE AMORTISSABLE (hors assurance).
 *   Pendant un différé total/partiel, ce sera quand même la mensualité après différé.
 * - `capital_remaining` = CRD à la date du jour (basé sur startDate du crédit).
 */
function computeCaches(
  initialAmount:   number | null,
  interestRate:    number | null,
  durationMonths:  number | null,
  startDate:       string | null,
  insuranceRate:   number | null,
  bankFees:        number,
  guaranteeFees:   number,
  deferralType:    'none' | 'partial' | 'total',
  deferralMonths:  number,
  insuranceBase:   'capital_initial' | 'capital_remaining',
  insuranceQuotite: number,
): { monthly_payment: number | null; capital_remaining: number | null } {
  // Crédit incomplet → on ne recalcule rien
  if (initialAmount == null || interestRate == null || durationMonths == null) {
    return { monthly_payment: null, capital_remaining: initialAmount ?? null }
  }

  const durationYears = durationMonths / 12
  const amortMonths   = durationMonths - deferralMonths
  const amortYears    = Math.max(0.01, amortMonths / 12)

  // Mensualité phase amortissable (sur capital initial pour différé partiel/none,
  // sur capital gonflé pour différé total — calculé par buildAmortizationSchedule).
  // Pour le cache, on calcule simplement la mensualité hors différé qui correspond
  // à la mensualité que l'utilisateur paiera après la phase de différé.
  const monthlyPayment = round2(
    computeMonthlyPayment(initialAmount, interestRate, amortYears),
  )

  // CRD à date : nécessite le schedule complet pour gérer le différé correctement
  const loan: LoanInput = {
    principal:           initialAmount,
    annualRatePct:       interestRate,
    durationYears,
    insuranceRatePct:    insuranceRate ?? 0,
    bankFees,
    guaranteeFees,
    startDate:           startDate ? new Date(startDate) : undefined,
    deferralType,
    deferralMonths,
    insuranceBase,
    insuranceQuotitePct: insuranceQuotite,
  }
  const capitalRemaining = round2(computeRemainingCapitalAt(loan, new Date()))

  return {
    monthly_payment:   monthlyPayment,
    capital_remaining: capitalRemaining,
  }
}

// ─── GET /api/real-estate/[id]/credit ─────────────────────────────────────

export const GET = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const supabase = await createServerClient()

  const assetId = await getPropertyAssetId(supabase, user.id, propertyId)
  if (!assetId) return err('Property not found', 404)

  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('asset_id', assetId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (error) return err(error.message, 500)
  return ok(data)   // null si pas de crédit
})

// ─── PUT /api/real-estate/[id]/credit ─────────────────────────────────────

export const PUT = withAuth(async (req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const body = await parseBody<CreditUpsertBody>(req)
  if (!body) return err('Invalid JSON body')

  const supabase = await createServerClient()
  const assetId = await getPropertyAssetId(supabase, user.id, propertyId)
  if (!assetId) return err('Property not found', 404)

  // Récupère le crédit existant (s'il existe)
  const { data: existing } = await supabase
    .from('debts')
    .select('*')
    .eq('asset_id', assetId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  // Merge : valeurs fournies dans le body écrasent l'existant
  const merged = {
    name:               body.name              ?? existing?.name              ?? 'Crédit',
    debt_type:          'mortgage' as const,   // forcé : section Dette indépendante supprimée
    status:             'active' as const,
    lender:             body.lender            ?? existing?.lender            ?? null,
    initial_amount:     body.initial_amount    ?? existing?.initial_amount    ?? null,
    interest_rate:      body.interest_rate     ?? existing?.interest_rate     ?? null,
    insurance_rate:     body.insurance_rate    ?? existing?.insurance_rate    ?? 0,
    duration_months:    body.duration_months   ?? existing?.duration_months   ?? null,
    start_date:         body.start_date        ?? existing?.start_date        ?? null,
    deferral_type:      body.deferral_type     ?? existing?.deferral_type     ?? 'none',
    deferral_months:    body.deferral_months   ?? existing?.deferral_months   ?? 0,
    bank_fees:          body.bank_fees         ?? existing?.bank_fees         ?? 0,
    guarantee_fees:     body.guarantee_fees    ?? existing?.guarantee_fees    ?? 0,
    amortization_type:  body.amortization_type ?? existing?.amortization_type ?? 'constant',
    insurance_base:     body.insurance_base    ?? existing?.insurance_base    ?? 'capital_initial',
    insurance_quotite:  body.insurance_quotite ?? existing?.insurance_quotite ?? 100,
    guarantee_type:     body.guarantee_type    ?? existing?.guarantee_type    ?? 'caution',
    notes:              body.notes             ?? existing?.notes             ?? null,
    currency:           'EUR' as const,
  }

  // initial_amount est requis pour créer un crédit (mais pas pour update partiel)
  if (!existing && merged.initial_amount == null) {
    return err('initial_amount required for new credit')
  }

  // Recalcul des caches
  const caches = computeCaches(
    merged.initial_amount,
    merged.interest_rate,
    merged.duration_months,
    merged.start_date,
    merged.insurance_rate,
    merged.bank_fees,
    merged.guarantee_fees,
    merged.deferral_type as 'none' | 'partial' | 'total',
    merged.deferral_months,
    merged.insurance_base as 'capital_initial' | 'capital_remaining',
    merged.insurance_quotite,
  )

  if (existing) {
    // UPDATE
    const { data, error } = await supabase
      .from('debts')
      .update({
        ...merged,
        ...caches,
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return err(error.message, 500)
    return ok(data)
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('debts')
      .insert({
        ...merged,
        ...caches,
        user_id:  user.id,
        asset_id: assetId,
      })
      .select()
      .single()

    if (error) return err(error.message, 500)
    return ok(data, 201)
  }
})

// ─── DELETE /api/real-estate/[id]/credit ──────────────────────────────────

export const DELETE = withAuth(async (_req: Request, user: User, ctx: Ctx) => {
  const { id: propertyId } = await ctx!.params
  const supabase = await createServerClient()

  const assetId = await getPropertyAssetId(supabase, user.id, propertyId)
  if (!assetId) return err('Property not found', 404)

  const { error } = await supabase
    .from('debts')
    .delete()
    .eq('asset_id', assetId)
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (error) return err(error.message, 500)
  return ok({ deleted: true })
})
