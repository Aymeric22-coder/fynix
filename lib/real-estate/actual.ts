/**
 * Suivi réel d'un bien immobilier (Phase 2).
 *
 * Agrège les données effectivement réalisées (transactions, charges payées,
 * valorisations historiques) en séries annuelles comparables avec la projection.
 *
 * Source des données :
 *  - `transactions` (append-only) pour les flux : loyers reçus, mensualités,
 *    impôts, frais ponctuels
 *  - `property_charges` (multi-année) pour les charges détaillées
 *  - `property_valuations` (append-only) pour les estimations historiques
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ActualChargesBreakdown {
  taxeFonciere: number
  insurance:    number
  accountant:   number
  cfe:          number
  condoFees:    number
  maintenance:  number
  other:        number
  total:        number
}

export interface ActualYearData {
  year: number

  /** Loyers réellement perçus (somme des transactions `rent_income`). */
  rentReceived:        number
  /** Nombre de transactions de loyer enregistrées (utile pour détecter mois manquants). */
  rentTransactionCount: number

  /** Charges payées (depuis `property_charges` pour cette année). */
  chargesPaid:         ActualChargesBreakdown
  /** True si une ligne `property_charges` existe pour cette année. */
  chargesRecorded:     boolean

  /** Total des mensualités versées (capital + intérêts + assurance) — transactions `loan_payment`. */
  loanPaid:            number
  /** Nombre de mensualités enregistrées dans l'année. */
  loanPaymentCount:    number

  /** Impôts versés (`tax`) liés à ce bien. */
  taxPaid:             number

  /** Frais ponctuels (`fee`) liés à ce bien. */
  feesPaid:            number

  /**
   * Valorisation enregistrée la plus récente dans l'année (depuis property_valuations).
   * `null` s'il n'y en a pas eu cette année — l'UI doit alors retomber sur la simulation.
   */
  valuationAtYearEnd:  number | null

  /**
   * Cash-flow réel net : rentReceived − chargesPaid.total − loanPaid − taxPaid − feesPaid.
   * (Convention positive = entrée de cash.)
   */
  cashFlowReal:        number
}

export interface ActualDataResult {
  /** Années pour lesquelles au moins une donnée a été enregistrée, triées chronologiquement. */
  years:        ActualYearData[]
  /** Année la plus ancienne avec une donnée (utile pour aligner avec la simulation). */
  firstYear:    number | null
  /** Année la plus récente avec une donnée. */
  lastYear:     number | null
  /** True si aucune donnée n'a été trouvée. */
  isEmpty:      boolean
}

// ─── Helper privé : agrège les transactions par année ──────────────────────

interface TxnRow {
  transaction_type: string
  amount:           number
  executed_at:      string
}

function aggregateTransactionsByYear(
  txns:        TxnRow[],
  year:        number,
  acceptTypes: string[],
): { sum: number; count: number } {
  let sum = 0
  let count = 0
  for (const t of txns) {
    if (!acceptTypes.includes(t.transaction_type)) continue
    if (new Date(t.executed_at).getUTCFullYear() !== year) continue
    sum += Math.abs(t.amount)   // les transactions négatives sont des sorties — on prend la valeur absolue côté coût
    count++
  }
  return { sum, count }
}

// ─── Helper principal ───────────────────────────────────────────────────────

