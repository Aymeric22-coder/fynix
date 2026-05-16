/**
 * Note explicative en bas des charts sectoriel/géo : explique la méthode
 * de comparaison au benchmark MSCI ACWI / MSCI World.
 */
'use client'

import { Info } from 'lucide-react'

export function BenchmarkNote() {
  return (
    <div className="flex items-start gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2 text-[10px] text-muted leading-relaxed">
      <Info size={11} className="text-secondary flex-shrink-0 mt-0.5" />
      <span>
        La référence utilisée est la capitalisation boursière mondiale
        (<strong className="text-secondary">MSCI ACWI</strong> pour la géo,
        <strong className="text-secondary"> MSCI World</strong> pour les secteurs).
        Une répartition proche de ce benchmark est considérée comme neutre
        et bien diversifiée. Les barres oranges/rouges signalent une
        surpondération &gt; +15 / +30 points vs ce benchmark.
      </span>
    </div>
  )
}
