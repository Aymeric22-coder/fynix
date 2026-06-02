import { AlertTriangle, Info } from 'lucide-react'
import { DismissButton } from './dismiss-button'

interface Alert {
  type:      string
  message:   string
  severity:  'warning' | 'info'
  /** V2.2-BIS — Présence d'une signature → l'alerte est masquable par l'utilisateur. */
  signature?: string
}

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm ${
            alert.severity === 'warning'
              ? 'bg-warning-muted border-warning/20 text-warning'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
          }`}
        >
          {alert.severity === 'warning'
            ? <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            : <Info size={15} className="flex-shrink-0 mt-0.5" />
          }
          <span className="flex-1">{alert.message}</span>
          {/* V2.2-BIS — masquage individuel si l'alerte porte une signature stable. */}
          {alert.signature && (
            <DismissButton
              signature={alert.signature}
              preview={alert.message}
              kind="alert"
            />
          )}
        </div>
      ))}
    </div>
  )
}
