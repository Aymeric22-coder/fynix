'use client'

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import type { ProjectionYear } from '@/lib/real-estate'
import { formatCurrency } from '@/lib/utils/format'

// ─── helpers ───────────────────────────────────────────────────────────────

function yFmt(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

function TooltipBox({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-44 text-xs">
      <p className="text-secondary mb-2 font-medium">Année {label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="text-muted">{p.name}</span>
          <span className="financial-value font-medium" style={{ color: p.color }}>
            {formatCurrency(p.value, 'EUR', { compact: true })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Chart 1 : Valeur bien vs Capital restant dû ───────────────────────────

export function CapitalVsValueChart({ projection }: { projection: ProjectionYear[] }) {
  const data = projection.map((y) => ({
    year:           y.year,
    valeur:         Math.round(y.estimatedValue),
    capital:        Math.round(y.remainingCapital ?? 0),
    valeurNette:    Math.round(y.netPropertyValue),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gValeur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gNette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Area type="monotone" dataKey="valeur"     name="Valeur bien"    stroke="#3b82f6" strokeWidth={2} fill="url(#gValeur)" dot={false} />
        <Area type="monotone" dataKey="valeurNette" name="Valeur nette"  stroke="#10b981" strokeWidth={2} fill="url(#gNette)"  dot={false} />
        <Area type="monotone" dataKey="capital"    name="Capital restant" stroke="#f59e0b" strokeWidth={1.5} fill="none" strokeDasharray="4 3" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Chart 2 : Cash-flow annuel après impôts ──────────────────────────────

export function AnnualCashFlowChart({ projection }: { projection: ProjectionYear[] }) {
  const data = projection.map((y) => ({
    year: y.year,
    cashflow: Math.round(y.cashFlowAfterTax),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<TooltipBox />} />
        <ReferenceLine y={0} stroke="#4b5563" strokeWidth={1} />
        <Bar
          dataKey="cashflow"
          name="Cash-flow net"
          radius={[3, 3, 0, 0]}
          fill="#10b981"
          // Colorie en rouge si négatif — recharts le gère via Cell ou on accepte la couleur uniforme
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Chart 3 : Cash-flow cumulé ───────────────────────────────────────────

export function CumulativeCashFlowChart({ projection }: { projection: ProjectionYear[] }) {
  const data = projection.map((y) => ({
    year:   y.year,
    cumul:  Math.round(y.cumulativeCashFlow),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gCumul" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<TooltipBox />} />
        <ReferenceLine y={0} stroke="#4b5563" strokeWidth={1} strokeDasharray="4 3" />
        <Area
          type="monotone"
          dataKey="cumul"
          name="Cash-flow cumulé"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gCumul)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
