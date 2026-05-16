/**
 * Section "Analyse sectorielle" : liste de barres horizontales HTML/CSS
 * comparée au benchmark MSCI World (sectoriel). Layout 4 colonnes :
 * nom | barre | % portefeuille | déviation vs benchmark.
 *
 * Couleurs des barres selon la déviation :
 *   - aligned          → emerald (proche du marché mondial)
 *   - overweight       → orange  (surpondération > +15pts)
 *   - overweight_strong→ danger  (surpondération > +30pts)
 *   - underweight      → violet  (sous-pondération < −20pts)
 */
'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { MiniRing } from './MiniRing'
import { BenchmarkNote } from './BenchmarkNote'
import type { SecteurAlloc, DeviationStatus } from '@/types/analyse'

interface Props {
  buckets: SecteurAlloc[]
  score:   number
}

const STATUS_BAR_COLOR: Record<DeviationStatus, string> = {
  aligned:           'bg-accent',
  overweight:        'bg-warning',
  overweight_strong: 'bg-danger',
  underweight:       'bg-violet-400',
}

export function SectorielleChart({ buckets, score }: Props) {
  const alertes = buckets.filter((b) => b.status === 'overweight' || b.status === 'overweight_strong')

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Analyse sectorielle</p>
          <p className="text-xs text-muted mt-0.5">Benchmark : MSCI World (11 secteurs GICS)</p>
        </div>
        <MiniRing score={score} caption="Alignement marché" />
      </div>

      {buckets.length === 0 ? (
        <p className="text-sm text-secondary text-center py-8">Aucune position à analyser.</p>
      ) : (
        <>
          <BenchmarkBarList
            rows={buckets.map((b) => ({
              key:       b.secteur,
              label:     b.secteur,
              pct:       b.pourcentage,
              benchmark: b.benchmark,
              deviation: b.deviation,
              status:    b.status,
              tooltip:   b.positions.length > 0 ? b.positions.slice(0, 5).join(', ') : undefined,
            }))}
          />

          {alertes.length > 0 && (
            <div className="mt-4 space-y-2">
              {alertes.map((a) => (
                <div key={a.secteur} className={cn(
                  'flex items-start gap-2 border rounded-lg px-3 py-2 text-xs',
                  a.status === 'overweight_strong' ? 'bg-danger-muted border-danger/30' : 'bg-warning-muted border-warning/30',
                )}>
                  <AlertTriangle size={13} className={cn('flex-shrink-0 mt-0.5', a.status === 'overweight_strong' ? 'text-danger' : 'text-warning')} />
                  <span className="text-primary">
                    Surpondération <span className={cn('font-medium', a.status === 'overweight_strong' ? 'text-danger' : 'text-warning')}>{a.secteur}</span> de <span className="financial-value">{a.deviation > 0 ? '+' : ''}{a.deviation.toFixed(1)} pts</span> vs MSCI World ({a.benchmark.toFixed(0)} % attendu).
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4">
            <BenchmarkNote />
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Composant interne : liste de barres avec benchmark + déviation
// (réutilisé par SectorielleChart ET GeographiqueChart)
// ─────────────────────────────────────────────────────────────────

export interface BenchmarkBarRow {
  key:       string
  label:     string
  pct:       number           // % du portefeuille
  benchmark: number           // % du benchmark
  deviation: number           // pct − benchmark (en points)
  status:    DeviationStatus
  tooltip?:  string
}

const STATUS_DEV_COLOR: Record<DeviationStatus, string> = {
  aligned:           'text-secondary',
  overweight:        'text-warning',
  overweight_strong: 'text-danger',
  underweight:       'text-violet-400',
}

export function BenchmarkBarList({ rows }: { rows: BenchmarkBarRow[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const barColor = STATUS_BAR_COLOR[r.status]
        const devColor = STATUS_DEV_COLOR[r.status]
        const devSign  = r.deviation > 0 ? '+' : ''
        return (
          <div key={r.key} title={r.tooltip}>
            <div className="flex items-center gap-3 text-sm">
              <span className="w-32 sm:w-36 text-right text-secondary truncate flex-shrink-0">
                {r.label}
              </span>
              <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden min-w-0 relative">
                {/* Trait pointillé position benchmark */}
                {r.benchmark > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-primary/40"
                    style={{ left: `${Math.min(100, r.benchmark)}%` }}
                    title={`Référence : ${r.benchmark.toFixed(1)} %`}
                  />
                )}
                <div
                  className={cn('h-full rounded-full transition-all duration-1000', barColor)}
                  style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }}
                />
              </div>
              <span className="w-14 text-right financial-value text-primary text-xs whitespace-nowrap flex-shrink-0">
                {r.pct.toFixed(1)} %
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] mt-0.5">
              <span className="w-32 sm:w-36 flex-shrink-0" />
              <span className="flex-1 text-muted">
                ref MSCI : {r.benchmark.toFixed(1)} %
              </span>
              <span className={cn('w-14 text-right financial-value whitespace-nowrap flex-shrink-0', devColor)}>
                {devSign}{r.deviation.toFixed(1)} pts
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
