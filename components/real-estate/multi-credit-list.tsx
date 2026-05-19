'use client'

import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { LOAN_KIND_LABELS, type LoanKind } from '@/types/database.types'
import { computeMonthlyPayment, computeRemainingCapitalAt } from '@/lib/real-estate/amortization'

export interface MultiCreditRow {
  id:               string
  loan_kind:        LoanKind
  lender:           string | null
  initial_amount:   number
  interest_rate:    number | null
  insurance_rate:   number | null
  duration_months:  number | null
  start_date:       string | null
}

interface Props {
  credits: MultiCreditRow[]
  /** Mensualité totale agrégée (calculée côté serveur via aggregateLoans). */
  totalMonthly: number
  /** CRD agrégé. */
  totalRemainingCapital: number
}

/**
 * Liste les crédits actifs d'un bien et affiche les totaux.
 * Lecture seule — l'édition d'un crédit se fait via le formulaire dédié
 * de l'onglet « Crédit ».
 */
export function MultiCreditList({ credits, totalMonthly, totalRemainingCapital }: Props) {
  if (credits.length === 0) {
    return (
      <div className="card p-6 text-sm text-secondary">
        Aucun crédit actif sur ce bien.
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-2">
        <h3 className="text-sm font-medium text-primary">
          Crédits actifs ({credits.length})
        </h3>
      </div>

      <ul className="divide-y divide-border">
        {credits.map((c) => {
          const monthly = c.interest_rate != null && c.duration_months != null
            ? computeMonthlyPayment(c.initial_amount, c.interest_rate, c.duration_months / 12)
            : 0
          const crd = c.interest_rate != null && c.duration_months != null && c.start_date
            ? computeRemainingCapitalAt({
                principal:        c.initial_amount,
                annualRatePct:    c.interest_rate,
                durationYears:    c.duration_months / 12,
                insuranceRatePct: c.insurance_rate ?? 0,
                bankFees:         0,
                guaranteeFees:    0,
                startDate:        new Date(c.start_date),
              }, new Date())
            : c.initial_amount

          return (
            <li key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">
                  {LOAN_KIND_LABELS[c.loan_kind] ?? c.loan_kind}
                  {c.lender && <span className="text-secondary"> · {c.lender}</span>}
                </p>
                <p className="text-xs text-secondary mt-0.5">
                  {formatCurrency(c.initial_amount, 'EUR', { compact: true })}
                  {c.interest_rate != null && (
                    <> · {formatPercent(c.interest_rate)}</>
                  )}
                  {c.duration_months && (
                    <> · {Math.round(c.duration_months / 12)} ans</>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm financial-value text-primary">
                  {formatCurrency(monthly, 'EUR')}<span className="text-xs text-secondary"> /mois</span>
                </p>
                <p className="text-xs text-secondary">
                  CRD : {formatCurrency(crd, 'EUR', { compact: true })}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      {credits.length > 1 && (
        <div className="px-5 py-3 border-t border-border bg-surface-2 flex items-center justify-between">
          <div>
            <p className="text-xs text-secondary uppercase tracking-widest">Total mensualités</p>
            <p className="text-sm font-semibold financial-value text-primary mt-0.5">
              {formatCurrency(totalMonthly, 'EUR')}<span className="text-xs text-secondary"> /mois</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-secondary uppercase tracking-widest">CRD total</p>
            <p className="text-sm font-semibold financial-value text-danger mt-0.5">
              {formatCurrency(totalRemainingCapital, 'EUR', { compact: true })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
