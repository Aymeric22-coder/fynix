/**
 * Onglet "Cash" — wrap CashSummary existant + nouvelle analyse :
 *   - Rendement moyen pondéré du cash (par compte selon taux de livret)
 *   - Couverture des charges avec jauge colorée
 *   - Alerte cash excessif (> 20 % du patrimoine)
 */
'use client'

import { PiggyBank, AlertCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { CashSummary } from '../CashSummary'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

// Taux de rendement typique par type de compte (référence indicative 2024)
const TAUX_PAR_TYPE: Record<string, number> = {
  livret_a:       3.0,
  ldds:           3.0,
  lep:            5.0,
  pel:            2.25,
  cel:            2.0,
  compte_courant: 0,
  autre:          0,
}

export function CashAnalyse({ data }: Props) {
  if (data.comptes.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Aucun compte cash renseigné"
        description="Ajoutez vos livrets, PEL, compte courant dans /cash pour voir l'analyse."
      />
    )
  }

  // Rendement moyen pondéré
  let rendementPondere = 0
  for (const c of data.comptes) {
    const taux = TAUX_PAR_TYPE[c.type] ?? 0
    rendementPondere += (c.solde / data.totalCash) * taux
  }
  const interetsAnnuels = data.totalCash * rendementPondere / 100

  // Coussin charges
  const chargesTotales = data.fireInputs.charges_mensuelles + data.mensualitesImmoTotal
  const moisCouverts = chargesTotales > 0 ? data.totalCash / chargesTotales : 0
  const niveauCoussin =
    moisCouverts < 3   ? { tone: 'rouge',  label: 'Épargne de précaution insuffisante' } :
    moisCouverts < 6   ? { tone: 'orange', label: 'Correct — visez 6 mois' } :
    moisCouverts < 12  ? { tone: 'vert',   label: 'Excellent coussin de sécurité' } :
                         { tone: 'or',     label: 'Cash excessif — une partie pourrait être investie' }

  const partCash = data.totalBrut > 0 ? (data.totalCash / data.totalBrut) * 100 : 0
  const cashExcessif = partCash > 20

  return (
    <div className="space-y-4">
      {/* Cash summary existant (liste comptes + total + alerte excessive) */}
      <CashSummary comptes={data.comptes} totalCash={data.totalCash} totalBrut={data.totalBrut} />

      {/* Rendement moyen pondéré */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Rendement moyen du cash</p>
        <div className="flex items-baseline gap-3 mb-2">
          <p className="text-2xl font-semibold financial-value text-accent">
            {formatPercent(rendementPondere, { decimals: 2 })} <span className="text-sm text-secondary">/ an</span>
          </p>
          <p className="text-sm text-secondary">
            soit ≈ {formatCurrency(interetsAnnuels, 'EUR', { decimals: 0 })}/an d&apos;intérêts
          </p>
        </div>
        <p className="text-xs text-muted">
          Taux moyen pondéré sur vos {data.comptes.length} compte{data.comptes.length > 1 ? 's' : ''}.
          Taux indicatifs 2024 : Livret A 3 % · LDDS 3 % · LEP 5 % · PEL 2.25 % · Compte courant 0 %.
        </p>
      </div>

      {/* Couverture charges */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Couverture des charges</p>
        <div className="flex items-baseline gap-3 mb-3">
          <p className="text-2xl font-semibold financial-value text-primary">
            {moisCouverts.toFixed(1)} mois
          </p>
          <p className="text-xs text-secondary">
            sur {formatCurrency(chargesTotales, 'EUR', { decimals: 0 })}/mois de charges totales
          </p>
        </div>
        <JaugeCoussin mois={moisCouverts} />
        <p className={`text-xs mt-3 ${
          niveauCoussin.tone === 'rouge'  ? 'text-danger' :
          niveauCoussin.tone === 'orange' ? 'text-warning' :
          niveauCoussin.tone === 'or'     ? 'text-amber-400' :
                                            'text-accent'
        }`}>
          {niveauCoussin.label}
        </p>
      </div>

      {/* Alerte cash excessif */}
      {cashExcessif && (
        <div className="card p-5 bg-warning-muted border-warning/30">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={14} className="text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-primary font-medium mb-1">Cash excessif détecté</p>
              <p className="text-xs text-secondary leading-relaxed">
                Votre cash représente <span className="text-warning font-semibold">{partCash.toFixed(0)} %</span> de
                votre patrimoine ({formatCurrency(data.totalCash, 'EUR', { decimals: 0 })}).
                <span className="text-primary"> {formatCurrency(data.totalCash * 0.5, 'EUR', { decimals: 0 })}</span> environ
                pourraient être progressivement investis via DCA pour optimiser votre trajectoire FIRE.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function JaugeCoussin({ mois }: { mois: number }) {
  const cap = 18
  const pos = Math.min(100, (mois / cap) * 100)
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden flex">
      <div className="bg-danger/60"  style={{ width: '16.6%' }} />  {/* 0-3 mois */}
      <div className="bg-warning/60" style={{ width: '16.6%' }} />  {/* 3-6 mois */}
      <div className="bg-accent/60"  style={{ width: '33.3%' }} />  {/* 6-12 mois */}
      <div className="bg-amber-400/60" style={{ width: '33.3%' }} />{/* 12-18+ */}
      <div className="absolute top-1/2 w-0.5 h-3.5 bg-primary"
           style={{ left: `${pos}%`, transform: `translate(-50%, -50%)` }} />
    </div>
  )
}
