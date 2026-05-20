'use client'

import { formatCurrency } from '@/lib/utils/format'
import { Star } from 'lucide-react'
import { computeDenormandie } from '@/lib/real-estate/fiscal/incentives/denormandie'
import type { PinelDuration, PinelZone } from '@/lib/real-estate/fiscal/incentives/pinel'

interface Props {
  duration:      PinelDuration
  zone:          PinelZone
  purchasePrice: number
  worksAmount:   number
  surfaceM2:     number
  startYear:     number
  annualRentHC:  number
  tmiPct:        number
}

export function DenormandiePanel(props: Props) {
  const r = computeDenormandie(props)
  const currentYear = new Date().getFullYear()
  const yearsRemaining = Math.max(0, props.duration - Math.max(0, currentYear - props.startYear))

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-primary flex items-center gap-2">
          <Star size={14} className="text-accent" />
          DENORMANDIE · Zone {props.zone} · {props.duration} ans
          <span className="text-secondary font-normal text-xs">depuis {props.startYear}</span>
        </h3>
        <p className="text-xs text-secondary mt-1">
          CGI art. 199 novovicies — réduction d&apos;impôt pour acquisition d&apos;un
          logement ancien avec travaux (commune éligible).
        </p>
      </div>

      {/* Ratio travaux — bar de conformité 25 % */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-secondary">Ratio travaux (minimum 25 %)</span>
          <span className={`font-medium ${r.worksEligible ? 'text-accent' : 'text-danger'}`}>
            {(r.worksRatio * 100).toFixed(1)} %
          </span>
        </div>
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={r.worksEligible ? 'h-full bg-accent' : 'h-full bg-danger'}
            style={{ width: `${Math.min(100, r.worksRatio * 100 * 4)}%` }}
          />
          <div
            className="h-1 border-r-2 border-primary -mt-1.5"
            style={{ marginLeft: '25%' }}
          />
        </div>
        {!r.worksEligible && (
          <p className="text-xs text-danger">
            Manque {formatCurrency(r.worksGapEur, 'EUR')} de travaux pour être éligible.
          </p>
        )}
      </div>

      {!r.eligible && (
        <div className="card border-danger/30 bg-danger/5 p-3 text-xs">
          <p className="text-danger font-medium mb-1">Non éligible</p>
          <ul className="text-secondary list-disc list-inside space-y-0.5">
            {r.ineligibilityReasons.map((reason, i) => <li key={i}>{reason}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Kv label="Base de réduction" value={formatCurrency(r.effectiveBase, 'EUR')}
          sub="min(prix + travaux, 300 000, 5 500 × m²)" />
        <Kv label="Réduction totale"
          value={formatCurrency(r.taxReductionTotal, 'EUR')} tone="positive" />
        <Kv label="Réduction annuelle"
          value={formatCurrency(r.taxReductionPerYear, 'EUR') + ' /an'} />
        <Kv label="Années restantes" value={`${yearsRemaining} / ${props.duration} ans`} />
      </div>

      <p className="text-xs text-muted">
        ⚠️ Estimation. La liste officielle des 222 communes éligibles
        (Action Cœur de Ville + assimilées) et les normes de travaux
        (gain énergétique 30 %, équipements) doivent être vérifiées avec
        votre notaire ou un conseiller fiscal.
      </p>
    </div>
  )
}

function Kv({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'positive'
}) {
  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <p className="text-xs text-secondary">{label}</p>
      <p className={`text-base font-semibold financial-value mt-1 ${tone === 'positive' ? 'text-accent' : 'text-primary'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  )
}
