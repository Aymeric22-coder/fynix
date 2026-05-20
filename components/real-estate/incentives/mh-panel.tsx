'use client'

import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { Star, ShieldCheck } from 'lucide-react'
import {
  computeMH,
  MH_CLASSIFICATION_LABELS,
  type MhClassification,
  type MhOccupancy,
} from '@/lib/real-estate/fiscal/incentives/monuments-historiques'

interface Props {
  classification:      MhClassification
  occupancy:           MhOccupancy
  worksAmount:         number
  annualCharges:       number
  annualRentHC:        number
  acquisitionYear:     number
  conservationEndYear: number
  tmiPct:              number
}

const OCCUPANCY_LABELS: Record<MhOccupancy, string> = {
  owner_occupied: 'Occupant',
  rented:         'Bailleur',
  mixed:          'Usage mixte',
}

export function MhPanel(props: Props) {
  const r = computeMH(props)
  const totalCost = props.worksAmount > 0
    ? props.worksAmount - r.totalTaxSaving
    : 0

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-primary flex items-center gap-2">
          <Star size={14} className="text-accent" />
          MONUMENTS HISTORIQUES — {MH_CLASSIFICATION_LABELS[props.classification]}
        </h3>
        <p className="text-xs text-secondary mt-1">
          CGI art. 156 I-3° — {OCCUPANCY_LABELS[props.occupancy]}.
          Niche fiscale non plafonnée.
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
        <Kv label="Travaux déductibles (100 %)"
          value={formatCurrency(r.deductibleWorks, 'EUR')} />
        {r.deductibleCharges > 0 && (
          <Kv label="Charges déductibles"
            value={formatCurrency(r.deductibleCharges, 'EUR')} />
        )}
        <Kv label={`Économie fiscale (TMI ${props.tmiPct} %)`}
          value={formatCurrency(r.totalTaxSaving, 'EUR')}
          tone="positive" />
        <Kv label="Taux d'effort réel"
          value={formatPercent((1 - r.effectiveRate) * 100)}
          sub={`vous payez ${formatCurrency(totalCost, 'EUR')} pour ${formatCurrency(props.worksAmount, 'EUR')} de travaux`} />
      </div>

      {/* Statut conservation */}
      <div className="border-t border-border pt-4 flex items-start gap-3">
        <ShieldCheck size={16} className="text-accent shrink-0 mt-0.5" />
        <div className="text-xs flex-1">
          <p className="text-primary font-medium">
            Engagement de conservation : {r.conservationYearsLeft} an{r.conservationYearsLeft > 1 ? 's' : ''} restants
          </p>
          <p className="text-secondary mt-0.5">
            Acquisition {props.acquisitionYear} · échéance {props.conservationEndYear}.
            Engagement minimum 15 ans pour conserver l&apos;avantage fiscal.
          </p>
          {r.warning15Years && (
            <p className="text-warning mt-1">
              ⚠️ Moins de 3 ans restants — vérifiez les obligations restantes
              avant toute cession.
            </p>
          )}
        </div>
      </div>

      <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 text-xs">
        <p className="text-accent font-medium mb-1">
          ✅ Non soumis au plafond niches fiscales (10 000 €)
        </p>
        <p className="text-secondary">
          Contrairement à Pinel / Denormandie / Loc&apos;Avantages, MH n&apos;est
          PAS plafonné par le plafond global des niches (CGI art. 200-0 A).
          L&apos;intégralité de l&apos;économie fiscale est conservée.
        </p>
      </div>

      <p className="text-xs text-muted">
        ⚠️ Estimation. Le classement / inscription / agrément, ainsi que la
        conformité des travaux, doivent être validés par la DRAC avant tout
        chantier. Consultez un conseiller fiscal spécialisé MH.
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