export async function loadActualData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:   SupabaseClient<any, any, any>,
  userId:     string,
  assetId:    string,
  propertyId: string,
  debtId:     string | null,
): Promise<ActualDataResult> {
  // ── 1. Transactions liées à l'asset OU à la dette ────────────────────────
  // Pour les loyers/taxes/fees on filtre par asset_id.
  // Pour les loan_payment on filtre par debt_id.
  const [assetTxnsRes, debtTxnsRes, chargesRes, valuationsRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('transaction_type, amount, executed_at')
      .eq('user_id', userId)
      .eq('asset_id', assetId)
      .in('transaction_type', ['rent_income', 'tax', 'fee']),
    debtId
      ? supabase
          .from('transactions')
          .select('transaction_type, amount, executed_at')
          .eq('user_id', userId)
          .eq('debt_id', debtId)
          .eq('transaction_type', 'loan_payment')
      : Promise.resolve({ data: [] as TxnRow[] }),
    supabase
      .from('property_charges')
      .select('year, taxe_fonciere, insurance, accountant, cfe, condo_fees, maintenance, other')
      .eq('user_id', userId)
      .eq('property_id', propertyId),
    supabase
      .from('property_valuations')
      .select('valuation_date, value')
      .eq('user_id', userId)
      .eq('property_id', propertyId)
      .order('valuation_date', { ascending: false }),
  ])

  const assetTxns:  TxnRow[]                                                = (assetTxnsRes.data ?? []) as TxnRow[]
  const debtTxns:   TxnRow[]                                                = (debtTxnsRes.data  ?? []) as TxnRow[]
  const charges:    { year: number; taxe_fonciere: number; insurance: number; accountant: number; cfe: number; condo_fees: number; maintenance: number; other: number }[]
                                                                            = chargesRes.data    ?? []
  const valuations: { valuation_date: string; value: number }[]             = valuationsRes.data ?? []

  // ── 2. Détecte les années pertinentes ────────────────────────────────────
  const years = new Set<number>()
  for (const t of assetTxns)  years.add(new Date(t.executed_at).getUTCFullYear())
  for (const t of debtTxns)   years.add(new Date(t.executed_at).getUTCFullYear())
  for (const c of charges)    years.add(c.year)
  for (const v of valuations) years.add(new Date(v.valuation_date).getUTCFullYear())

  if (years.size === 0) {
    return { years: [], firstYear: null, lastYear: null, isEmpty: true }
  }

  const sortedYears = [...years].sort((a, b) => a - b)

  // ── 3. Agrège par année ──────────────────────────────────────────────────
  const result: ActualYearData[] = sortedYears.map((year) => {
    // Loyers
    const rent = aggregateTransactionsByYear(assetTxns, year, ['rent_income'])

    // Impôts
    const tax = aggregateTransactionsByYear(assetTxns, year, ['tax'])

    // Frais ponctuels
    const fees = aggregateTransactionsByYear(assetTxns, year, ['fee'])

    // Mensualités
    const loan = aggregateTransactionsByYear(debtTxns, year, ['loan_payment'])

    // Charges détaillées
    const c = charges.find((c) => c.year === year)
    const chargesPaid: ActualChargesBreakdown = c
      ? {
          taxeFonciere: Number(c.taxe_fonciere ?? 0),
          insurance:    Number(c.insurance     ?? 0),
          accountant:   Number(c.accountant    ?? 0),
          cfe:          Number(c.cfe           ?? 0),
          condoFees:    Number(c.condo_fees    ?? 0),
          maintenance:  Number(c.maintenance   ?? 0),
          other:        Number(c.other         ?? 0),
          total: Number(c.taxe_fonciere ?? 0) + Number(c.insurance ?? 0) + Number(c.accountant ?? 0)
               + Number(c.cfe ?? 0)           + Number(c.condo_fees ?? 0) + Number(c.maintenance ?? 0)
               + Number(c.other ?? 0),
        }
      : { taxeFonciere: 0, insurance: 0, accountant: 0, cfe: 0, condoFees: 0, maintenance: 0, other: 0, total: 0 }

    // Valorisation : la plus récente de l'année
    const valOfYear = valuations.find(
      (v) => new Date(v.valuation_date).getUTCFullYear() === year,
    )
    const valuationAtYearEnd = valOfYear ? Number(valOfYear.value) : null

    // Cash-flow réel net
    const cashFlowReal = rent.sum - chargesPaid.total - loan.sum - tax.sum - fees.sum

    return {
      year,
      rentReceived:         rent.sum,
      rentTransactionCount: rent.count,
      chargesPaid,
      chargesRecorded:      !!c,
      loanPaid:             loan.sum,
      loanPaymentCount:     loan.count,
      taxPaid:              tax.sum,
      feesPaid:             fees.sum,
      valuationAtYearEnd,
      cashFlowReal,
    }
  })

  return {
    years:     result,
    firstYear: result[0]!.year,
    lastYear:  result[result.length - 1]!.year,
    isEmpty:   false,
  }
}
