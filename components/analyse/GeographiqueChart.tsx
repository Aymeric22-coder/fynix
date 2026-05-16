/**
 * Section "Analyse géographique" : comparée au benchmark MSCI ACWI.
 * Réutilise BenchmarkBarList de SectorielleChart.
 *
 * Couleurs par statut de déviation :
 *   - aligned          → bleu (proche du marché mondial)
 *   - overweight       → orange (surpondération > +15pts)
 *   - overweight_strong→ danger (surpondération > +30pts)
 *   - underweight      → violet (sous-pondération < −20pts)
 */
'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { MiniRing } from './MiniRing'
import { BenchmarkBarList } from './SectorielleChart'
import { BenchmarkNote } from './BenchmarkNote'
import type { GeoAlloc } from '@/types/analyse'

interface Props {
  buckets: GeoAlloc[]
  score:   number
}

export function GeographiqueChart({ buckets, score }: Props) {
  const alertes = buckets.filter((b) => b.status === 'overweight' || b.status === 'overweight_strong')

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Analyse géographique</p>
          <p className="text-xs text-muted mt-0.5">Benchmark : MSCI ACWI (9 zones)</p>
        </div>
        <MiniRing score={score} caption="Alignement marché" />
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucune position à analyser.</p>
      ) : (
        <>
          <BenchmarkBarList
            rows={buckets.map((b) => ({
              key:       b.zone,
              label:     b.zone,
              pct:       b.pourcentage,
              benchmark: b.benchmark,
              deviation: b.deviation,
              status:    b.status,
              tooltip:   b.pays.length > 0 ? b.pays.slice(0, 8).join(', ') : undefined,
            }))}
          />

          {alertes.length > 0 && (
            <div className="mt-4 space-y-2">
              {alertes.map((a) => (
                <div key={a.zone} className={cn(
                  'flex items-start gap-2 border rounded-lg px-3 py-2 text-xs',
                  a.status === 'overweight_strong' ? 'bg-danger-muted border-danger/30' : 'bg-warning-muted border-warning/30',
                )}>
                  <AlertTriangle size={13} className={cn('flex-shrink-0 mt-0.5', a.status === 'overweight_strong' ? 'text-danger' : 'text-warning')} />
                  <span className="text-primary">
                    Surpondération <span className={cn('font-medium', a.status === 'overweight_strong' ? 'text-danger' : 'text-warning')}>{a.zone}</span> de <span className="financial-value">{a.deviation > 0 ? '+' : ''}{a.deviation.toFixed(1)} pts</span> vs MSCI ACWI ({a.benchmark.toFixed(0)} % attendu) — possible biais home country.
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <BenchmarkNote />
          </div>
        </>
      )}
    </div>
  )
}
