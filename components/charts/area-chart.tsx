'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils/format'

interface AreaPoint {
  date:        string
  net_value:   number
  gross_value?: number
}

interface PatrimonyAreaChartProps {
  data:     AreaPoint[]
  currency?: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-40">
      <p className="text-xs text-secondary mb-2">{formatDate(label, 'medium')}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="text-xs text-secondary">{p.name}</span>
          <span className="text-sm financial-value font-medium" style={{ color: p.color }}>
            {formatCurrency(p.value, 'EUR', { compact: true })}
          </span>
        </div>
      ))}
    </div>
  )
}

function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000)     return `${(value / 1_000).toFixed(0)}k`
  return String(value)
}

export function PatrimonyAreaChart({ data }: PatrimonyAreaChartProps) {
  if (!data.length) return (
    <div className="h-56 flex items-center justify-center text-secondary text-sm">
      Pas encore de données — revenez demain après le premier snapshot.
    </div>
  )

  const hasGross = data.some((d) => d.gross_value !== undefined)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.10} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={50}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />

        {hasGross && (
          <Area
            type="monotone"
            dataKey="gross_value"
            name="Brut"
            stroke="#3b82f6"
            strokeWidth={1.5}
            fill="url(#gradGross)"
            dot={false}
            strokeDasharray="4 3"
          />
        )}
        <Area
          type="monotone"
          dataKey="net_value"
          name="Net"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gradNet)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
