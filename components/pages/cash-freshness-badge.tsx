/**
 * `CashFreshnessBadge` — Server Component (Cash V1.4 Vol D).
 *
 * Petit badge informatif sur une carte compte cash quand `balance_date`
 * est ancien (≥ 90 jours). Purement visuel : les calculs continuent
 * d'utiliser le solde tel quel (saisie déclarative, pas de bank connect).
 */
import { Clock, AlertTriangle } from 'lucide-react'
import { getFreshnessLevel } from '@/lib/cash/freshness'

interface Props {
  balanceDate: string | null
}

export function CashFreshnessBadge({ balanceDate }: Props) {
  const level = getFreshnessLevel(balanceDate)
  if (level === 'none') return null

  const meta = level === 'warning'
    ? {
        Icon:  Clock,
        text:  'Mise à jour à rafraîchir',
        cls:   'text-warning bg-warning-muted border-warning/30',
      }
    : {
        Icon:  AlertTriangle,
        text:  'Donnée ancienne',
        cls:   'text-danger bg-danger-muted border-danger/30',
      }

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] ${meta.cls}`}
      role="status"
    >
      <meta.Icon size={10} aria-hidden />
      {meta.text}
    </span>
  )
}
