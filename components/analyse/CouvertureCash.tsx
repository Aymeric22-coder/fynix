/**
 * Couverture des charges en mois — bloc isolé extrait de CashAnalyse.
 *
 * Utilisé dans l'onglet « Où j'en suis » de /analyse (refonte 3 onglets).
 * Affiche le coussin de sécurité (cash / charges totales) avec jauge
 * colorée et message d'interprétation.
 */
'use client'

import { formatCurrency } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props {
  data: PatrimoineComplet
}

export function CouvertureCash({ data }: Props) {
  if (data.comptes.length === 0) return null

  const chargesTotales = data.fireInputs.charges_mensuelles + data.mensualitesImmoTotal
  const moisCouverts   = chargesTotales > 0 ? data.totalCash / chargesTotales : 0
  const niveau =
    moisCouverts < 3   ? { tone: 'rouge',  label: 'Épargne de précaution insuffisante' } :
    moisCouverts < 6   ? { tone: 'orange', label: 'Correct — visez 6 mois' } :
    moisCouverts < 12  ? { tone: 'vert',   label: 'Excellent coussin de sécurité' } :
                         { tone: 'or',     label: 'Cash excessif — une partie pourrait être investie' }

  return (
    <div className="card p-5">
      <p className="text-xs text-secondary uppercase tracking-widest mb-3">Couverture des charges</p>
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <p className="text-2xl font-semibold financial-value text-primary">
          {moisCouverts.toFixed(1)} mois
        </p>
        {chargesTotales > 0 && (
          <p className="text-xs text-secondary">
            sur {formatCurrency(chargesTotales, 'EUR', { decimals: 0 })}/mois de charges totales
          </p>
        )}
      </div>
      <JaugeCoussin mois={moisCouverts} />
      <p className={`text-xs mt-3 ${
        niveau.tone === 'rouge'  ? 'text-danger' :
        niveau.tone === 'orange' ? 'text-warning' :
        niveau.tone === 'or'     ? 'text-amber-400' :
                                   'text-accent'
      }`}>
        {niveau.label}
      </p>
    </div>
  )
}

function JaugeCoussin({ mois }: { mois: number }) {
  const cap = 18
  const pos = Math.min(100, (mois / cap) * 100)
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden flex">
      <div className="bg-danger/60"  style={{ width: '16.6%' }} />
      <div className="bg-warning/60" style={{ width: '16.6%' }} />
      <div className="bg-accent/60"  style={{ width: '33.3%' }} />
      <div className="bg-amber-400/60" style={{ width: '33.3%' }} />
      <div className="absolute top-1/2 w-0.5 h-3.5 bg-primary"
           style={{ left: `${pos}%`, transform: `translate(-50%, -50%)` }} />
    </div>
  )
}
