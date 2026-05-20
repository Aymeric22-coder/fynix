'use client'

/**
 * Vue tableau triable des biens immobiliers du portefeuille.
 * Ligne TOTAL en bas (style different).
 * Clic sur une ligne (hors header) ouvre la fiche du bien.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { USAGE_TYPE_LABELS } from '@/types/database.types'
import type { RealEstatePortfolioSummary } from '@/lib/real-estate/portfolio-summary'

type SortKey =
  | 'name' | 'usageType' | 'currentValue' | 'remainingCapital'
  | 'netWorth' | 'monthlyRent' | 'monthlyNetCashFlow'
  | 'grossYieldPct' | 'netNetYieldPct'

type SortDir = 'asc' | 'desc'

interface Props {
  summary: RealEstatePortfolioSummary
}

export function PropertiesTableView({ summary }: Props) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>('netNetYieldPct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const arr = [...summary.properties]
    arr.sort((a, b) => {
      const va = (a[sortKey] ?? 0) as number | string
      const vb = (b[sortKey] ?? 0) as number | string
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const na = Number(va), nb = Number(vb)
      return sortDir === 'asc' ? na - nb : nb - na
    })
    return arr
  }, [summary.properties, sortKey, sortDir])

  function handleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(k)
      setSortDir(k === 'name' || k === 'usageType' ? 'asc' : 'desc')
    }
  }

  if (summary.properties.length === 0) return null

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/50 text-left">
            <Th k="name"               sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Bien</Th>
            <Th k="usageType"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Type</Th>
            <Th k="currentValue"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Valeur</Th>
            <Th k="remainingCapital"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">CRD</Th>
            <Th k="netWorth"           sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Net</Th>
            <Th k="monthlyRent"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Loyers/m</Th>
            <Th k="monthlyNetCashFlow" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">CF/m</Th>
            <Th k="grossYieldPct"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Brut</Th>
            <Th k="netNetYieldPct"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">Net-net</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr
              key={p.id}
              onClick={() => router.push(`/immobilier/${p.id}`)}
              className="border-b border-border hover:bg-surface-2 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2.5">
                <div className="text-primary font-medium">{p.name}</div>
                {p.city && <div className="text-xs text-muted">{p.city}</div>}
              </td>
              <td className="px-3 py-2.5 text-secondary text-xs">{USAGE_TYPE_LABELS[p.usageType]}</td>
              <td className="px-3 py-2.5 text-right financial-value text-primary">
                {formatCurrency(p.currentValue, 'EUR', { compact: true })}
              </td>
              <td className={`px-3 py-2.5 text-right financial-value ${p.remainingCapital > 0 ? 'text-danger' : 'text-muted'}`}>
                {p.remainingCapital > 0 ? formatCurrency(p.remainingCapital, 'EUR', { compact: true }) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right financial-value text-accent">
                {formatCurrency(p.netWorth, 'EUR', { compact: true })}
              </td>
              <td className="px-3 py-2.5 text-right financial-value text-primary">
                {p.monthlyRent > 0 ? formatCurrency(p.monthlyRent, 'EUR') : '—'}
              </td>
              <td className={`px-3 py-2.5 text-right financial-value ${p.monthlyNetCashFlow > 0 ? 'text-accent' : p.monthlyNetCashFlow < 0 ? 'text-danger' : 'text-muted'}`}>
                {p.monthlyNetCashFlow !== 0 ? formatCurrency(p.monthlyNetCashFlow, 'EUR', { sign: true }) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right financial-value text-secondary">
                {p.grossYieldPct > 0 ? formatPercent(p.grossYieldPct) : '—'}
              </td>
              <td className="px-3 py-2.5 text-right financial-value text-secondary">
                {p.netNetYieldPct !== 0 ? formatPercent(p.netNetYieldPct) : '—'}
              </td>
            </tr>
          ))}

          {/* ─── Ligne TOTAL ───────────────────────────────── */}
          <tr className="bg-surface-2/50 font-medium">
            <td className="px-3 py-3 text-primary" colSpan={2}>TOTAL portefeuille</td>
            <td className="px-3 py-3 text-right financial-value text-primary">
              {formatCurrency(summary.totalCurrentValue, 'EUR', { compact: true })}
            </td>
            <td className="px-3 py-3 text-right financial-value text-danger">
              {summary.totalDebt > 0 ? formatCurrency(summary.totalDebt, 'EUR', { compact: true }) : '—'}
            </td>
            <td className="px-3 py-3 text-right financial-value text-accent">
              {formatCurrency(summary.totalNetWorth, 'EUR', { compact: true })}
            </td>
            <td className="px-3 py-3 text-right financial-value text-primary">
              {formatCurrency(summary.totalMonthlyRent, 'EUR')}
            </td>
            <td className={`px-3 py-3 text-right financial-value ${summary.totalMonthlyCashFlow >= 0 ? 'text-accent' : 'text-danger'}`}>
              {formatCurrency(summary.totalMonthlyCashFlow, 'EUR', { sign: true })}
            </td>
            <td className="px-3 py-3 text-right financial-value text-secondary">
              {summary.weightedGrossYieldPct > 0 ? formatPercent(summary.weightedGrossYieldPct) : '—'}
            </td>
            <td className="px-3 py-3 text-right financial-value text-secondary">
              {summary.weightedNetNetYieldPct !== 0 ? formatPercent(summary.weightedNetNetYieldPct) : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, k, sortKey, sortDir, onSort, align = 'left' }: {
  children: React.ReactNode
  k:        SortKey
  sortKey:  SortKey
  sortDir:  SortDir
  onSort:   (k: SortKey) => void
  align?:   'left' | 'right'
}) {
  const isActive = k === sortKey
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-3 py-2 text-[11px] uppercase tracking-wider text-secondary font-medium cursor-pointer hover:text-primary select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {isActive && (sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </span>
    </th>
  )
}
