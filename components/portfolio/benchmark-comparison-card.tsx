/**
 * Carte « Performance vs indices » (BNCH).
 *
 * Compare le TWR global du portefeuille a des indices de reference
 * (MSCI World, S&P 500, CAC 40) sur la meme fenetre.
 *
 * Alimentee par `summary.benchmarkComparison` (cf. build-from-db.ts).
 * Toutes les valeurs sont en POURCENTAGE.
 *
 * Rendu conditionnel : null si `data === null`.
 * Visible uniquement onglet Global (condition au site d'appel).
 *
 * Server Component — pas d'interactivite.
 */

import { BarChart3 } from 'lucide-react'
import { formatPercent } from '@/lib/utils/format'
import { InfoTip } from '@/components/ui/info-tip'
import type { BenchmarkPerformance } from '@/lib/portfolio/benchmark-comparison'

interface Props {
  data: {
    window:     { start: string; end: string; days: number }
    portfolio:  { twr: number; annualizedTwr: number | null }
    benchmarks: BenchmarkPerformance[]
  } | null
  className?: string
}

/** "Sur 6 mois" / "Sur 1 an" / "Sur 2,5 ans". */
function periodLabel(days: number): string {
  if (days >= 365) {
    const years = days / 365
    const rounded = years >= 10 ? Math.round(years) : Math.round(years * 10) / 10
    const plural = rounded >= 2 ? 's' : ''
    // Format FR : virgule decimale
    const txt = Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace('.', ',')
    return `Sur ${txt} an${plural}`
  }
  const months = Math.max(1, Math.round(days / 30))
  return `Sur ${months} mois`
}

export function BenchmarkComparisonCard({ data, className }: Props) {
  if (!data || data.benchmarks.length === 0) return null

  const { portfolio, benchmarks, window } = data

  return (
    <div className={['card p-5', className ?? ''].join(' ')}>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
          <BarChart3 size={11} /> Performance vs indices
          <InfoTip text="Comparaison de ton portefeuille avec des indices de référence (MSCI World, S&P 500, CAC 40) sur la même fenêtre temporelle." />
        </p>
        <p className="text-xs text-muted">{periodLabel(window.days)}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-secondary uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left  py-2 font-medium">Indice</th>
              <th className="text-right py-2 font-medium">Période</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">
                <span className="inline-flex items-center justify-end gap-1">
                  Annualisé
                  <InfoTip text="Performance annualisée — équivalent annuel composé du rendement réalisé sur la fenêtre, pour comparer des périodes de durées différentes." />
                </span>
              </th>
              <th className="text-right py-2 font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  Écart vs portef.
                  <InfoTip text="Différence en points de pourcentage entre la performance de ton portefeuille et celle de l'indice sur la même fenêtre. Positif = surperformance." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Ligne portefeuille (mise en avant) */}
            <tr className="border-b border-border bg-surface-2/40">
              <td className="py-2.5 text-primary font-medium">Mon portefeuille</td>
              <td className={`py-2.5 text-right financial-value ${portfolio.twr >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatPercent(portfolio.twr, { sign: true, decimals: 1 })}
              </td>
              <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                {portfolio.annualizedTwr !== null
                  ? formatPercent(portfolio.annualizedTwr, { sign: true, decimals: 1 })
                  : <span className="text-muted">—</span>}
              </td>
              <td className="py-2.5 text-right text-muted">—</td>
            </tr>

            {/* Une ligne par benchmark */}
            {benchmarks.map((b) => {
              const diff = portfolio.twr - b.totalReturn  // points de %
              const diffColor = diff >= 0 ? 'text-accent' : 'text-danger'
              return (
                <tr key={b.benchmarkId} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                  <td className="py-2.5">
                    <span className="text-primary">{b.benchmarkLabel}</span>
                    <span className="text-[10px] text-muted ml-1.5">{b.ticker}</span>
                  </td>
                  <td className={`py-2.5 text-right financial-value ${b.totalReturn >= 0 ? 'text-secondary' : 'text-danger'}`}>
                    {formatPercent(b.totalReturn, { sign: true, decimals: 1 })}
                  </td>
                  <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                    {b.annualizedReturn !== null
                      ? formatPercent(b.annualizedReturn, { sign: true, decimals: 1 })
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className={`py-2.5 text-right financial-value ${diffColor}`}>
                    {formatPercent(diff, { sign: true, decimals: 1 })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Disclaimer obligatoire (+ TER + accumulation) */}
      <p className="text-[10px] text-muted leading-relaxed mt-4 pt-3 border-t border-border">
        ⚠️ Comparaison à titre indicatif. Les indices sont représentés par des ETF UCITS
        EUR-listed (MSCI World, S&amp;P 500) ou l&apos;indice direct (CAC 40) ; le TER des ETF
        (0,07–0,20 %/an) crée un léger écart vs l&apos;indice théorique. Les indices sont en
        performance totale (dividendes réinvestis) : si tes positions distribuent en cash
        sans réinvestissement, ton TWR portefeuille peut sous-estimer la comparaison.
      </p>
    </div>
  )
}
