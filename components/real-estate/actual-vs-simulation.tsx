'use client'

import { useState } from 'react'
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Info, Plus,
} from 'lucide-react'
import type { ComparisonResult, YearComparison, VarianceMetric, VarianceMetricNullable } from '@/lib/real-estate/compare'
import { classifyVariance } from '@/lib/real-estate/compare'
import { formatCurrency } from '@/lib/utils/format'
import { QuickActualsEntry, type ExistingCharges } from './quick-actuals-entry'

// ─── Sous-composant : cellule de variance ─────────────────────────────────

function VarianceCell({
  metric, kind,
}: {
  metric: VarianceMetric | VarianceMetricNullable
  kind:   'income' | 'expense'
}) {
  if (metric.actual === null) {
    return <span className="text-xs text-muted">—</span>
  }
  const status = classifyVariance(metric.variance ?? 0, metric.simulated, kind)
  const colorClass =
    status === 'positive' ? 'text-accent'  :
    status === 'negative' ? 'text-danger'  :
                            'text-secondary'

  const Icon = status === 'positive' ? TrendingUp
             : status === 'negative' ? TrendingDown
             :                         Minus

  const sign = (metric.variance ?? 0) >= 0 ? '+' : ''
  const pctTxt = metric.variancePct !== null
    ? `${sign}${metric.variancePct.toFixed(1)} %`
    : '—'

  return (
    <span className={`flex items-center gap-1 ${colorClass}`}>
      <Icon size={11} />
      <span className="financial-value text-xs">{pctTxt}</span>
    </span>
  )
}

// ─── KPI cumul ─────────────────────────────────────────────────────────────

