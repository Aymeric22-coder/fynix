'use client'

/**
 * Bandeau d'alertes cross-biens collapsible (etat memorise en localStorage).
 *
 * 3 niveaux de severite :
 *  - critical : icone rouge + bordure rouge
 *  - warning : icone orange + bordure orange
 *  - info : icone bleue + bordure neutre
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronUp, ChevronDown, X } from 'lucide-react'
import type { PortfolioAlert } from '@/lib/real-estate/portfolio-summary'

const STORAGE_KEY = 'fynix_portfolio_alerts_collapsed'

const SEVERITY_STYLES = {
  critical: { dot: '🔴', borderClass: 'border-danger/40 bg-danger/5' },
  warning:  { dot: '🟡', borderClass: 'border-warning/40 bg-warning/5' },
  info:     { dot: '🔵', borderClass: 'border-accent/40 bg-accent/5' },
} as const

interface Props {
  alerts: PortfolioAlert[]
}

export function PortfolioAlertsBanner({ alerts }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated]   = useState(false)

  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null
    setCollapsed(stored === '1')
    setHydrated(true)
  }, [])

  if (alerts.length === 0) return null

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* quota */ }
  }

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning:  alerts.filter(a => a.severity === 'warning').length,
    info:     alerts.filter(a => a.severity === 'info').length,
  }

  // Avant hydratation : on rend la version expanded pour eviter le flash
  const isCollapsed = hydrated && collapsed

  return (
    <div className="card border-warning/30 bg-warning/5 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-warning" />
          <p className="text-sm font-medium text-primary">
            {alerts.length} alerte{alerts.length > 1 ? 's' : ''} sur votre portefeuille
          </p>
          <p className="text-xs text-muted hidden sm:inline">
            {counts.critical > 0 && <span className="mr-2">🔴 {counts.critical}</span>}
            {counts.warning > 0  && <span className="mr-2">🟡 {counts.warning}</span>}
            {counts.info > 0     && <span>🔵 {counts.info}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors"
        >
          {isCollapsed ? <><ChevronDown size={12} /> Afficher</> : <><ChevronUp size={12} /> Masquer</>}
        </button>
      </div>

      {!isCollapsed && (
        <ul className="mt-3 space-y-2">
          {alerts.map((a, i) => {
            const s = SEVERITY_STYLES[a.severity]
            const body = (
              <div className={`flex items-center gap-3 px-3 py-2 rounded-md border ${s.borderClass}`}>
                <span className="text-base" aria-hidden>{s.dot}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary truncate">
                    <span className="text-secondary">{a.propertyName}</span>
                    <span className="mx-1.5 text-muted">·</span>
                    {a.message}
                  </p>
                </div>
                {a.actionUrl && (
                  <span className="text-xs text-accent flex items-center gap-1 whitespace-nowrap">
                    {a.actionLabel ?? 'Voir'} →
                  </span>
                )}
                {!a.actionUrl && a.propertyId !== 'portfolio' && (
                  <X size={11} className="text-muted opacity-0" aria-hidden />
                )}
              </div>
            )
            return (
              <li key={`${a.kind}-${a.propertyId}-${i}`}>
                {a.actionUrl
                  ? <Link href={a.actionUrl} className="block hover:opacity-80 transition-opacity">{body}</Link>
                  : body}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
