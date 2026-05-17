'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils/format'

export interface SnapshotPoint {
  snapshot_date:      string
  total_market_value: number
  total_cost_basis:   number
  total_pnl:          number
}

/** Valeurs des cartes KPI affichées au-dessus du graphique. Permet à
 *  l'assertion dev de détecter une désynchronisation entre les deux. */
export interface LiveKpisProp {
  totalMarketValue:   number
  totalCostBasis:     number
  totalUnrealizedPnL: number | null
}

interface Props {
  data:     SnapshotPoint[]
  currency?: string
  live?:    LiveKpisProp
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 shadow-card min-w-52">
      <p className="text-xs text-secondary mb-2">{formatDate(label, 'medium')}</p>
      {payload.map((p) => {
        const isPnl = p.dataKey === 'total_pnl'
        const color = isPnl
          ? (p.value >= 0 ? '#10b981' : '#ef4444')
          : p.color
        return (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="text-xs text-secondary">{p.name}</span>
            <span className="text-sm financial-value font-medium" style={{ color }}>
              {formatCurrency(p.value, 'EUR', { decimals: 2, sign: isPnl })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000)     return `${(value / 1_000).toFixed(0)}k`
  return String(value)
}

function formatPnlAxis(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}k`
  return `${sign}${abs}`
}

export function PortfolioEvolutionChart({ data, live }: Props) {
  // Recharts plante parfois pendant l'hydratation (ResponsiveContainer mesure
  // le DOM). On reporte le rendu après le premier mount pour éviter ce
  // problème connu.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Assertion dev : le dernier point du graphique doit correspondre aux KPI
  // affichés dans les cartes au-dessus, sinon l'utilisateur voit deux
  // chiffres différents pour la même chose. Tolérance 1€ pour les arrondis.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !live || data.length === 0) return
    const last = data[data.length - 1]!
    const dMv  = Math.abs(last.total_market_value - live.totalMarketValue)
    const dCb  = Math.abs(last.total_cost_basis   - live.totalCostBasis)
    if (dMv > 1 || dCb > 1) {
      console.warn(
        '[evolution-chart] INCOHÉRENCE graphique / KPI :',
        `mv Δ${dMv.toFixed(2)} / cb Δ${dCb.toFixed(2)}`,
        { lastPoint: last, live },
      )
    }
  }, [data, live])

  // Couleur dominante du PnL (vert si dernier point > 0, rouge sinon) — sert
  // a colorer la ligne unique du PnL latent puisque Recharts ne supporte pas
  // nativement un trait change de couleur selon le signe par segment.
  const pnlColor = useMemo(() => {
    const last = data[data.length - 1]
    if (!last) return '#10b981'
    return last.total_pnl >= 0 ? '#10b981' : '#ef4444'
  }, [data])

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
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 16, right: 56, left: 0, bottom: 0 }}>
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
        {/* Axe gauche : montants (Capital investi + Valeur actuelle) */}
        <YAxis
          yAxisId="value"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={formatYAxis}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
          tickLine={false}
          width={48}
        />
        {/* Axe droit : plus-value latente (echelle independante car beaucoup
            plus petite que les montants absolus) */}
        <YAxis
          yAxisId="pnl"
          orientation="right"
          tick={{ fontSize: 11, fill: pnlColor }}
          tickFormatter={formatPnlAxis}
          axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
          tickLine={false}
          width={48}
        />
        <ReferenceLine
          yAxisId="pnl"
          y={0}
          stroke="rgba(255,255,255,0.15)"
          strokeDasharray="2 4"
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          yAxisId="value"
          type="monotone"
          dataKey="total_cost_basis"
          name="Capital investi"
          stroke="#6b7280"
          fill="url(#portfolio-cb)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
        <Area
          yAxisId="value"
          type="monotone"
          dataKey="total_market_value"
          name="Valeur actuelle"
          stroke="#10b981"
          fill="url(#portfolio-mv)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="pnl"
          type="monotone"
          dataKey="total_pnl"
          name="Plus-value latente"
          stroke={pnlColor}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
