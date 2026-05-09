'use client'

import { useState } from 'react'
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import type { DriftAlert, DriftSeverity } from '@/lib/real-estate/insights'

const SEVERITY_STYLES: Record<DriftSeverity, {
  icon:    typeof AlertCircle
  bgClass: string
  txtClass: string
  borderClass: string
}> = {
  critical: { icon: AlertCircle,    bgClass: 'bg-danger/5',  txtClass: 'text-danger',  borderClass: 'border-danger/30' },
  warning:  { icon: AlertTriangle,  bgClass: 'bg-warning/5', txtClass: 'text-warning', borderClass: 'border-warning/30' },
  info:     { icon: Info,           bgClass: 'bg-surface-2', txtClass: 'text-secondary', borderClass: 'border-border' },
}

const SEVERITY_LABEL: Record<DriftSeverity, string> = {
  critical: 'Critique',
  warning:  'Attention',
  info:     'Info',
}

export function DriftAlerts({ alerts }: { alerts: DriftAlert[] }) {
  const [expanded, setExpanded] = useState(true)

  if (alerts.length === 0) return null

  // Compteurs par sévérité
  const counts = alerts.reduce<Record<DriftSeverity, number>>(
    (acc, a) => { acc[a.severity]++; return acc },
    { critical: 0, warning: 0, info: 0 },
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-primary">Insights · Écarts détectés</p>
          <div className="flex items-center gap-1.5 text-xs">
            {counts.critical > 0 && (
              <span className="bg-danger/10 text-danger border border-danger/20 rounded-full px-2 py-0.5">
                {counts.critical} critique{counts.critical > 1 ? 's' : ''}
              </span>
            )}
            {counts.warning > 0 && (
              <span className="bg-warning/10 text-warning border border-warning/20 rounded-full px-2 py-0.5">
                {counts.warning} attention
              </span>
            )}
            {counts.info > 0 && (
              <span className="bg-surface-2 text-secondary border border-border rounded-full px-2 py-0.5">
                {counts.info} info
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Masquer' : 'Afficher'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2">
          {alerts.map((a, i) => {
            const style = SEVERITY_STYLES[a.severity]
            const Icon  = style.icon
            return (
              <div
                key={`${a.type}-${a.year ?? 'all'}-${i}`}
                className={`flex items-start gap-3 ${style.bgClass} ${style.borderClass} border rounded-lg px-4 py-3`}
              >
                <Icon size={15} className={`${style.txtClass} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium ${style.txtClass}`}>{a.title}</p>
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      {SEVERITY_LABEL[a.severity]}
                    </span>
                  </div>
                  <p className="text-xs text-secondary mt-1">{a.message}</p>
                  {a.action && (
                    <p className="text-xs text-muted mt-1.5 italic">→ {a.action}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
