import { TrendingUp, Wallet, ArrowUpDown, BarChart2 } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface KPIs {
  gross_value:       number
  net_value:         number
  total_debt:        number
  debt_ratio:        number
  monthly_cash_flow: number
  cagr:              number | null
  confidence_score:  number
  assets_count?:     number
  /** Label optionnel sous le cash-flow (ex: 'après impôts (simulation)') */
  sim_cf_label?:     string
}

export function KpiGrid({ kpis }: { kpis: KPIs }) {
  const cfPositive = kpis.monthly_cash_flow >= 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Patrimoine net"
        value={formatCurrency(kpis.net_value, 'EUR', { compact: true })}
        sub={`Ratio dette : ${formatPercent(kpis.debt_ratio)}`}
        icon={Wallet}
        accent
      />
      <StatCard
        label="Patrimoine brut"
        value={formatCurrency(kpis.gross_value, 'EUR', { compact: true })}
        sub={`Dette : ${formatCurrency(kpis.total_debt, 'EUR', { compact: true })}`}
        icon={BarChart2}
      />
      <StatCard
        label="Cash-flow mensuel"
        value={formatCurrency(kpis.monthly_cash_flow, 'EUR')}
        sub={kpis.sim_cf_label ?? (cfPositive ? 'Positif' : 'Négatif')}
        icon={ArrowUpDown}
        className={cfPositive ? 'border-accent/20' : 'border-danger/20'}
      />
      <StatCard
        label="Performance (CAGR)"
        value={kpis.cagr !== null ? formatPercent(kpis.cagr, { sign: true }) : '—'}
        sub={`Fiabilité données : ${kpis.confidence_score.toFixed(0)} %`}
        icon={TrendingUp}
        trend={kpis.cagr ?? undefined}
      />
    </div>
  )
}
