'use client'

import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot, Legend,
} from 'recharts'
import type { ProjectionYear } from '@/lib/real-estate'
import { formatCurrency } from '@/lib/utils/format'

// ─── Couleurs sémantiques ──────────────────────────────────────────────────
const COLORS = {
  value:    '#3b82f6',   // bleu : valeur du bien
  netValue: '#10b981',   // vert : valeur nette (= patrimoine)
  capital:  '#f59e0b',   // orange : capital restant dû
  positive: '#10b981',
  negative: '#ef4444',
  zero:     '#71717a',
  gridDark: '#1f2937',
}

// ─── helpers ───────────────────────────────────────────────────────────────

/** Formate les ticks de l'axe Y : "450 k€", "1,2 M€". */
function yAxisFmt(v: number): string {
  if (v === 0) return '0 €'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M€`
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)} k€`
  return `${v} €`
}

/** "An X" pour l'axe X. */
function xTickFmt(v: number): string {
  return `An ${v}`
}

/** Tick X "intelligent" : 1, 5, 10, 15, ... pour ne pas surcharger. */
function smartXTicks(projectionLen: number): number[] {
  if (projectionLen <= 10) {
    return Array.from({ length: projectionLen }, (_, i) => i + 1)
  }
  const ticks = [1]
  for (let y = 5; y <= projectionLen; y += 5) ticks.push(y)
  if (ticks[ticks.length - 1] !== projectionLen) ticks.push(projectionLen)
  return ticks
}

// ─── Tooltip générique (utilisé par tous les charts) ───────────────────────

interface TooltipRow {
  label:   string
  value:   number
  color?:  string
  bold?:   boolean
  divider?: boolean
}

