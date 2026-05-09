import Link from 'next/link'
import { AlertTriangle, AlertCircle, Info, ArrowRight } from 'lucide-react'
import type { DriftAlert, DriftSeverity } from '@/lib/real-estate/insights'

export interface PropertyDriftSummary {
  propertyId:    string
  propertyName?: string
  alerts:        DriftAlert[]
}

const SEV_ICON: Record<DriftSeverity, typeof AlertCircle> = {
  critical: AlertCircle,
  warning:  AlertTriangle,
  info:     Info,
}

const SEV_COLOR: Record<DriftSeverity, string> = {
  critical: 'text-danger',
  warning:  'text-warning',
  info:     'text-secondary',
}

export function RealEstateAlertsPanel({ summaries }: { summaries: PropertyDriftSummary[] }) {
  // Garde uniquement les biens qui ont des alertes
  const withAlerts = summaries.filter((s) => s.alerts.length > 0)
  if (withAlerts.length === 0) return null

  // Top alertes globales : on prend la plus sévère par bien (premier dans la liste triée)
  const topAlerts = withAlerts
    .map((s) => ({ summary: s, top: s.alerts[0]! }))
    .sort((a, b) => {
      const sevOrder: Record<DriftSeverity, number> = { critical: 0, warning: 1, info: 2 }
      return sevOrder[a.top.severity] - sevOrder[b.top.severity]
    })
    .slice(0, 5)

  // Compteurs globaux
  const counts = withAlerts.reduce<Record<DriftSeverity, number>>(
    (acc, s) => {
      for (const a of s.alerts) acc[a.severity]++
      return acc
    },
    { critical: 0, warning: 0, info: 0 },
  )

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-primary">Alertes immobilier</h2>
          <div className="flex items-center gap-1.5 text-xs">
            {counts.critical > 0 && (
              <span className="bg-danger/10 text-danger border border-danger/20 rounded-full px-2 py-0.5">
                {counts.critical}
              </span>
            )}
            {counts.warning > 0 && (
              <span className="bg-warning/10 text-warning border border-warning/20 rounded-full px-2 py-0.5">
                {counts.warning}
              </span>
            )}
            {counts.info > 0 && (
              <span className="bg-surface-2 text-secondary border border-border rounded-full px-2 py-0.5">
                {counts.info}
              </span>
            )}
          </div>
        </div>
        <Link href="/immobilier" className="flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors">
          Voir les biens <ArrowRight size={12} />
        </Link>
      </div>

      <div className="space-y-2">
        {topAlerts.map(({ summary, top }) => {
          const Icon = SEV_ICON[top.severity]
          return (
            <Link
              key={summary.propertyId}
              href={`/immobilier/${summary.propertyId}`}
              className="flex items-start gap-3 p-3 bg-surface-2 rounded-lg hover:bg-surface-2/70 transition-colors group"
            >
              <Icon size={14} className={`${SEV_COLOR[top.severity]} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-primary font-medium truncate">
                    {summary.propertyName ?? 'Bien immobilier'}
                  </p>
                  {summary.alerts.length > 1 && (
                    <span className="text-xs text-muted shrink-0">+{summary.alerts.length - 1} autre{summary.alerts.length - 1 > 1 ? 's' : ''}</span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${SEV_COLOR[top.severity]}`}>{top.title}</p>
                <p className="text-xs text-secondary mt-0.5 line-clamp-1">{top.message}</p>
              </div>
              <ArrowRight size={12} className="text-muted shrink-0 mt-1 group-hover:text-primary transition-colors" />
            </Link>
          )
        })}
      </div>

      {withAlerts.length > 5 && (
        <p className="text-xs text-muted text-center pt-1">
          + {withAlerts.length - 5} autre{withAlerts.length - 5 > 1 ? 's' : ''} bien{withAlerts.length - 5 > 1 ? 's' : ''} avec des écarts
        </p>
      )}
    </div>
  )
}
