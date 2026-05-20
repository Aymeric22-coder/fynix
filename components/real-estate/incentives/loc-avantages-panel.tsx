'use client'

import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { Star } from 'lucide-react'
import {
  computeLocAvantages,
  type LocAvantagesConvention,
} from '@/lib/real-estate/fiscal/incentives/loc-avantages'

interface Props {
  convention:          LocAvantagesConvention
  annualRentHC:        number
  marketRentAnnual:    number
  conventionStartDate: Date
  conventionEndDate:   Date
  tmiPct:              number
}

const CONVENTION_LABELS: Record<LocAvantagesConvention, string> = {
  loc1: "Loc1 (décote ≥ 15 %)",
  loc2: "Loc2 (décote ≥ 30 %)",
  loc3: "Loc3 (décote ≥ 45 %, intermédiation sociale)",
}

export function LocAvantagesPanel(props: Props) {
  const r = computeLocAvantages(props)

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-primary flex items-center gap-2">
          <Star size={14} className="text-accent" />
          LOC&apos;AVANTAGES · {CONVENTION_LABELS[props.convention]}
        </h3>
        <p className="text-xs text-secondary mt-1">
          CGI art. 199 tricies — convention ANAH, réduction d&apos;impôt
          en échange d&apos;un loyer plafonné.
        </p>
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
        <Kv label="Décote loyer actuelle"
          value={formatPercent(r.rentDiscountActual * 100)}
          sub={`minimum requis : ${formatPercent(r.rentDiscountRequired * 100)}`}
          tone={r.rentIsCompliant ? 'positive' : 'negative'} />
        <Kv label="Taux de réduction" value={formatPercent(r.reductionRate * 100)}
          sub="sur les loyers perçus" />
        <Kv label="Réduction annuelle"
          value={formatCurrency(r.annualTaxReduction, 'EUR') + ' /an'}
          tone="positive" />
        <Kv label="Réduction totale convention"
          value={formatCurrency(r.totalTaxReduction, 'EUR')}
          sub={`sur ${r.conventionDurationYears} ans`} />
      </div>

      {/* Gain net vs location libre */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-secondary">Gain net annuel vs location libre</p>
            <p className="text-xs text-muted mt-0.5">
              réduction IR − manque à gagner sur loyers
            </p>
          </div>
          <p className={`text-base font-semibold financial-value ${
            r.netGainVsFreeLetting >= 0 ? 'text-accent' : 'text-danger'
          }`}>
            {formatCurrency(r.netGainVsFreeLetting, 'EUR', { sign: true })}
          </p>
        </div>
        {r.netGainVsFreeLetting < 0 && (
          <p className="text-xs text-warning mt-2">
            ⚠️ Le manque à gagner sur les loyers dépasse la réduction fiscale.
            Loc&apos;Avantages n&apos;est pas avantageux à votre TMI actuel.
          </p>
        )}
      </div>

      <p className="text-xs text-muted">
        ⚠️ Estimation. Les plafonds de ressources locataire, le zonage, et
        l&apos;intermédiation sociale (Loc3) doivent être validés avec votre
        conseiller fiscal ou l&apos;ANAH.
      </p>
    </div>
  )
}

function Kv({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'positive' | 'negative'
}) {
  const colorClass =
    tone === 'positive' ? 'text-accent' :
    tone === 'negative' ? 'text-danger' : 'text-primary'
  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <p className="text-xs text-secondary">{label}</p>
      <p className={`text-base font-semibold financial-value mt-1 ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  )
}
