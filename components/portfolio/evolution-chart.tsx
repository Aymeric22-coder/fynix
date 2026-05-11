'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export interface SnapshotPoint {
  snapshot_date:      string
  total_market_value: number
  total_cost_basis:   number
  total_pnl:          number
}

interface Props {
  data:     SnapshotPoint[]
  currency?: string
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-44">
      <p className="text-xs text-secondary mb-2">{formatDate(label, 'medium')}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="text-xs text-secondary">{p.name}</span>
          <span className="text-sm financial-value font-medium" style={{ color: p.color }}>
            {formatCurrency(p.value, 'EUR', { decimals: 2 })}
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

export function PortfolioEvolutionChart({ data }: Props) {
  // Recharts plante parfois pendant l'hydratation (ResponsiveContainer mesure
  // le DOM). On reporte le rendu après le premier mount pour éviter ce
  // problème connu.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (data.length < 2) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-center px-6">
        <p className="text-sm text-secondary mb-1">
          {data.length === 0
            ? 'Pas encore de snapshot historique'
            : 'Un seul point — il en faut au moins 2 pour la courbe'}
        </p>
        <p className="text-xs text-muted max-w-sm">
          Un snapshot est créé chaque fois que tu cliques sur Rafraîchir et automatiquement chaque jour à 8h UTC.
        </p>
      </div>
    )
  }

  if (!mounted) {
    return <div className="h-56" />
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="portfolio-mv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="portfolio-cb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#6b7280" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#6b7280" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="snapshot_date"
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
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="total_cost_basis"
          name="Cost basis"
          stroke="#6b7280"
          fill="url(#portfolio-cb)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        <Area
          type="monotone"
          dataKey="total_market_value"
          name="Valeur de marché"
          stroke="#10b981"
          fill="url(#portfolio-mv)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
