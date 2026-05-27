/**
 * Carte KPI « Revenus estimes / an » (DCAL).
 *
 * Affiche la projection annuelle des dividendes (somme de toutes les
 * positions distributrices) + un badge de confiance qui distingue les
 * projections fiables (≥ 3 versements detectes) des estimations faibles
 * (1-2 versements).
 *
 * Alimente par `summary.dividendCalendar` (cf. `lib/portfolio/build-from-db.ts`).
 * Rendu conditionnel : null si `data === null` ou aucune projection.
 *
 * Server Component — pas d'interactivite.
 */

import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { DividendProjection } from '@/lib/portfolio/dividend-calendar'

interface Props {
  data: {
    totalAnnualProjectionRef: number
    projections:              DividendProjection[]
  } | null
  currency: string
  className?: string
}

export function DividendProjectionCard({ data, currency, className }: Props) {
  if (!data || data.projections.length === 0) return null

  const high = data.projections.filter((p) => p.confidenceLevel === 'high').length
  const low  = data.projections.length - high

  return (
    <div className={['card p-5', className ?? ''].join(' ')}>
      <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
        <TrendingUp size={11} /> Revenus estimés / an
      </p>
      <p className="text-xl font-semibold financial-value text-accent mt-2">
        {formatCurrency(data.totalAnnualProjectionRef, currency, { compact: true })}
      </p>
      <p className="text-xs text-secondary mt-1">
        basé sur {data.projections.length} position{data.projections.length > 1 ? 's' : ''} distributrice{data.projections.length > 1 ? 's' : ''}
      </p>
      {(high > 0 || low > 0) && (
        <div className="mt-3 flex items-center gap-3 text-[10px]">
          {high > 0 && (
            <span className="text-accent">
              ● {high} haute confiance
            </span>
          )}
          {low > 0 && (
            <span className="text-muted">
              ● {low} basse confiance
            </span>
          )}
        </div>
      )}
    </div>
  )
}
