/**
 * Section "Analyse sectorielle" : barres horizontales + alertes de
 * surexposition (> 30 %).
 *
 * Recharts BarChart layout="vertical" pour des barres horizontales.
 */
'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { MiniRing } from './MiniRing'
import type { SecteurAlloc } from '@/types/analyse'

interface Props {
  buckets: SecteurAlloc[]
  score:   number
}

const SECTOR_ALERT_PCT = 30

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SecteurAlloc }> }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-card text-xs space-y-1 max-w-xs">
      <p className="text-primary font-medium">{d.secteur}</p>
      <p className="text-accent financial-value">
        {formatCurrency(d.valeur, 'EUR', { compact: true })} · {formatPercent(d.pourcentage, { decimals: 1 })}
      </p>
      {d.positions.length > 0 && (
        <p className="text-muted leading-relaxed">
          {d.positions.slice(0, 5).join(', ')}{d.positions.length > 5 ? ' …' : ''}
        </p>
      )}
    </div>
  )
}

export function SectorielleChart({ buckets, score }: Props) {
  const alertes = buckets.filter((b) => b.alerte)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Analyse sectorielle</p>
          <p className="text-xs text-muted mt-0.5">Barres rouges au-delà de {SECTOR_ALERT_PCT} %</p>
        </div>
        <MiniRing score={score} caption="Diversification" />
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucune position à analyser.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: Math.max(180, buckets.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} layout="vertical" margin={{ left: 0, right: 50, top: 4, bottom: 4 }}>
                {/* Axe X visible en % pour donner une échelle de référence (0-100). */}
                <XAxis
                  type="number" domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                />
                <YAxis dataKey="secteur" type="category" width={140} tick={{ fill: '#71717a', fontSize: 11 }} />
                <Tooltip cursor={{ fill: '#181818' }} content={<CustomTooltip />} />
                {/* Bar dimensionnée par % (et plus par valeur €) — directement comparable. */}
                <Bar dataKey="pourcentage" radius={[0, 4, 4, 0]}>
                  {buckets.map((b, i) => (
                    <Cell key={i} fill={b.alerte ? '#ef4444' : '#10b981'} />
                  ))}
                  <LabelList
                    dataKey="pourcentage"
                    position="right"
                    formatter={(v: number) => `${v.toFixed(1)} %`}
                    style={{ fill: '#f4f4f5', fontSize: 11, fontWeight: 500 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {alertes.length > 0 && (
            <div className="mt-4 space-y-2">
              {alertes.map((a) => (
                <div key={a.secteur} className="flex items-start gap-2 bg-danger-muted border border-danger/30 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle size={13} className="text-danger flex-shrink-0 mt-0.5" />
                  <span className="text-primary">
                    Surexposition <span className="text-danger font-medium">{a.secteur}</span> ({formatPercent(a.pourcentage, { decimals: 1 })}) — seuil recommandé : {SECTOR_ALERT_PCT} %
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
