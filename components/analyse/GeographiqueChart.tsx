/**
 * Section "Analyse géographique" : liste de barres horizontales HTML/CSS
 * (même approche que SectorielleChart). Réutilise le composant BarList.
 *
 * Bande orange si zone > 50 % (concentration géographique).
 */
'use client'

import { AlertTriangle } from 'lucide-react'
import { formatPercent } from '@/lib/utils/format'
import { MiniRing } from './MiniRing'
import { BarList } from './SectorielleChart'
import type { GeoAlloc } from '@/types/analyse'

interface Props {
  buckets: GeoAlloc[]
  score:   number
}

const GEO_ALERT_PCT = 50

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
          <BarList
            rows={buckets.map((b) => ({
              key:    b.zone,
              label:  b.zone,
              pct:    b.pourcentage,
              alerte: b.alerte,
              tooltip: b.pays.length > 0 ? b.pays.slice(0, 8).join(', ') : undefined,
            }))}
            colorAlerte="bg-warning"
            colorNormal="bg-blue-400"
          />

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
