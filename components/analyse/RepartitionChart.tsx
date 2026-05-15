/**
 * Section "Répartition patrimoniale" : donut + liste détaillée.
 *
 * Couleurs fixes par classe d'actif (cf. types/analyse.ts CLASSE_COLOR).
 * Le donut est rendu via DonutChart générique.
 */
'use client'

import { DonutChart } from '@/components/charts/donut-chart'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { ClasseAlloc } from '@/types/analyse'

interface Props {
  classes:    ClasseAlloc[]
  totalNet:   number
}

export function RepartitionChart({ classes, totalNet }: Props) {
  const data = classes.map((c) => ({
    type:    c.label,
    label:   c.label,
    value:   c.valeur,
    percent: c.pourcentage,
    color:   c.color,
  }))

  return (
    <div className="card p-5">
      <div className="mb-4">
        <p className="text-xs text-secondary uppercase tracking-widest">Répartition patrimoniale</p>
        <p className="text-xs text-muted mt-0.5">Par classe d&apos;actif (% du patrimoine net)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Gauche : donut */}
        <div>
          <DonutChart
            data={data}
            centerLabel="Patrimoine net"
            centerValue={formatCurrency(totalNet, 'EUR', { compact: true })}
          />
        </div>

        {/* Droite : liste détaillée avec barres */}
        <div className="space-y-3">
          {classes.map((c) => (
            <div key={c.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="text-primary">{c.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-secondary financial-value text-xs">
                    {formatCurrency(c.valeur, 'EUR', { compact: true })}
                  </span>
                  <span className="text-primary financial-value text-xs w-12 text-right">
                    {formatPercent(c.pourcentage, { decimals: 1 })}
                  </span>
                </div>
              </div>
              <div className="h-1 bg-border rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-1000"
                  style={{ width: `${c.pourcentage}%`, backgroundColor: c.color }}
                />
              </div>
            </div>
          ))}
          {classes.length === 0 && (
            <p className="text-sm text-secondary text-center py-8">Aucune donnée à afficher.</p>
          )}
        </div>
      </div>
    </div>
  )
}
