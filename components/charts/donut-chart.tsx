'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface DonutSlice {
  type:    string
  label:   string
  value:   number
  percent: number
  color:   string
}

interface DonutChartProps {
  data:       DonutSlice[]
  centerLabel?: string
  centerValue?: string
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: DonutSlice }[] }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-card text-sm">
      <p className="text-primary font-medium">{d.label}</p>
      <p className="text-accent financial-value">{formatCurrency(d.value, 'EUR', { compact: true })}</p>
      <p className="text-secondary">{formatPercent(d.percent)}</p>
    </div>
  )
}

export function DonutChart({ data, centerLabel, centerValue }: DonutChartProps) {
  if (!data.length) return (
    <div className="h-56 flex items-center justify-center text-secondary text-sm">
      Aucune donnée
    </div>
  )

  return (
    <div className="flex gap-6 items-center">
      {/* Donut */}
      <div className="relative flex-shrink-0 w-44 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%" cy="50%"
              innerRadius="60%" outerRadius="85%"
              dataKey="value"
              paddingAngle={2}
              startAngle={90} endAngle={-270}
            >
              {data.map((slice) => (
                <Cell key={slice.type} fill={slice.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Valeur centrale */}
        {centerValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-lg font-semibold financial-value text-primary leading-none">
              {centerValue}
            </p>
            {centerLabel && <p className="text-[10px] text-secondary mt-0.5">{centerLabel}</p>}
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="flex-1 space-y-2">
        {data.map((slice) => (
          <div key={slice.type} className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: slice.color }} />
            <span className="text-sm text-secondary flex-1 truncate">{slice.label}</span>
            <span className="text-sm financial-value text-primary">
              {formatPercent(slice.percent, { decimals: 1 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
