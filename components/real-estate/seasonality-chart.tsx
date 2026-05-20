'use client'

/**
 * Graphique "Revenus mensuels estimes — Saisonnalite" pour un bien
 * en location courte duree.
 *
 * Barres groupees :
 *  - bleue : CA brut mensuel
 *  - verte : revenu net proprietaire mensuel
 * Ligne (pointillee) sur axe Y secondaire 0-100 % :
 *  - taux d'occupation mensuel
 *
 * Tooltip personnalise : breakdown complet (jours dispo, jours occupes,
 * nb sejours, CA brut, commissions, frais ope, net proprio).
 */

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { AnnualShortTermRevenue, MonthlyRevenue } from '@/lib/real-estate/short-term/revenue'
import { formatCurrency } from '@/lib/utils/format'

const MONTHS_FR = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc',
] as const

const MONTHS_FR_FULL = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const

interface Props {
  data: AnnualShortTermRevenue
}

interface ChartRow {
  month:        string
  monthIndex:   number
  ca_brut:      number
  net_proprio:  number
  occupancy:    number
  raw:          MonthlyRevenue
}

export function SeasonalityChart({ data }: Props) {
  const rows: ChartRow[] = data.monthly.map((m, i) => ({
    month:       MONTHS_FR[i] ?? '',
    monthIndex:  i,
    ca_brut:     Math.round(m.grossRevenueTotal),
    net_proprio: Math.round(m.netOwnerRevenue),
    occupancy:   m.daysAvailable > 0
      ? Math.round((m.occupiedDays / m.daysAvailable) * 100)
      : 0,
    raw:         m,
  }))

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-primary">
            Revenus mensuels estimés — Saisonnalité
          </h3>
          <p className="text-xs text-muted">
            CA brut, net propriétaire, taux d&apos;occupation mois par mois.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>Net annuel : <span className="text-primary font-medium">{formatCurrency(Math.round(data.netOwnerRevenueTotal), 'EUR')}</span></p>
          <p>Occupation : <span className="text-primary font-medium">{data.annualOccupancyPct.toFixed(0)} %</span></p>
        </div>
      </div>

      <div className="w-full" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1f2937' }}
            />
            <YAxis
              yAxisId="left"
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1f2937' }}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k€` : `${v}€`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1f2937' }}
              domain={[0, 100]}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip content={<SeasonalityTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Legend
              verticalAlign="top"
              align="right"
              iconSize={10}
              wrapperStyle={{ fontSize: 11, paddingBottom: 6 }}
            />

            <Bar yAxisId="left" dataKey="ca_brut"     name="CA brut"          fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="left" dataKey="net_proprio" name="Net propriétaire" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="occupancy"
              name="Taux d'occupation"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ fill: '#f59e0b', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ChartRow }>
}

function SeasonalityTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const m = row.raw

  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-xs shadow-lg min-w-[200px]">
      <p className="text-primary font-medium mb-1.5">{MONTHS_FR_FULL[row.monthIndex]}</p>
      <Row label="Jours disponibles" value={`${m.daysAvailable}`} />
      <Row label="Jours occupés"     value={`${m.occupiedDays} (${row.occupancy} %)`} />
      <Row label="Nombre de séjours" value={`${m.nbStays}`} />
      <Divider />
      <Row label="CA brut"            value={fmt(m.grossRevenueTotal)} />
      <Row label="Commissions"        value={`-${fmt(m.platformCommission)}`} color="text-warning" />
      <Row label="Frais opé."         value={`-${fmt(m.cleaningCost + m.linenCost + m.conciergeFee)}`} color="text-warning" />
      <Divider />
      <Row label="Net propriétaire"   value={fmt(m.netOwnerRevenue)} color="text-accent" bold />
    </div>
  )
}

function Row({ label, value, color, bold }: {
  label: string
  value: string
  color?: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`${color ?? 'text-primary'} ${bold ? 'font-medium' : ''} financial-value`}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-border my-1" />
}

function fmt(v: number): string {
  return formatCurrency(Math.round(v), 'EUR')
}