function TooltipBox({
  title, rows,
}: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-52 text-xs">
      <p className="text-secondary mb-2 font-medium">{title}</p>
      {rows.map((r, i) => (
        <div key={i}>
          {r.divider && <div className="my-1.5 border-t border-border" />}
          <div className="flex items-center justify-between gap-6">
            <span className={r.bold ? 'text-primary font-medium' : 'text-muted'}>{r.label}</span>
            <span
              className={`financial-value tabular-nums ${r.bold ? 'font-semibold' : 'font-medium'}`}
              style={{ color: r.color }}
            >
              {formatCurrency(r.value, 'EUR', { sign: r.value > 0 && r.label.includes('lus-value') })}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Chart 1 : Valeur bien vs Capital restant dû ───────────────────────────

export function CapitalVsValueChart({ projection }: { projection: ProjectionYear[] }) {
  const data = projection.map((y) => ({
    year:          y.year,
    valeur:        Math.round(y.estimatedValue),
    capital:       Math.round(y.remainingCapital ?? 0),
    valeurNette:   Math.round(y.netPropertyValue),
    plusValue:     Math.round(y.estimatedValue - (projection[0]?.estimatedValue ?? y.estimatedValue)),
  }))

  // Année où le crédit est soldé (CRD passe à 0)
  const creditPaidOffYear = projection.find(
    (y, i) => y.remainingCapital === 0 && (projection[i - 1]?.remainingCapital ?? 1) > 0,
  )?.year

  // Custom tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as typeof data[0]
    return (
      <TooltipBox
        title={`Année ${label}`}
        rows={[
          { label: 'Valeur du bien',    value: p.valeur,      color: COLORS.value },
          { label: 'Capital restant',   value: p.capital,     color: COLORS.capital },
          { label: 'Valeur nette',      value: p.valeurNette, color: COLORS.netValue, bold: true, divider: true },
          { label: 'Plus-value lat.',   value: p.plusValue,   color: p.plusValue >= 0 ? COLORS.positive : COLORS.negative },
        ]}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 8 }}>
        <defs>
          <linearGradient id="gValeur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLORS.value}    stopOpacity={0.15} />
            <stop offset="95%" stopColor={COLORS.value}    stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gNette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLORS.netValue} stopOpacity={0.20} />
            <stop offset="95%" stopColor={COLORS.netValue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridDark} />
        <XAxis
          dataKey="year"
          ticks={smartXTicks(projection.length)}
          tickFormatter={xTickFmt}
          tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
        />
        <YAxis tickFormatter={yAxisFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
        <Tooltip content={<Tip />} cursor={{ stroke: '#71717a', strokeDasharray: '3 3' }} />
        <Legend
          verticalAlign="top" align="right"
          wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
          iconType="line"
        />
        <Area type="monotone" dataKey="valeur"      name="Valeur bien"     stroke={COLORS.value}    strokeWidth={2} fill="url(#gValeur)" dot={false} />
        <Area type="monotone" dataKey="valeurNette" name="Valeur nette"    stroke={COLORS.netValue} strokeWidth={2} fill="url(#gNette)"  dot={false} />
        <Area type="monotone" dataKey="capital"     name="Capital restant" stroke={COLORS.capital}  strokeWidth={1.5} fill="none" strokeDasharray="4 3" dot={false} />
        {creditPaidOffYear && (
          <ReferenceLine
            x={creditPaidOffYear}
            stroke={COLORS.capital}
            strokeDasharray="3 3"
            label={{ value: 'Crédit soldé', position: 'top', fill: COLORS.capital, fontSize: 10 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Chart 2 : Cash-flow annuel net ────────────────────────────────────────

export function AnnualCashFlowChart({ projection }: { projection: ProjectionYear[] }) {
  const data = projection.map((y) => ({
    year:           y.year,
    cashflow:       Math.round(y.cashFlowAfterTax),
    netRent:        Math.round(y.netRent),
    charges:        Math.round(y.charges),
    loanPayment:    Math.round(y.loanPayment),
    tax:            Math.round(y.taxPaid),
  }))

  // Première année avec cash-flow ≥ 0 (= break-even d'exploitation)
  const firstPositiveYear = projection.find(y => y.cashFlowAfterTax >= 0)?.year

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as typeof data[0]
    return (
      <TooltipBox
        title={`Année ${label}`}
        rows={[
          { label: 'Loyers nets',    value:  p.netRent,         color: COLORS.positive },
          { label: 'Charges',        value: -p.charges,         color: COLORS.negative },
          { label: 'Mensualités',    value: -p.loanPayment,     color: COLORS.negative },
          { label: 'Impôts',         value: -p.tax,             color: COLORS.negative },
          { label: 'Cash-flow net',  value:  p.cashflow,        color: p.cashflow >= 0 ? COLORS.positive : COLORS.negative, bold: true, divider: true },
        ]}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridDark} vertical={false} />
        <XAxis
          dataKey="year"
          ticks={smartXTicks(projection.length)}
          tickFormatter={xTickFmt}
          tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
        />
        <YAxis tickFormatter={yAxisFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(113,113,122,0.08)' }} />
        <ReferenceLine y={0} stroke={COLORS.zero} strokeWidth={1.2} />
        <Bar dataKey="cashflow" name="Cash-flow net" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.cashflow >= 0 ? COLORS.positive : COLORS.negative} />
          ))}
        </Bar>
        {firstPositiveYear && firstPositiveYear > 1 && (
          <ReferenceDot
            x={firstPositiveYear} y={0}
            r={3} fill={COLORS.positive} stroke="none"
            label={{ value: 'Break-even', position: 'top', fill: COLORS.positive, fontSize: 10 }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Chart 3 : Cash-flow cumulé ────────────────────────────────────────────

export function CumulativeCashFlowChart({ projection }: { projection: ProjectionYear[] }) {
  const data = projection.map((y) => ({
    year:  y.year,
    cumul: Math.round(y.cumulativeCashFlow),
  }))

  // Année où le cumul passe au-dessus de 0 (= remboursement de l'apport)
  const paybackYear = projection.find(
    (y, i) => y.cumulativeCashFlow >= 0 && (projection[i - 1]?.cumulativeCashFlow ?? -1) < 0,
  )?.year

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const p = payload[0].payload as typeof data[0]
    const isRecovered = p.cumul >= 0
    return (
      <TooltipBox
        title={`Année ${label}`}
        rows={[
          {
            label: 'Cash-flow cumulé',
            value: p.cumul,
            color: isRecovered ? COLORS.positive : COLORS.negative,
            bold:  true,
          },
          ...(isRecovered
            ? [{ label: 'Apport récupéré', value: 0, color: COLORS.positive }]
            : []),
        ]}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
        <defs>
          <linearGradient id="gCumulPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={COLORS.positive} stopOpacity={0.25} />
            <stop offset="95%" stopColor={COLORS.positive} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCumulNeg" x1="0" y1="1" x2="0" y2="0">
            <stop offset="5%"  stopColor={COLORS.negative} stopOpacity={0.25} />
            <stop offset="95%" stopColor={COLORS.negative} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gridDark} />
        <XAxis
          dataKey="year"
          ticks={smartXTicks(projection.length)}
          tickFormatter={xTickFmt}
          tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
        />
        <YAxis tickFormatter={yAxisFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
        <Tooltip content={<Tip />} cursor={{ stroke: COLORS.zero, strokeDasharray: '3 3' }} />
        <ReferenceLine
          y={0} stroke={COLORS.zero} strokeWidth={1.2}
          label={{ value: '0 €', position: 'right', fill: COLORS.zero, fontSize: 10 }}
        />
        {/* Aire positive (au-dessus de 0) */}
        <Area
          type="monotone" dataKey={(d) => Math.max(0, d.cumul)} name="Apport récupéré"
          stroke={COLORS.positive} strokeWidth={2}
          fill="url(#gCumulPos)" dot={false}
        />
        {/* Aire négative (sous 0) — superposée pour la couleur, ligne unique */}
        <Area
          type="monotone" dataKey={(d) => Math.min(0, d.cumul)} name="Effort d'épargne"
          stroke={COLORS.negative} strokeWidth={2}
          fill="url(#gCumulNeg)" dot={false}
        />
        {paybackYear && (
          <ReferenceDot
            x={paybackYear} y={0}
            r={4} fill={COLORS.positive} stroke="white" strokeWidth={1.5}
            label={{
              value: `Remboursement de l'apport · An ${paybackYear}`,
              position: 'top', fill: COLORS.positive, fontSize: 10,
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
