/**
 * Bloc "Patrimoine immobilier consolide" affiche dans le dashboard global.
 *
 * 4 KPIs : patrimoine net immobilier, plus-value latente, cash-flow
 * mensuel, nombre de biens. Lien "Voir tous les biens →" vers /immobilier.
 *
 * Server Component. Recoit toutes ses valeurs en props pour rester
 * decouplé du dashboard.
 */

import Link from 'next/link'
import { Home, ArrowRight, Wallet, TrendingUp, Activity } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface Props {
  /** Nombre de biens immobiliers. */
  propertyCount:           number
  /** Valeur estimee totale (somme assets.current_value type=real_estate). */
  totalCurrentValue:       number
  /** Cout d'acquisition cumule (somme assets.acquisition_price). */
  totalAcquisitionCost:    number
  /** CRD total (tous credits immo). */
  totalCapitalRemaining:   number
  /** Cash-flow net mensuel global (apres impots, Y1 simule). */
  totalMonthlyCashFlow:    number
}

export function RealEstatePortfolioBlock({
  propertyCount,
  totalCurrentValue,
  totalAcquisitionCost,
  totalCapitalRemaining,
  totalMonthlyCashFlow,
}: Props) {
  if (propertyCount === 0) return null

  const netWorth   = totalCurrentValue - totalCapitalRemaining
  const latentGain = totalCurrentValue - totalAcquisitionCost
  const latentGainPct = totalAcquisitionCost > 0
    ? (latentGain / totalAcquisitionCost) * 100
    : 0

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-accent" />
          <h3 className="text-sm font-medium text-primary">Patrimoine immobilier consolidé</h3>
        </div>
        <Link
          href="/immobilier"
          className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          Voir tous les biens
          <ArrowRight size={11} />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Wallet}
          label="Patrimoine net immo"
          value={formatCurrency(netWorth, 'EUR', { compact: true })}
          sub={`${propertyCount} bien${propertyCount > 1 ? 's' : ''}`}
          accent
        />
        <Kpi
          icon={TrendingUp}
          label="Plus-value latente"
          value={formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
          sub={totalAcquisitionCost > 0
            ? formatPercent(latentGainPct, { sign: true })
            : '—'}
          tone={latentGain >= 0 ? 'positive' : 'negative'}
        />
        <Kpi
          icon={Activity}
          label="Cash-flow mensuel"
          value={formatCurrency(totalMonthlyCashFlow, 'EUR', { sign: true })}
          sub={`${formatCurrency(totalMonthlyCashFlow * 12, 'EUR', { compact: true, sign: true })} / an`}
          tone={totalMonthlyCashFlow >= 0 ? 'positive' : 'negative'}
        />
        <Kpi
          icon={Home}
          label="Valeur · Dette"
          value={formatCurrency(totalCurrentValue, 'EUR', { compact: true })}
          sub={totalCapitalRemaining > 0
            ? `CRD ${formatCurrency(totalCapitalRemaining, 'EUR', { compact: true })}`
            : 'Sans crédit'}
        />
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone, accent }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:    any
  label:   string
  value:   string
  sub:     string
  tone?:   'positive' | 'negative'
  accent?: boolean
}) {
  const valueClass =
    tone === 'positive' ? 'text-accent' :
    tone === 'negative' ? 'text-danger' :
    accent              ? 'text-accent' : 'text-primary'

  return (
    <div className="bg-surface-2/40 rounded-lg p-3">
      <p className="text-[10px] text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <Icon size={10} />
        {label}
      </p>
      <p className={`text-lg font-semibold financial-value mt-1.5 ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  )
}
