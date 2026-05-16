/**
 * Section "Analyse sectorielle" : liste de barres horizontales HTML/CSS
 * (pas Recharts pour éviter le wrap des labels SVG quand la barre est
 * trop courte). Layout 3 colonnes : nom | barre | %.
 *
 * Bande rouge si secteur > 30 % (alerte de surexposition).
 */
'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { formatPercent } from '@/lib/utils/format'
import { MiniRing } from './MiniRing'
import type { SecteurAlloc } from '@/types/analyse'

interface Props {
  buckets: SecteurAlloc[]
  score:   number
}

const SECTOR_ALERT_PCT = 30

export function SectorielleChart({ buckets, score }: Props) {
  const alertes = buckets.filter((b) => b.alerte)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Analyse sectorielle</p>
          <p className="text-xs text-muted mt-0.5">Barres rouges au-delà de {SECTOR_ALERT_PCT} %</p>
        </div>
        <MiniRing score={score} caption="Diversification" />
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucune position à analyser.</p>
      ) : (
        <>
          <BarList
            rows={buckets.map((b) => ({
              key:    b.secteur,
              label:  b.secteur,
              pct:    b.pourcentage,
              alerte: b.alerte,
              tooltip: b.positions.length > 0 ? b.positions.slice(0, 5).join(', ') : undefined,
            }))}
            colorAlerte="bg-danger"
            colorNormal="bg-accent"
          />

          {alertes.length > 0 && (
            <div className="mt-4 space-y-2">
              {alertes.map((a) => (
                <div key={a.secteur} className="flex items-start gap-2 bg-danger-muted border border-danger/30 rounded-lg px-3 py-2 text-xs">
                  <AlertTriangle size={13} className="text-danger flex-shrink-0 mt-0.5" />
                  <span className="text-primary">
                    Surexposition <span className="text-danger font-medium">{a.secteur}</span> ({formatPercent(a.pourcentage, { decimals: 1 })}) — seuil recommandé : {SECTOR_ALERT_PCT} %
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Composant interne : liste de barres horizontales en HTML/CSS
// (réutilisé aussi par GeographiqueChart)
// ─────────────────────────────────────────────────────────────────

export interface BarListRow {
  key:      string
  label:    string
  pct:      number
  alerte?:  boolean
  tooltip?: string
}

export function BarList({
  rows, colorNormal, colorAlerte,
}: {
  rows:        BarListRow[]
  colorNormal: string    // ex: 'bg-accent'
  colorAlerte: string    // ex: 'bg-danger'
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex items-center gap-3 text-sm"
          title={r.tooltip}
        >
          {/* Label : 35-40 % du composant, tronqué si très long */}
          <span className="w-32 sm:w-36 text-right text-secondary truncate flex-shrink-0">
            {r.label}
          </span>
          {/* Track + fill */}
          <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden min-w-0">
            <div
              className={cn('h-full rounded-full transition-all duration-1000', r.alerte ? colorAlerte : colorNormal)}
              style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
            />
          </div>
          {/* % à droite, jamais wrappé (whitespace-nowrap + width fixe) */}
          <span className="w-16 text-right financial-value text-primary text-xs whitespace-nowrap flex-shrink-0">
            {r.pct.toFixed(1)} %
          </span>
        </div>
      ))}
    </div>
  )
}
