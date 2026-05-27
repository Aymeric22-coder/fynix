/**
 * Table « Performance par enveloppe » (E12 / Étape 4).
 *
 * Une ligne par enveloppe (PEA, CTO, AV, PER…) avec :
 *   Enveloppe | Valeur | Investi | +/- Latente | PV Réalisée 12m | TWR | MWR
 *
 * Alimentée par `summary.envelopePerformance` (cf. `lib/portfolio/build-from-db.ts`).
 *
 * Affichage conditionnel : ne se rend pas tant que l'utilisateur n'a pas
 * au moins 2 enveloppes (inutile en mono-enveloppe — la perf agrégée
 * suffit). `twr`, `mwr`, `realizedPnlTtm` affichés en « — » si null.
 *
 * Server Component — pas d'interactivité.
 */

import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { EnvelopePerformance } from '@/lib/portfolio/envelope-performance'

interface Props {
  data:      EnvelopePerformance[]
  currency:  string
  className?: string
}

export function EnvelopePerformanceTable({ data, currency, className }: Props) {
  if (!data || data.length < 2) return null

  // Totaux : somme des positions valorisées. Ne fait PAS de moyenne
  // pondérée des TWR/MWR (sans le détail temporel par enveloppe, ce
  // serait faux) — on laisse les cellules totales TWR/MWR vides.
  const totalCurrent      = data.reduce((acc, e) => acc + e.currentValue, 0)
  const totalInvested     = data.reduce((acc, e) => acc + e.investedValue, 0)
  const totalUnrealized   = data.reduce((acc, e) => acc + e.unrealizedPnl, 0)
  // Somme realized_pnl : null si AUCUNE enveloppe n'a de valeur (sinon
  // ignore les null pour rester comparable à R6 portefeuille global).
  const realizedValues    = data.map((e) => e.realizedPnlTtm).filter((v): v is number => v !== null)
  const totalRealizedTtm  = realizedValues.length === 0 ? null : realizedValues.reduce((a, b) => a + b, 0)
  const totalPnlPct       = totalInvested > 0 ? (totalUnrealized / totalInvested) * 100 : 0

  return (
    <div className={['card p-5', className ?? ''].join(' ')}>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-secondary uppercase tracking-widest">
          Performance par enveloppe
        </p>
        <p className="text-xs text-muted">
          {data.length} enveloppe{data.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-secondary uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left  py-2 font-medium">Enveloppe</th>
              <th className="text-right py-2 font-medium">Valeur</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">Investi</th>
              <th className="text-right py-2 font-medium">+/− Latente</th>
              <th className="text-right py-2 font-medium hidden md:table-cell" title="Plus-value réalisée 12 mois glissants">PV réalisée 12 m</th>
              <th className="text-right py-2 font-medium" title="Time-Weighted Return — performance neutre cash-flows">TWR</th>
              <th className="text-right py-2 font-medium hidden sm:table-cell" title="Money-Weighted Return — IRR annualisé">MWR</th>
              <th className="text-right py-2 font-medium hidden lg:table-cell">Poids</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr
                key={e.envelopeId}
                className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
              >
                <td className="py-2.5 max-w-[200px]">
                  <p className="text-primary truncate">{e.envelopeLabel}</p>
                </td>
                <td className="py-2.5 text-right financial-value text-primary">
                  {formatCurrency(e.currentValue, currency, { compact: true })}
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                  {formatCurrency(e.investedValue, currency, { compact: true })}
                </td>
                <td className={`py-2.5 text-right financial-value ${e.unrealizedPnl >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {formatCurrency(e.unrealizedPnl, currency, { compact: true, sign: true })}
                  <span className="text-xs text-muted ml-1 hidden sm:inline">
                    ({formatPercent(e.unrealizedPnlPct, { sign: true })})
                  </span>
                </td>
                <td className="py-2.5 text-right financial-value hidden md:table-cell">
                  <RealizedCell value={e.realizedPnlTtm} currency={currency} />
                </td>
                <td className="py-2.5 text-right financial-value">
                  <PctCell value={e.twr !== null ? e.twr * 100 : null} />
                </td>
                <td className="py-2.5 text-right financial-value hidden sm:table-cell">
                  <PctCell value={e.mwr !== null ? e.mwr * 100 : null} />
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden lg:table-cell">
                  {formatPercent(e.weightPct, { decimals: 1 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs uppercase tracking-widest border-t border-border-2">
            <tr>
              <td className="py-2.5 text-secondary">Total</td>
              <td className="py-2.5 text-right financial-value text-primary">
                {formatCurrency(totalCurrent, currency, { compact: true })}
              </td>
              <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                {formatCurrency(totalInvested, currency, { compact: true })}
              </td>
              <td className={`py-2.5 text-right financial-value ${totalUnrealized >= 0 ? 'text-accent' : 'text-danger'}`}>
                {formatCurrency(totalUnrealized, currency, { compact: true, sign: true })}
                <span className="text-xs text-muted ml-1 hidden sm:inline">
                  ({formatPercent(totalPnlPct, { sign: true })})
                </span>
              </td>
              <td className="py-2.5 text-right financial-value hidden md:table-cell">
                <RealizedCell value={totalRealizedTtm} currency={currency} />
              </td>
              <td className="py-2.5 text-right financial-value text-muted">—</td>
              <td className="py-2.5 text-right financial-value text-muted hidden sm:table-cell">—</td>
              <td className="py-2.5 text-right financial-value text-secondary hidden lg:table-cell">
                {formatPercent(100, { decimals: 0 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────

function RealizedCell({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className="text-muted">—</span>
  const color = value >= 0 ? 'text-accent' : 'text-danger'
  return (
    <span className={color}>
      {formatCurrency(value, currency, { compact: true, sign: true })}
    </span>
  )
}

function PctCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>
  const color = value >= 0 ? 'text-accent' : 'text-danger'
  return (
    <span className={color}>
      {formatPercent(value, { sign: true, decimals: 1 })}
    </span>
  )
}
