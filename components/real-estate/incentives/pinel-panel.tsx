'use client'

import { formatCurrency } from '@/lib/utils/format'
import { Star } from 'lucide-react'
import { computePinel, type PinelDuration, type PinelZone } from '@/lib/real-estate/fiscal/incentives/pinel'

interface Props {
  isPinelPlus:   boolean
  duration:      PinelDuration
  zone:          PinelZone
  purchasePrice: number
  surfaceM2:     number
  startYear:     number
  annualRentHC:  number
  tmiPct:        number
}

export function PinelPanel(props: Props) {
  const r = computePinel(props)
  const currentYear = new Date().getFullYear()
  const yearsElapsed = Math.max(0, currentYear - props.startYear)
  const yearsRemaining = Math.max(0, props.duration - yearsElapsed)
  const reductionAlreadyClaimed = Math.min(yearsElapsed, props.duration) * r.taxReductionPerYear

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-primary flex items-center gap-2">
            <Star size={14} className="text-accent" />
            {props.isPinelPlus ? 'PINEL+' : 'PINEL'} · Zone {props.zone} · {props.duration} ans
            <span className="text-secondary font-normal text-xs">depuis {props.startYear}</span>
          </h3>
          <p className="text-xs text-secondary mt-1">
            CGI art. 199 novovicies — réduction d&apos;impôt sur le revenu.
          </p>
        </div>
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
          sub="min(prix, 300 000, 5 500 × m²)" />
        <Kv label="Réduction totale"
          value={formatCurrency(r.taxReductionTotal, 'EUR')}
          tone="positive" />
        <Kv label="Réduction annuelle"
          value={formatCurrency(r.taxReductionPerYear, 'EUR') + ' /an'} />
        <Kv label="Années restantes" value={`${yearsRemaining} / ${props.duration} ans`} />
      </div>

      {yearsElapsed > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Kv label="Réduction déjà perçue"
            value={formatCurrency(reductionAlreadyClaimed, 'EUR')} />
          <Kv label="Réduction restante"
            value={formatCurrency(r.taxReductionTotal - reductionAlreadyClaimed, 'EUR')}
            tone="positive" />
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-xs text-secondary uppercase tracking-widest">Plafond loyer</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-secondary">
            Loyer max ({formatCurrency(r.rentCapMonthlyPerM2, 'EUR')}/m² × {props.surfaceM2} m² × coef.)
          </span>
          <span className="text-sm financial-value text-primary">
            {formatCurrency(r.rentCapMonthlyTotal, 'EUR')}/mois
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-secondary">Loyer actuel</span>
          <span className={`text-sm financial-value ${r.rentIsCompliant ? 'text-accent' : 'text-danger'}`}>
            {formatCurrency(props.annualRentHC / 12, 'EUR')}/mois
            {r.rentIsCompliant ? ' ✅' : ` ⚠️ +${formatCurrency(r.rentGapMonthlyEur, 'EUR')}/mois`}
          </span>
        </div>
      </div>

      {r.warningNichesCap && (
        <p className="text-xs text-warning">
          ⚠️ Votre réduction annuelle ({formatCurrency(r.taxReductionPerYear, 'EUR')})
          dépasse le plafond global des niches fiscales (10 000 €).
          L&apos;excédent est perdu — il n&apos;est pas reportable.
        </p>
      )}

      <p className="text-xs text-muted">
        ⚠️ Estimation basée sur les textes fiscaux en vigueur. Les conditions précises
        (ressources locataire, normes RE2020, double orientation Pinel+) doivent être
        vérifiées avec un conseiller fiscal ou un notaire. Plafonds de loyer : décret 2024.
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
