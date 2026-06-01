/**
 * ImmoSummaryCompact — résumé immobilier en 1 ligne aérée (V2.1).
 *
 * Remplace le `RealEstatePortfolioBlock` à 4 KPIs sur le Dashboard.
 * Le détail complet vit sur la page `/immobilier` (page dédiée).
 *
 * Format : « 🏠 Immobilier · valeur · CF/m · CRD · PV latente · [Voir →] »
 *
 * Retourne `null` si l'utilisateur n'a aucun bien immo (`propertyCount === 0`)
 * pour ne pas afficher une carte vide.
 */
import Link from 'next/link'
import { Home, ArrowRight } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface Props {
  /** Nombre de biens immobiliers actifs. */
  propertyCount:           number
  /** Valeur estimée totale (somme `assets.current_value` filtré real_estate). */
  totalCurrentValue:       number
  /** Coût d'acquisition cumulé (somme `assets.acquisition_price`). */
  totalAcquisitionCost:    number
  /** Capital restant dû total (CRD analytique multi-crédit). */
  totalCapitalRemaining:   number
  /** Cash-flow net mensuel global (Y1 simulé après impôts). */
  totalMonthlyCashFlow:    number
}

export function ImmoSummaryCompact({
  propertyCount,
  totalCurrentValue,
  totalAcquisitionCost,
  totalCapitalRemaining,
  totalMonthlyCashFlow,
}: Props) {
  if (propertyCount === 0) return null

  const latentGain    = totalCurrentValue - totalAcquisitionCost
  const latentGainPct = totalAcquisitionCost > 0
    ? (latentGain / totalAcquisitionCost) * 100
    : 0
  const cfPositive    = totalMonthlyCashFlow >= 0
  const pvPositive    = latentGain >= 0

  return (
    <section
      className="card p-4 flex items-center justify-between gap-4 flex-wrap"
      aria-label="Résumé du patrimoine immobilier"
    >
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Home size={16} className="text-accent" />
          <span className="text-sm font-medium text-primary">Immobilier</span>
          <span className="text-xs text-muted">
            ({propertyCount} bien{propertyCount > 1 ? 's' : ''})
          </span>
        </div>

        <span className="text-muted">·</span>

        <span className="text-sm financial-value text-primary">
          {formatCurrency(totalCurrentValue, 'EUR', { compact: true })}
        </span>

        <span className="text-muted">·</span>

        <span
          className={`text-sm financial-value ${cfPositive ? 'text-accent' : 'text-danger'}`}
          title="Cash-flow mensuel Y1 simulé (après impôts)"
        >
          CF {formatCurrency(totalMonthlyCashFlow, 'EUR', { sign: true, decimals: 0 })}/m
        </span>

        <span className="text-muted">·</span>

        <span className="text-sm financial-value text-secondary" title="Capital restant dû">
          CRD {formatCurrency(totalCapitalRemaining, 'EUR', { compact: true })}
        </span>

        <span className="text-muted">·</span>

        <span
          className={`text-sm financial-value ${pvPositive ? 'text-accent' : 'text-danger'}`}
          title="Plus-value latente"
        >
          PV {formatCurrency(latentGain, 'EUR', { compact: true, sign: true })}
          {totalAcquisitionCost > 0 && (
            <span className="text-xs text-muted ml-1">
              ({formatPercent(latentGainPct, { sign: true, decimals: 0 })})
            </span>
          )}
        </span>
      </div>

      <Link
        href="/immobilier"
        className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors whitespace-nowrap flex-shrink-0"
      >
        Voir le détail
        <ArrowRight size={11} />
      </Link>
    </section>
  )
}
