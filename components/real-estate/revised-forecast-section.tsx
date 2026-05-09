'use client'

import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import type { RevisedForecastResult } from '@/lib/real-estate/forecast'
import type { ProjectionYear } from '@/lib/real-estate'
import { RevisedForecastChart } from './revised-forecast-chart'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  revised:  RevisedForecastResult
  original: ProjectionYear[]
}

export function RevisedForecastSection({ revised, original }: Props) {
  if (revised.isEmpty) return null

  const driftPositive = revised.drift >= 0
  const finalDelta    = revised.finalNetValue - revised.finalNetValueOriginal
  const finalDeltaPositive = finalDelta >= 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-primary">Forecast révisé</h2>
          <p className="text-xs text-secondary mt-0.5">
            Projection mise à jour avec les données réelles cumulées au {revised.pivotYear}
          </p>
        </div>
      </div>

      {/* KPIs drift */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Drift à date */}
        <div className={`card p-4 ${driftPositive ? 'border-accent/20' : 'border-danger/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-secondary uppercase tracking-wider">Écart à date</p>
            {driftPositive ? <TrendingUp size={13} className="text-accent" /> : <TrendingDown size={13} className="text-danger" />}
          </div>
          <p className={`text-lg font-semibold financial-value ${driftPositive ? 'text-accent' : 'text-danger'}`}>
            {driftPositive ? '+' : ''}{formatCurrency(revised.drift, 'EUR', { compact: true })}
          </p>
          <p className="text-xs text-muted mt-1">vs simulation initiale</p>
        </div>

        {/* Cumul réel */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-secondary uppercase tracking-wider">Cumul réel</p>
            <Calendar size={13} className="text-muted" />
          </div>
          <p className="text-lg font-semibold financial-value text-primary">
            {formatCurrency(revised.cumulRealAtPivot, 'EUR', { compact: true })}
          </p>
          <p className="text-xs text-muted mt-1">{revised.elapsedYears} année{revised.elapsedYears > 1 ? 's' : ''} écoulée{revised.elapsedYears > 1 ? 's' : ''}</p>
        </div>

        {/* Patrimoine net final révisé */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-secondary uppercase tracking-wider">Patrimoine net final</p>
            {finalDeltaPositive ? <TrendingUp size={13} className="text-accent" /> : <TrendingDown size={13} className="text-danger" />}
          </div>
          <p className="text-lg font-semibold financial-value text-primary">
            {formatCurrency(revised.finalNetValue, 'EUR', { compact: true })}
          </p>
          <p className={`text-xs mt-1 ${finalDeltaPositive ? 'text-accent' : 'text-danger'}`}>
            {finalDeltaPositive ? '+' : ''}{formatCurrency(finalDelta, 'EUR', { compact: true })} vs initial
          </p>
        </div>
      </div>

      {/* Graphique cumul révisé vs original */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-4">
          Trajectoire cumul cash-flow · réel + projection
        </p>
        <RevisedForecastChart revised={revised} original={original} />
      </div>
    </div>
  )
}
