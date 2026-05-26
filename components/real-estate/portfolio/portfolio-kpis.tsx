'use client'

/**
 * 6 cartes KPI consolidees en tete de la page liste immobilier.
 *
 * - Patrimoine net (toujours blanc)
 * - Plus-value latente (vert si +, rouge si -)
 * - Dette totale + LTV (couleur LTV : vert <70, orange 70-85, rouge >85)
 * - Cash-flow mensuel global (vert si +, rouge si -)
 * - Rendement net-net moyen pondere
 * - Loyers bruts mensuels + nb biens
 */

import { Wallet, TrendingUp, Banknote, Activity, Percent, Home } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { InfoTip } from '@/components/ui/info-tip'
import { LEXIQUE } from '@/lib/real-estate/lexique'
import type { RealEstatePortfolioSummary } from '@/lib/real-estate/portfolio-summary'

interface Props {
  summary: RealEstatePortfolioSummary
}

export function PortfolioKpis({ summary }: Props) {
  const s = summary

  const ltvTone =
    s.loanToValuePct === 0       ? 'neutral' :
    s.loanToValuePct < 70        ? 'positive' :
    s.loanToValuePct <= 85       ? 'warning'  : 'negative'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <Kpi
        icon={Wallet}
        label="Patrimoine net"
        value={formatCurrency(s.totalNetWorth, 'EUR', { compact: true })}
        sub={`${s.totalProperties} bien${s.totalProperties > 1 ? 's' : ''}`}
        accent
      />
      <Kpi
        icon={TrendingUp}
        label="Plus-value latente"
        tip={LEXIQUE.latentGain}
        value={formatCurrency(s.totalLatentGain, 'EUR', { compact: true, sign: true })}
        sub={s.totalAcquisitionCost > 0 ? formatPercent(s.totalLatentGainPct, { sign: true }) : '—'}
        tone={s.totalLatentGain >= 0 ? 'positive' : 'negative'}
      />
      <Kpi
        icon={Banknote}
        label="Dette totale (CRD)"
        tip={LEXIQUE.remainingCapital}
        value={s.totalDebt > 0 ? formatCurrency(s.totalDebt, 'EUR', { compact: true }) : '—'}
        sub={s.loanToValuePct > 0 ? `LTV : ${s.loanToValuePct.toFixed(0)} %` : 'Sans crédit'}
        tone={ltvTone}
      />
      <Kpi
        icon={Activity}
        label="Cash-flow net global"
        tip={LEXIQUE.monthlyCashFlow}
        value={formatCurrency(s.totalMonthlyCashFlow, 'EUR', { sign: true })}
        sub={`${formatCurrency(s.totalAnnualCashFlow, 'EUR', { compact: true, sign: true })} / an`}
        tone={s.totalMonthlyCashFlow >= 0 ? 'positive' : 'negative'}
      />
      <Kpi
        icon={Percent}
        label="Rendement net-net moyen"
        tip={LEXIQUE.netNetYield}
        value={s.weightedNetNetYieldPct > 0 ? formatPercent(s.weightedNetNetYieldPct) : '—'}
        sub={s.weightedGrossYieldPct > 0 ? `brut ${formatPercent(s.weightedGrossYieldPct)}` : 'Aucun loyer'}
      />
      <Kpi
        icon={Home}
        label="Loyers bruts"
        value={formatCurrency(s.totalMonthlyRent, 'EUR')}
        sub={`/mois — ${s.byUsageType.longTermRental + s.byUsageType.shortTermRental + s.byUsageType.mixedUse} locatif${(s.byUsageType.longTermRental + s.byUsageType.shortTermRental + s.byUsageType.mixedUse) > 1 ? 's' : ''}`}
      />
    </div>
  )
}

// ─── Sous-composants ───────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, sub, tone, accent, tip }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:    any
  label:   string
  value:   string
  sub?:    string
  tone?:   'positive' | 'negative' | 'warning' | 'neutral'
  accent?: boolean
  /** Définition pédagogique affichée dans une bulle (V9.1). */
  tip?:    string
}) {
  const valueClass =
    tone === 'positive' ? 'text-accent' :
    tone === 'negative' ? 'text-danger' :
    tone === 'warning'  ? 'text-warning' :
    accent              ? 'text-accent' : 'text-primary'

  return (
    <div className={`card p-4 ${accent ? 'border-accent/20' : ''}`}>
      <p className="text-[10px] text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <Icon size={11} />
        {label}
        {tip && <InfoTip text={tip} iconSize={11} />}
      </p>
      <p className={`text-lg font-semibold financial-value mt-2 ${valueClass}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}
