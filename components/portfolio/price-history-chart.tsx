'use client'

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export interface PricePoint {
  priced_at: string  // ISO
  price:     number
  source:    string
}

interface Props {
  data:     PricePoint[]
  currency: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; payload: PricePoint }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]!.payload
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-44">
      <p className="text-xs text-secondary mb-1">{formatDate(label, 'medium')}</p>
      <p className="text-sm financial-value font-medium text-accent">
        {formatCurrency(p.price, 'EUR', { decimals: 2 })}
      </p>
      <p className="text-[10px] text-muted mt-1">{p.source}</p>
    </div>
  )
}

function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toFixed(0)
}

export function PriceHistoryChart({ data, currency }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (data.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-center px-6">
        <p className="text-sm text-secondary max-w-sm">
          {data.length === 0
            ? 'Aucun prix historique enregistré pour cet instrument.'
            : 'Un seul prix enregistré — il en faut au moins 2 pour la courbe. Reviens demain ou clique Rafraîchir.'}
        </p>
      </div>
    )
  }

  if (!mounted) {
    return <div className="h-56" />
  }

  // Tronque à yyyy-MM-dd pour l'axe X
  const series = data.map((d) => ({ ...d, dateKey: d.priced_at.slice(0, 10) }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={series} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="dateKey"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={(d: string) => {
            const dt = new Date(d)
            return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
          }}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={formatYAxis}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
          tickLine={false}
          width={56}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 2, fill: '#10b981' }}
          activeDot={{ r: 4 }}
          name={`Prix (${currency})`}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
