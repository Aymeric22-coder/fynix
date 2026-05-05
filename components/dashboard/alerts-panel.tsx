import { AlertTriangle, Info } from 'lucide-react'

interface Alert {
  type:     string
  message:  string
  severity: 'warning' | 'info'
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
          <span>{alert.message}</span>
        </div>
      ))}
    </div>
  )
}
