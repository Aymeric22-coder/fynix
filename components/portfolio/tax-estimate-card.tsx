/**
 * Carte « Impôt estimé sur PV réalisées 12 mois » (TAX).
 *
 * Estimation INDICATIVE par enveloppe (PEA, CTO, AV, PER, crypto).
 * Alimentée par `summary.taxEstimate` (cf. `lib/portfolio/build-from-db.ts`).
 *
 * Rendu conditionnel : null si `data === null` (aucune PV réalisée).
 * Visible uniquement dans l'onglet Global (condition au site d'appel,
 * cohérent avec EnvelopePerformanceTable / DividendCalendarStrip).
 *
 * Server Component — pas d'interactivité.
 */

import { Landmark } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { InfoTip } from '@/components/ui/info-tip'
import type { EnvelopeTaxEstimate } from '@/lib/portfolio/tax-estimate'

interface Props {
  data: {
    byEnvelope:          EnvelopeTaxEstimate[]
    totalEstimatedTax:   number
    totalRealizedPnlTtm: number
  } | null
  currency:  string
  className?: string
}

export function TaxEstimateCard({ data, currency, className }: Props) {
  if (!data || data.byEnvelope.length === 0) return null

  // Taux effectif global (sur les seules lignes estimables à PV positive).
  const estimableBasis = data.byEnvelope
    .filter((e) => e.isEstimable && e.realizedPnlTtm > 0)
    .reduce((s, e) => s + e.realizedPnlTtm, 0)
  const globalRate = estimableBasis > 0 ? data.totalEstimatedTax / estimableBasis : null

  return (
    <div className={['card p-5', className ?? ''].join(' ')}>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
          <Landmark size={11} /> Impôt estimé · PV réalisées 12 mois
          <InfoTip text="Plus-value effectivement encaissée lors de ventes. Cumul des 12 derniers mois glissants." />
        </p>
        <p className="text-xs text-muted">{data.byEnvelope.length} enveloppe{data.byEnvelope.length > 1 ? 's' : ''}</p>
      </div>

      {/* KPI principal */}
      <div className="mb-4">
        <p className="text-xl font-semibold financial-value text-danger">
          {formatCurrency(data.totalEstimatedTax, currency, { compact: true })}
        </p>
        <p className="text-xs text-secondary mt-1">
          sur {formatCurrency(data.totalRealizedPnlTtm, currency, { compact: true })} de PV réalisée
          {globalRate !== null && (
            <span className="text-muted"> · taux effectif {formatPercent(globalRate * 100, { decimals: 1 })}</span>
          )}
        </p>
      </div>

      {/* Breakdown par enveloppe */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-secondary uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left  py-2 font-medium">Enveloppe</th>
              <th className="text-right py-2 font-medium">PV réalisée</th>
              <th className="text-right py-2 font-medium hidden md:table-cell">Base imposable</th>
              <th className="text-right py-2 font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  Impôt estimé
                  <InfoTip placement="bottom" text="Prélèvement Forfaitaire Unique (PFU 30 %) : 12,8 % d'impôt sur le revenu + 17,2 % de prélèvements sociaux. Régime par défaut des plus-values mobilières." />
                </span>
              </th>
              <th className="text-left  py-2 font-medium hidden lg:table-cell pl-4">
                <span className="inline-flex items-center gap-1">
                  Régime
                  <InfoTip placement="bottom" text="Régime fiscal appliqué selon l'enveloppe. Cas particulier : sur les assurances-vie de plus de 8 ans, les gains bénéficient d'un abattement annuel (4 600 € seul, 9 200 € couple marié ou pacsé) avant imposition." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.byEnvelope.map((e) => (
              <tr
                key={e.envelopeId}
                className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
              >
                <td className="py-2.5 max-w-[180px]">
                  <p className="text-primary truncate">{e.envelopeLabel}</p>
                </td>
                <td className="py-2.5 text-right financial-value text-secondary">
                  {formatCurrency(e.realizedPnlTtm, currency, { compact: true, sign: true })}
                </td>
                <td className="py-2.5 text-right financial-value text-secondary hidden md:table-cell">
                  {e.isEstimable
                    ? formatCurrency(e.taxableBase, currency, { compact: true })
                    : <span className="text-muted">—</span>}
                </td>
                <td className="py-2.5 text-right financial-value">
                  {e.estimatedTax === null
                    ? <span className="text-muted">non estimé</span>
                    : <span className="text-danger">{formatCurrency(e.estimatedTax, currency, { compact: true })}</span>}
                </td>
                <td className="py-2.5 text-left text-xs text-muted hidden lg:table-cell pl-4 max-w-[220px]">
                  <span className="truncate block">{e.regimeLabel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Disclaimer obligatoire */}
      <p className="text-[10px] text-muted leading-relaxed mt-4 pt-3 border-t border-border">
        ⚠️ Estimation indicative — ne constitue pas un conseil fiscal. Couvre les
        plus-values réalisées uniquement (hors dividendes, coupons, revenus fonciers).
        Régime par défaut (PFU), hors situations particulières. Pour PEA et AV,
        l&apos;impôt n&apos;est dû qu&apos;au retrait : les ventes internes sont comptées
        comme imposables, ce qui majore l&apos;estimation.
      </p>
    </div>
  )
}
