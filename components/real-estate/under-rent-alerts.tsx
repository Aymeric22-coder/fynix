import { TrendingUp } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { UnderRentAlert } from '@/lib/real-estate/under-rent'

interface Props {
  alerts: UnderRentAlert[]
}

/**
 * Carte d'opportunités d'optimisation des loyers : liste les lots
 * dont le loyer actuel est inférieur au loyer de marché estimé.
 */
export function UnderRentAlerts({ alerts }: Props) {
  if (alerts.length === 0) return null

  const totalAnnualLoss = alerts.reduce((s, a) => s + a.annualLoss, 0)

  return (
    <div className="card border-warning/30 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-warning/10 rounded-lg">
          <TrendingUp size={18} className="text-warning" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-primary">
            Opportunités d&apos;optimisation des loyers
          </h3>
          <p className="text-xs text-secondary mt-0.5">
            Manque à gagner annuel estimé : <span className="text-warning font-medium">
              {formatCurrency(totalAnnualLoss, 'EUR')}
            </span>
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {alerts.map(a => {
          const tone =
            a.severity === 'high'   ? 'text-danger'  :
            a.severity === 'medium' ? 'text-warning' :
            'text-secondary'
          return (
            <li key={a.lotId} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary">{a.lotName}</p>
                <p className="text-xs text-secondary mt-0.5">
                  Loyer actuel : {formatCurrency(a.currentRent, 'EUR')}
                  {' · '}
                  Marché : {formatCurrency(a.marketRent, 'EUR')}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-medium ${tone}`}>
                  +{formatCurrency(a.deltaEur, 'EUR')} / mois
                </p>
                <p className="text-xs text-secondary mt-0.5">
                  {formatPercent(a.deltaPct, { sign: true })}{' '}·{' '}
                  {formatCurrency(a.annualLoss, 'EUR')}/an
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
