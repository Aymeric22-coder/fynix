/**
 * Section "Analyse géographique" : barres horizontales par zone
 * (Amérique du Nord / Europe / Asie / …) + alertes > 50 %.
 */
'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { MiniRing } from './MiniRing'
import type { GeoAlloc } from '@/types/analyse'

interface Props {
  buckets: GeoAlloc[]
  score:   number
}

const GEO_ALERT_PCT = 50

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: GeoAlloc }> }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-card text-xs space-y-1 max-w-xs">
      <p className="text-primary font-medium">{d.zone}</p>
      <p className="text-accent financial-value">
        {formatCurrency(d.valeur, 'EUR', { compact: true })} · {formatPercent(d.pourcentage, { decimals: 1 })}
      </p>
      {d.pays.length > 0 && (
        <p className="text-muted leading-relaxed">{d.pays.slice(0, 8).join(', ')}</p>
      )}
    </div>
  )
}

export function GeographiqueChart({ buckets, score }: Props) {
  const alertes = buckets.filter((b) => b.alerte)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Analyse géographique</p>
          <p className="text-xs text-muted mt-0.5">Barres oranges au-delà de {GEO_ALERT_PCT} %</p>
        </div>
        <MiniRing score={score} caption="Diversification" />
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucune position à analyser.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: Math.max(180, buckets.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis dataKey="zone" type="category" width={140} tick={{ fill: '#71717a', fontSize: 11 }} />
                <Tooltip cursor={{ fill: '#181818' }} content={<CustomTooltip />} />
                <Bar dataKey="valeur" radius={[0, 4, 4, 0]}>
                  {buckets.map((b, i) => (
                    <Cell key={i} fill={b.alerte ? '#f97316' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {alertes.length > 0 && (
            <div className="mt-4 space-y-2">
              {alertes.map((a) => (
                <div key={a.zone} className="flex items-start gap-2 bg-warning-muted border border-warning/30 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle size={13} className="text-warning flex-shrink-0 mt-0.5" />
                  <span className="text-primary">
                    Concentration <span className="text-warning font-medium">{a.zone}</span> ({formatPercent(a.pourcentage, { decimals: 1 })}) — seuil recommandé : {GEO_ALERT_PCT} %
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
