/**
 * Couverture des charges en mois — bloc isolé extrait de CashAnalyse.
 *
 * Utilisé dans l'onglet « Où j'en suis » de /analyse (refonte 3 onglets).
 * Affiche le coussin de sécurité (cash / charges totales) avec jauge
 * colorée et message d'interprétation.
 */
'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props {
  data: PatrimoineComplet
}

export function CouvertureCash({ data }: Props) {
  if (data.comptes.length === 0) return null

  // V1.3-PATCH — Harmonisation sur `charges_mensuelles` SEULES (sans
  // mensualités immo) pour cohérence avec `/cash` (bloc Matelas) et
  // `scores.ts > calculerSolidite`. L'utilisateur voit désormais la
  // même base de charges partout. Cf. commentaire scores.ts pour la
  // discussion sur la nuance sémantique abandonnée.
  const charges      = data.fireInputs.charges_mensuelles
  const moisCouverts = charges > 0 ? data.totalCash / charges : 0

  return (
    <div className="card p-5">
      <p className="text-xs text-secondary uppercase tracking-widest mb-3">Couverture des charges</p>
      <div className="flex items-baseline gap-3 mb-3 flex-wrap">
        <p className="text-2xl font-semibold financial-value text-primary">
          {moisCouverts.toFixed(1)} mois
        </p>
        {charges > 0 && (
          <p className="text-xs text-secondary">
            sur {formatCurrency(charges, 'EUR', { decimals: 0 })}/mois de charges
          </p>
        )}
      </div>
      <JaugeCoussin mois={moisCouverts} />
      {/* V1.4 Vol B — Verdict qualificatif retiré pour fermer la dissonance
          observée en prod : « Excellent coussin » ici + « Excédent de
          liquidité » sur /cash semblaient contradictoires. Désormais :
          /analyse = observation factuelle, /cash = diagnostic actionnable. */}
      <p className="text-[11px] text-muted mt-3">
        Diagnostic complet sur le bloc Matelas de <span className="text-secondary">/cash</span>.
      </p>
      <Link
        href="/cash#matelas"
        className="inline-flex items-center gap-1 mt-2 text-[11px] text-accent/70 hover:text-accent transition-colors"
      >
        Voir mon matelas de sécurité contextualisé
        <ArrowRight size={11} />
      </Link>
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
