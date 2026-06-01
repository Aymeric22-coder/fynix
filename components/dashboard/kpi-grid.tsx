/**
 * KpiGrid — 4 cartes consommant le `DashboardKpis` du pipeline unifié (V1.4).
 *
 * Option B retenue : on garde 4 cartes (Net / Brut / CF immo / Performance)
 * pour minimiser le bouleversement visuel V1.4. Le widget « Performance »
 * met le TWR portefeuille en valeur principale et la croissance patrimoniale
 * en sous-titre. La refonte forte (Zone 4 du rapport, mini-bloc séparé à
 * droite du graphe) viendra en V2.
 *
 * Les labels conditionnels (TWR null / extrapolé / normal) sont déjà calculés
 * par le pipeline (`twr_portefeuille_label`) — ce composant les affiche tels
 * quels et ajoute juste un caveat visuel sur l'extrapolation.
 */
import { TrendingUp, Wallet, ArrowUpDown, BarChart2 } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { DashboardKpis } from '@/lib/analyse/dashboard-pipeline'
import { UnvaluedPositionsBadge } from './unvalued-positions-badge'

interface Props {
  kpis: DashboardKpis
  // V1.4 P0.2 — Badge optionnel à côté du KPI Brut.
  unvaluedPositionsCount?: number
  unvaluedPositionsLabel?: string
}

export function KpiGrid({ kpis, unvaluedPositionsCount = 0, unvaluedPositionsLabel = '' }: Props) {
  const cfPositive = kpis.cash_flow_immo_y1 >= 0

  // ── Carte « Performance » (Option B) ────────────────────────────────
  //   Titre principal = TWR portefeuille
  //   Sous-titre      = Croissance patrimoine (apports inclus)
  //   Le pipeline fournit déjà des labels prêts à afficher : on les exploite.
  const twrValue = kpis.twr_portefeuille_pct
  const twrDisplay = twrValue !== null
    ? formatPercent(twrValue, { sign: true, decimals: 2 })
    : '—'
  const croissanceValue = kpis.croissance_patrimoine_pct
  const croissanceDisplay = croissanceValue !== null
    ? `Patrimoine ${formatPercent(croissanceValue, { sign: true, decimals: 2 })}/an (apports inclus)`
    : kpis.croissance_patrimoine_label
  // Caveat visuel si TWR extrapolé (< 365 j).
  const performanceSub = twrValue === null
    ? kpis.twr_portefeuille_label
    : kpis.twr_portefeuille_extrapole
      ? `${croissanceDisplay} · estimé court historique`
      : croissanceDisplay

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Patrimoine net"
        value={formatCurrency(kpis.net_value, 'EUR', { compact: true })}
        sub={`Ratio dette : ${formatPercent(kpis.debt_ratio)}`}
        icon={Wallet}
        accent
      />
      {/* Brut + badge unvalued positions accolé (V1.4 P0.2) */}
      <div className="relative">
        <StatCard
          label="Patrimoine brut"
          value={formatCurrency(kpis.gross_value, 'EUR', { compact: true })}
          sub={`Dette : ${formatCurrency(kpis.total_debt, 'EUR', { compact: true })}`}
          icon={BarChart2}
        />
        {unvaluedPositionsCount > 0 && (
          <UnvaluedPositionsBadge
            count={unvaluedPositionsCount}
            label={unvaluedPositionsLabel}
          />
        )}
      </div>
      <StatCard
        label={kpis.cash_flow_immo_y1_label}
        value={formatCurrency(kpis.cash_flow_immo_y1, 'EUR')}
        sub={kpis.sim_cf_label ?? (cfPositive ? 'Positif' : 'Négatif')}
        icon={ArrowUpDown}
        className={cfPositive ? 'border-accent/20' : 'border-danger/20'}
      />
      {/* V1.4 — Widget « Performance » composite (Option B) :
            principal = TWR portefeuille, sous-titre = Croissance patrimoine.
            La carte conserve le format StatCard pour cohérence visuelle V1. */}
      <StatCard
        label="Performance"
        value={twrDisplay}
        sub={performanceSub}
        icon={TrendingUp}
        trend={twrValue ?? undefined}
      />
    </div>
  )
}
