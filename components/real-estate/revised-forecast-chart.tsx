'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import type { RevisedForecastResult } from '@/lib/real-estate/forecast'
import type { ProjectionYear } from '@/lib/real-estate'
import { formatCurrency } from '@/lib/utils/format'

// ─── helpers ──────────────────────────────────────────────────────────

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

interface Props {
  /** Projection révisée (passé réel + futur simulé). */
  revised:  RevisedForecastResult
  /** Projection originale (sim seule, sans réel). */
  original: ProjectionYear[]
}

/**
 * Graphique comparant le cumul cash-flow original vs révisé.
 * La zone verte = révisé, ligne pointillée = original.
 * Une référence verticale marque l'année pivot.
 */
export function RevisedForecastChart({ revised, original }: Props) {
  const data = revised.projection.map((rev, i) => ({
    year:     rev.year,
    revised:  Math.round(rev.cumulativeCashFlow),
    original: Math.round(original[i]?.cumulativeCashFlow ?? 0),
  }))

  // Indice du pivot dans le tableau (la projection est 1-indexée par year)
  const pivotIdx = revised.projection.findIndex((p) => p.source === 'pivot')
  const pivotYearIdx = pivotIdx !== -1 ? revised.projection[pivotIdx]!.year : null

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gRevised" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <ReferenceLine y={0} stroke="#4b5563" strokeWidth={1} strokeDasharray="3 3" />
        {pivotYearIdx !== null && (
          <ReferenceLine
            x={pivotYearIdx}
            stroke="#f59e0b"
            strokeDasharray="3 3"
            label={{ value: 'Aujourd\'hui', position: 'top', fill: '#f59e0b', fontSize: 10 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="revised"
          name="Cumul révisé (réel + projection)"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gRevised)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="original"
          name="Cumul simulation initiale"
          stroke="#6b7280"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
