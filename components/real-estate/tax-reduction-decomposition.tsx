'use client'

import { AlertTriangle, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  /** IR théorique avant réduction (taxPaid + taxReductionApplied). */
  taxBeforeReduction:  number
  taxReductionTotal:   number
  taxReductionApplied: number
  taxReductionLost:    number
  /** IR effectivement payé après imputation. */
  taxPaid:             number
  /** Libellé du dispositif (ex: "Pinel+ 9 ans", "Loc'Avantages Loc2"). */
  incentiveLabel?:     string
}

/**
 * Décomposition fiscale Y1 : IR avant réduction → réduction → IR net.
 * Affiche aussi le warning "réduction perdue" si l'IR était insuffisant
 * pour absorber toute la réduction (excédent non reportable).
 */
export function TaxReductionDecomposition({
  taxBeforeReduction, taxReductionTotal, taxReductionApplied, taxReductionLost,
  taxPaid, incentiveLabel,
}: Props) {
  if (taxReductionTotal <= 0) return null

  return (
    <div className="card border-accent/20 p-4 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} className="text-accent" />
        <h4 className="text-sm font-medium text-primary">
          Décomposition fiscale année 1 {incentiveLabel && (
            <span className="text-secondary font-normal"> · {incentiveLabel}</span>
          )}
        </h4>
      </div>

      <Row label="Impôt avant réduction"
        value={formatCurrency(taxBeforeReduction, 'EUR')} />
      <Row label={`Réduction ${incentiveLabel ?? 'fiscale'}`}
        value={`−${formatCurrency(taxReductionApplied, 'EUR')}`}
        tone="positive" />
      <Row label="Impôt net payé"
        value={formatCurrency(taxPaid, 'EUR')}
        bold />

      {taxReductionLost > 0 && (
        <div className="flex items-start gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-md p-2 mt-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <p>
            Réduction non utilisée : {formatCurrency(taxReductionLost, 'EUR')}.
            L&apos;IR de l&apos;année était insuffisant pour absorber toute la
            réduction théorique ({formatCurrency(taxReductionTotal, 'EUR')}).
            L&apos;excédent est <strong>perdu</strong> (non reportable Pinel /
            Denormandie / Loc&apos;Avantages).
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, tone, bold }: {
  label: string; value: string; tone?: 'positive'; bold?: boolean
}) {
  const valueClass = tone === 'positive' ? 'text-accent' : 'text-primary'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-secondary">{label}</span>
      <span className={`text-sm financial-value ${valueClass} ${bold ? 'font-semibold' : ''}`}>
        {value}
      </span>
    </div>
  )
}
