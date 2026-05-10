'use client'

import { useState, useMemo } from 'react'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AmortizationSchedule } from '@/lib/real-estate/types'
import { formatCurrency } from '@/lib/utils/format'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props {
  schedule:  AmortizationSchedule
  startDate: Date | null
  /** Nom du bien (utilisé pour le nom du fichier CSV) */
  propertyName?: string
}

const ROWS_PER_PAGE = 60   // 5 ans par page

export function AmortizationTable({ schedule, startDate, propertyName }: Props) {
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly')
  const [page, setPage] = useState(0)

  // Pagination des lignes mensuelles (yearly est toujours <= 40 lignes, pas besoin)
  const totalPages = Math.ceil(schedule.months.length / ROWS_PER_PAGE)
  const pagedMonths = useMemo(() => {
    const start = page * ROWS_PER_PAGE
    return schedule.months.slice(start, start + ROWS_PER_PAGE)
  }, [schedule.months, page])

  // Date d'une mensualité donnée
  function dateForMonth(monthIndex: number): string {
    if (!startDate) return `M${monthIndex}`
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + monthIndex - 1)
    return format(d, 'MMM yyyy', { locale: fr })
  }

  // Export CSV
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
    lines.push(`Mensualite (capital + interets)${sep}${fmt(schedule.monthlyPayment)}`)
    lines.push(`Assurance moyenne${sep}${fmt(schedule.monthlyInsurance)}`)
    lines.push(`Mensualite totale${sep}${fmt(schedule.totalMonthly)}`)
    lines.push(`Total interets${sep}${fmt(schedule.totalInterest)}`)
    lines.push(`Total assurance${sep}${fmt(schedule.totalInsurance)}`)
    lines.push(`Total frais${sep}${fmt(schedule.totalFees)}`)
    lines.push(`Cout total credit${sep}${fmt(schedule.totalCost)}`)
    lines.push(`TAEG approximatif (%)${sep}${fmt(schedule.aprPct)}`)
    lines.push('')
    lines.push(`Mois${sep}Date${sep}Mensualite${sep}Capital${sep}Interets${sep}Assurance${sep}CRD${sep}Differe`)
    for (const m of schedule.months) {
      lines.push([
        m.monthIndex,
        startDate ? format(new Date(new Date(startDate).setMonth(startDate.getMonth() + m.monthIndex - 1)), 'yyyy-MM-dd') : `M${m.monthIndex}`,
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
    link.href = url
    link.download = `amortissement-${safeName}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (schedule.months.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-secondary">
        Aucun crédit configuré pour ce bien.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header avec switch + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-surface-2 rounded-lg p-1">
          <button
            onClick={() => { setView('monthly'); setPage(0) }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${view === 'monthly' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
          >
            Mensuel · {schedule.months.length} lignes
          </button>
          <button
            onClick={() => setView('yearly')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${view === 'yearly' ? 'bg-accent text-white' : 'text-secondary hover:text-primary'}`}
          >
            Annuel · {schedule.years.length} ans
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
                {schedule.years.map((y) => (
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
            Mois {page * ROWS_PER_PAGE + 1} – {Math.min((page + 1) * ROWS_PER_PAGE, schedule.months.length)} sur {schedule.months.length}
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