function CumulKpi({
  label, value, kind,
}: {
  label: string
  value: number
  kind:  'income' | 'expense'
}) {
  const isPositive = kind === 'income' ? value >= 0 : value <= 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const colorClass = isPositive ? 'text-accent' : 'text-danger'

  return (
    <div className="card p-4">
      <p className="text-xs text-secondary uppercase tracking-wider mb-2">{label}</p>
      <div className={`flex items-center gap-1.5 ${colorClass}`}>
        <Icon size={14} />
        <p className="text-lg font-semibold financial-value">
          {value >= 0 ? '+' : ''}{formatCurrency(value, 'EUR', { compact: true })}
        </p>
      </div>
      <p className="text-xs text-muted mt-1">cumul vs simulation</p>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────

interface Props {
  comparison:              ComparisonResult
  propertyName?:           string
  // Props pour le quick-entry modal
  assetId:                 string
  debtId:                  string | null
  propertyId:              string
  monthlyRentSuggested:    number
  monthlyPaymentSuggested: number | null
  existingCharges:         ExistingCharges[]
}

export function ActualVsSimulation({
  comparison,
  assetId, debtId, propertyId,
  monthlyRentSuggested, monthlyPaymentSuggested, existingCharges,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const [entryOpen, setEntryOpen] = useState(false)

  const quickEntryButton = (
    <button
      onClick={() => setEntryOpen(true)}
      className="flex items-center gap-1.5 text-xs bg-accent text-white rounded-lg px-3 py-1.5 hover:bg-accent/90 transition-colors"
    >
      <Plus size={12} />
      Saisir une donnée réelle
    </button>
  )

  const modal = (
    <QuickActualsEntry
      open={entryOpen}
      onClose={() => setEntryOpen(false)}
      assetId={assetId}
      debtId={debtId}
      propertyId={propertyId}
      monthlyRentSuggested={monthlyRentSuggested}
      monthlyPaymentSuggested={monthlyPaymentSuggested}
      existingCharges={existingCharges}
    />
  )

  // Cas 1 : aucune donnée réelle
  if (comparison.status === 'no_data') {
    return (
      <>
        <div className="card p-8 text-center space-y-4">
          <Info size={28} className="text-muted mx-auto" />
          <div className="space-y-1">
            <p className="text-sm text-primary font-medium">Aucune donnée réelle enregistrée</p>
            <p className="text-xs text-secondary max-w-md mx-auto">
              Saisissez les loyers reçus, mensualités versées et charges payées pour comparer
              la performance réelle à la simulation.
            </p>
          </div>
          <div className="flex justify-center">
            {quickEntryButton}
          </div>
        </div>
        {modal}
      </>
    )
  }

  return (
    <div className="space-y-5">

      {/* En-tête section + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-primary">Suivi réel vs Simulation</h2>
          <span className={`text-xs rounded-full px-2.5 py-0.5 border ${
            comparison.status === 'tracked'
              ? 'bg-accent/10 text-accent border-accent/20'
              : 'bg-warning/10 text-warning border-warning/20'
          }`}>
            {comparison.status === 'tracked' ? 'Suivi complet' : 'Suivi partiel'}
          </span>
          <span className="text-xs text-muted">
            {comparison.trackedYears} année{comparison.trackedYears > 1 ? 's' : ''} sur {comparison.elapsedYears} écoulée{comparison.elapsedYears > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {quickEntryButton}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors px-2 py-1.5"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Réduire' : 'Détailler'}
          </button>
        </div>
      </div>

      {/* KPIs cumul */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CumulKpi label="Loyers"     value={comparison.totals.rentVariance}    kind="income"  />
        <CumulKpi label="Charges"    value={-comparison.totals.chargesVariance} kind="income"  />
        <CumulKpi label="Crédit"     value={-comparison.totals.loanVariance}    kind="income"  />
        <CumulKpi label="Cash-flow"  value={comparison.totals.cashFlowVariance} kind="income"  />
      </div>

      {modal}

      {/* Tableau détaillé */}
      {expanded && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted uppercase tracking-wider bg-surface-2">
                  <th className="px-3 py-2.5 text-left whitespace-nowrap">Année</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap" colSpan={3}>Loyers</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap" colSpan={3}>Charges</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap" colSpan={3}>Cash-flow</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap" colSpan={2}>Valeur</th>
                </tr>
                <tr className="text-muted bg-surface-2/50">
                  <th className="px-3 py-1.5"></th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Prévu</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Réel</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Écart</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Prévu</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Réel</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Écart</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Prévu</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Réel</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Écart</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Prévu</th>
                  <th className="px-3 py-1.5 text-right text-[10px] font-normal">Réel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparison.years.map((y) => (
                  <YearRow key={y.year} y={y} />
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2 font-medium">
                  <td className="px-3 py-2.5 text-secondary">Cumul</td>
                  <td className="px-3 py-2.5 text-right" colSpan={2}></td>
                  <td className={`px-3 py-2.5 text-right financial-value ${comparison.totals.rentVariance >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {comparison.totals.rentVariance >= 0 ? '+' : ''}{formatCurrency(comparison.totals.rentVariance, 'EUR', { compact: true })}
                  </td>
                  <td className="px-3 py-2.5 text-right" colSpan={2}></td>
                  <td className={`px-3 py-2.5 text-right financial-value ${comparison.totals.chargesVariance <= 0 ? 'text-accent' : 'text-danger'}`}>
                    {comparison.totals.chargesVariance >= 0 ? '+' : ''}{formatCurrency(comparison.totals.chargesVariance, 'EUR', { compact: true })}
                  </td>
                  <td className="px-3 py-2.5 text-right" colSpan={2}></td>
                  <td className={`px-3 py-2.5 text-right financial-value ${comparison.totals.cashFlowVariance >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {comparison.totals.cashFlowVariance >= 0 ? '+' : ''}{formatCurrency(comparison.totals.cashFlowVariance, 'EUR', { compact: true })}
                  </td>
                  <td className="px-3 py-2.5 text-right" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Ligne d'année ─────────────────────────────────────────────────────────

function YearRow({ y }: { y: YearComparison }) {
  return (
    <tr className="hover:bg-surface-2 transition-colors">
      <td className="px-3 py-2 text-secondary font-medium">{y.year}</td>

      {/* Loyers */}
      <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(y.rent.simulated, 'EUR', { compact: true })}</td>
      <td className="px-3 py-2 text-right financial-value text-primary">{formatCurrency(y.rent.actual, 'EUR', { compact: true })}</td>
      <td className="px-3 py-2 text-right"><VarianceCell metric={y.rent} kind="income" /></td>

      {/* Charges */}
      <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(y.charges.simulated, 'EUR', { compact: true })}</td>
      <td className="px-3 py-2 text-right financial-value text-primary">{formatCurrency(y.charges.actual, 'EUR', { compact: true })}</td>
      <td className="px-3 py-2 text-right"><VarianceCell metric={y.charges} kind="expense" /></td>

      {/* Cash-flow */}
      <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(y.cashFlow.simulated, 'EUR', { compact: true })}</td>
      <td className={`px-3 py-2 text-right financial-value font-medium ${y.cashFlow.actual >= 0 ? 'text-accent' : 'text-danger'}`}>
        {formatCurrency(y.cashFlow.actual, 'EUR', { compact: true })}
      </td>
      <td className="px-3 py-2 text-right"><VarianceCell metric={y.cashFlow} kind="income" /></td>

      {/* Valeur */}
      <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(y.valuation.simulated, 'EUR', { compact: true })}</td>
      <td className="px-3 py-2 text-right financial-value text-primary">
        {y.valuation.actual !== null
          ? formatCurrency(y.valuation.actual, 'EUR', { compact: true })
          : <span className="text-muted">—</span>}
      </td>
    </tr>
  )
}
