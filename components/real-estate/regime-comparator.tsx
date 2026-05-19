'use client'

import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { compareRegimes } from '@/lib/real-estate/fiscal/compare-regimes'
import type { SimulationInput } from '@/lib/real-estate/types'

interface Props {
  /** Inputs de simulation sans le régime — le comparateur teste les 7 régimes. */
  base: Omit<SimulationInput, 'regime'>
  /** TMI par défaut (du profil utilisateur). */
  defaultTmiPct?: number
}

/**
 * Tableau comparatif des 7 régimes fiscaux pour le même bien.
 * Recalcule en direct quand l'utilisateur change la TMI ou l'horizon.
 */
export function RegimeComparator({ base, defaultTmiPct = 30 }: Props) {
  const [tmiPct, setTmiPct] = useState(defaultTmiPct)
  const [horizon, setHorizon] = useState(base.horizonYears ?? 10)

  const result = useMemo(
    () => compareRegimes({ ...base, horizonYears: horizon }, { tmiPct, horizonYears: horizon }),
    [base, tmiPct, horizon],
  )

  const rows = useMemo(
    // Trie par cash-flow décroissant, les non applicables à la fin
    () => [...result.rows].sort((a, b) => {
      if (a.notApplicable && !b.notApplicable) return 1
      if (!a.notApplicable && b.notApplicable) return -1
      return b.annualNetCashFlow - a.annualNetCashFlow
    }),
    [result.rows],
  )

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-medium text-primary">Comparateur de régimes fiscaux</h3>
          <p className="text-xs text-secondary mt-1">
            Année 1 — chaque régime est calculé sur les mêmes loyers et charges.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-secondary">TMI</span>
            <select
              value={tmiPct}
              onChange={(e) => setTmiPct(Number(e.target.value))}
              className="bg-surface-2 border border-border rounded-md px-2 py-1 text-primary"
            >
              {[0, 11, 30, 41, 45].map(t => (
                <option key={t} value={t}>{t} %</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-secondary">Horizon</span>
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="bg-surface-2 border border-border rounded-md px-2 py-1 text-primary"
            >
              <option value={5}>5 ans</option>
              <option value={10}>10 ans</option>
              <option value={20}>20 ans</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted uppercase tracking-wider border-b border-border">
            <tr>
              <th className="text-left py-2 px-3">Régime</th>
              <th className="text-right py-2 px-3">Loyers nets/an</th>
              <th className="text-right py-2 px-3">Charges/an</th>
              <th className="text-right py-2 px-3">Crédit/an</th>
              <th className="text-right py-2 px-3">Impôts/an</th>
              <th className="text-right py-2 px-3">CF net/mois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(r => {
              const isBest = r.recommended
              const cfTone = r.annualNetCashFlow >= 0 ? 'text-accent' : 'text-danger'
              return (
                <tr
                  key={r.regime}
                  className={
                    r.notApplicable
                      ? 'opacity-50'
                      : isBest
                        ? 'bg-accent/5'
                        : ''
                  }
                >
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      {isBest && <Star size={12} className="text-accent fill-accent" />}
                      <span className={isBest ? 'font-medium text-primary' : 'text-secondary'}>
                        {r.label}
                      </span>
                    </div>
                    {r.notApplicable && r.notApplicableReason && (
                      <p className="text-xs text-muted mt-0.5">{r.notApplicableReason}</p>
                    )}
                  </td>
                  <td className="text-right py-2 px-3 financial-value text-secondary">
                    {r.notApplicable ? '—' : formatCurrency(r.annualGrossRent - r.annualGrossRent * 0, 'EUR', { compact: true })}
                  </td>
                  <td className="text-right py-2 px-3 financial-value text-secondary">
                    {r.notApplicable ? '—' : '−' + formatCurrency(r.annualCharges, 'EUR', { compact: true })}
                  </td>
                  <td className="text-right py-2 px-3 financial-value text-secondary">
                    {r.notApplicable ? '—' : '−' + formatCurrency(r.annualLoanPayment, 'EUR', { compact: true })}
                  </td>
                  <td className="text-right py-2 px-3 financial-value text-secondary">
                    {r.notApplicable
                      ? '—'
                      : (r.annualTax >= 0
                          ? '−' + formatCurrency(r.annualTax, 'EUR', { compact: true })
                          : '+' + formatCurrency(-r.annualTax, 'EUR', { compact: true }))}
                  </td>
                  <td className={`text-right py-2 px-3 financial-value font-medium ${r.notApplicable ? 'text-muted' : cfTone}`}>
                    {r.notApplicable ? '—' : formatCurrency(r.monthlyNetCashFlow, 'EUR')}
                    {!r.notApplicable && (
                      <p className="text-xs text-muted">{formatPercent(r.netYieldPct)}/an</p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {result.bestLabel && (
        <p className="text-xs text-accent">
          <Star size={11} className="inline mr-1 fill-accent" />
          {result.bestLabel} — régime le plus avantageux sur la base de votre TMI ({tmiPct} %).
        </p>
      )}
      <p className="text-xs text-muted">
        ⚠️ Cette comparaison est une estimation. Consultez un expert-comptable pour valider votre situation.
      </p>
    </div>
  )
}
