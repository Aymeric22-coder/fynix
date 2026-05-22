'use client'

import { useState, useMemo } from 'react'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AmortizationSchedule } from '@/lib/real-estate/types'
import { formatCurrency } from '@/lib/utils/format'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ScheduleEntry {
  /** Libellé affiché dans l'onglet (ex. "Prêt principal", "PTZ"). */
  label:     string
  schedule:  AmortizationSchedule
  startDate: Date | null
}

interface Props {
  /** Schedule par défaut affiché. Si `schedules` est fourni, ce sera l'onglet "Tous". */
  schedule:  AmortizationSchedule
  startDate: Date | null
  /**
   * V3.2 — Multi-crédit : un schedule individuel par crédit. Si fourni avec
   * au moins 2 entrées, le composant affiche des onglets en tête :
   * « Tous » (= `schedule` agrégé) suivi d'un onglet par entrée. Si absent
   * ou length <= 1 : mode mono historique, pas de tabs visibles.
   */
  schedules?: ScheduleEntry[]
  /** Nom du bien (utilisé pour le nom du fichier CSV) */
  propertyName?: string
}

const ROWS_PER_PAGE = 60   // 5 ans par page

export function AmortizationTable({ schedule, startDate, schedules, propertyName }: Props) {
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [page, setPage] = useState(0)
  // V3.2 — index 0 = "Tous" (= schedule agrégé), 1..N = schedules[i-1].
  // Pas de tabs si <= 1 schedule individuel.
  const showTabs = (schedules?.length ?? 0) > 1
  const [activeIdx, setActiveIdx] = useState(0)

  // Schedule effectivement affiché : agrégé (idx 0) ou individuel (idx > 0).
  const activeEntry: ScheduleEntry = !showTabs || activeIdx === 0
    ? { label: 'Tous', schedule, startDate }
    : schedules![activeIdx - 1]!
  const activeSchedule  = activeEntry.schedule
  const activeStartDate = activeEntry.startDate

  // Pagination des lignes mensuelles (yearly est toujours <= 40 lignes, pas besoin)
  const totalPages = Math.ceil(activeSchedule.months.length / ROWS_PER_PAGE)
  const pagedMonths = useMemo(() => {
    const start = page * ROWS_PER_PAGE
    return activeSchedule.months.slice(start, start + ROWS_PER_PAGE)
  }, [activeSchedule.months, page])

  // Date d'une mensualité donnée
  function dateForMonth(monthIndex: number): string {
    if (!activeStartDate) return `M${monthIndex}`
    const d = new Date(activeStartDate)
    d.setMonth(d.getMonth() + monthIndex - 1)
    return format(d, 'MMM yyyy', { locale: fr })
  }

  // Export CSV — sur le schedule actuellement sélectionné (Tous ou un crédit).
  function downloadCsv() {
    const sep = ';'
    const esc = (v: string | number): string => {
      const s = String(v)
      if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const fmt = (n: number) => n.toFixed(2).replace('.', ',')

    const lines: string[] = []
    lines.push(`Tableau d'amortissement`)
    if (propertyName) lines.push(`Bien${sep}${esc(propertyName)}`)
    if (showTabs)     lines.push(`Credit${sep}${esc(activeEntry.label)}`)
    lines.push(`Mensualite (capital + interets)${sep}${fmt(activeSchedule.monthlyPayment)}`)
    lines.push(`Assurance moyenne${sep}${fmt(activeSchedule.monthlyInsurance)}`)
    lines.push(`Mensualite totale${sep}${fmt(activeSchedule.totalMonthly)}`)
    lines.push(`Total interets${sep}${fmt(activeSchedule.totalInterest)}`)
    lines.push(`Total assurance${sep}${fmt(activeSchedule.totalInsurance)}`)
    lines.push(`Total frais${sep}${fmt(activeSchedule.totalFees)}`)
    lines.push(`Cout total credit${sep}${fmt(activeSchedule.totalCost)}`)
    lines.push(`TAEG approximatif (%)${sep}${fmt(activeSchedule.aprPct)}`)
    lines.push('')
    lines.push(`Mois${sep}Date${sep}Mensualite${sep}Capital${sep}Interets${sep}Assurance${sep}CRD${sep}Differe`)
    for (const m of activeSchedule.months) {
      lines.push([
        m.monthIndex,
        activeStartDate ? format(new Date(new Date(activeStartDate).setMonth(activeStartDate.getMonth() + m.monthIndex - 1)), 'yyyy-MM-dd') : `M${m.monthIndex}`,
        fmt(m.payment + m.insurance),
        fmt(m.principal),
        fmt(m.interest),
        fmt(m.insurance),
        fmt(m.remainingCapital),
        m.isDeferred ? 'oui' : 'non',
      ].join(sep))
    }

    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = (propertyName ?? 'bien').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const safeLabel = showTabs
      ? '-' + activeEntry.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      : ''
    link.href = url
    link.download = `amortissement-${safeName}${safeLabel}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (activeSchedule.months.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-secondary">
        Aucun crédit configuré pour ce bien.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* V3.2 — Tabs multi-crédit. "Tous" affiche le schedule agrégé,
          chaque autre onglet affiche le schedule individuel du crédit.
          Pas affiché en mode mono (showTabs === false). */}
      {showTabs && (
        <div className="flex flex-wrap items-center gap-1 bg-surface-2 rounded-lg p-1">
          {(['Tous', ...schedules!.map(s => s.label)] as const).map((label, idx) => (
            <button
              key={`${label}-${idx}`}
              type="button"
              onClick={() => { setActiveIdx(idx); setPage(0) }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${activeIdx === idx ? 'bg-accent text-bg font-medium' : 'text-secondary hover:text-primary'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Header avec switch + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface-2 rounded-lg p-1">
          <button
            onClick={() => { setView('monthly'); setPage(0) }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${view === 'monthly' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
          >
            Mensuel · {activeSchedule.months.length} lignes
          </button>
          <button
            onClick={() => setView('yearly')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${view === 'yearly' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
          >
            Annuel · {activeSchedule.years.length} ans
          </button>
        </div>
        <button
          onClick={downloadCsv}
          className="flex items-center gap-1.5 text-xs bg-surface-2 text-primary border border-border rounded-lg px-3 py-1.5 hover:bg-surface-2/70 transition-colors"
        >
          <Download size={12} /> Exporter CSV
        </button>
      </div>

      {/* Tableau */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          {view === 'monthly' ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 z-10">
                <tr className="text-muted uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Mensualité</th>
                  <th className="px-3 py-2 text-right">Capital</th>
                  <th className="px-3 py-2 text-right">Intérêts</th>
                  <th className="px-3 py-2 text-right">Assurance</th>
                  <th className="px-3 py-2 text-right">CRD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedMonths.map((m) => (
                  <tr key={m.monthIndex} className={m.isDeferred ? 'bg-warning/5' : 'hover:bg-surface-2/50'}>
                    <td className="px-3 py-2 text-muted financial-value">{m.monthIndex}</td>
                    <td className="px-3 py-2 text-secondary whitespace-nowrap">
                      {dateForMonth(m.monthIndex)}
                      {m.isDeferred && <span className="ml-1 text-[10px] text-warning">(différé)</span>}
                    </td>
                    <td className="px-3 py-2 text-right financial-value text-primary">{formatCurrency(m.payment + m.insurance, 'EUR')}</td>
                    <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(m.principal, 'EUR')}</td>
                    <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(m.interest, 'EUR')}</td>
                    <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(m.insurance, 'EUR')}</td>
                    <td className="px-3 py-2 text-right financial-value text-primary font-medium">{formatCurrency(m.remainingCapital, 'EUR', { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 z-10">
                <tr className="text-muted uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Année</th>
                  <th className="px-3 py-2 text-right">Total versé</th>
                  <th className="px-3 py-2 text-right">Capital remboursé</th>
                  <th className="px-3 py-2 text-right">Intérêts</th>
                  <th className="px-3 py-2 text-right">Assurance</th>
                  <th className="px-3 py-2 text-right">CRD fin année</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeSchedule.years.map((y) => (
                  <tr key={y.year} className="hover:bg-surface-2/50">
                    <td className="px-3 py-2 text-secondary font-medium">Année {y.year}</td>
                    <td className="px-3 py-2 text-right financial-value text-primary">{formatCurrency(y.totalPayment + y.insurance, 'EUR', { compact: true })}</td>
                    <td className="px-3 py-2 text-right financial-value text-accent">{formatCurrency(y.principal, 'EUR', { compact: true })}</td>
                    <td className="px-3 py-2 text-right financial-value text-danger">{formatCurrency(y.interest, 'EUR', { compact: true })}</td>
                    <td className="px-3 py-2 text-right financial-value text-secondary">{formatCurrency(y.insurance, 'EUR', { compact: true })}</td>
                    <td className="px-3 py-2 text-right financial-value text-primary font-medium">{formatCurrency(y.remainingCapital, 'EUR', { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination (mensuel uniquement) */}
      {view === 'monthly' && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-secondary">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={12} /> Précédent
          </button>
          <span>
            Mois {page * ROWS_PER_PAGE + 1} – {Math.min((page + 1) * ROWS_PER_PAGE, activeSchedule.months.length)} sur {activeSchedule.months.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Suivant <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
