/**
 * Onglet "Global" — vue d'ensemble du patrimoine.
 *
 * 5 KPIs + Donut répartition par classe + Score global synthétique
 * (moyenne des 5 scores d'intelligence).
 */
'use client'

import { Wallet, Building2, PiggyBank, TrendingUp, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { RepartitionChart } from '../RepartitionChart'
import { ScoreRing } from '@/components/profil/ScoreRing'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

export function GlobalAnalyse({ data }: Props) {
  // Score global synthétique = moyenne des 5 scores (ignorer les null)
  const scoreValues = [
    data.scores.diversification.value,
    data.scores.coherence_profil.value,
    data.scores.progression_fire.value,
    data.scores.solidite.value,
    data.scores.efficience_fiscale.value,
  ].filter((v): v is number => v !== null)
  const scoreGlobal = scoreValues.length > 0
    ? Math.round(scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length)
    : null

  return (
    <div>
      {/* 5 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi icon={Wallet}     label="Patrimoine net"       value={formatCurrency(data.totalNet, 'EUR', { compact: true })} accent />
        <Kpi icon={TrendingUp} label="Portefeuille"         value={formatCurrency(data.totalPortefeuille, 'EUR', { compact: true })} />
        <Kpi icon={Building2}  label="Immobilier"           value={formatCurrency(data.totalImmo, 'EUR', { compact: true })} />
        <Kpi icon={PiggyBank}  label="Cash"                 value={formatCurrency(data.totalCash, 'EUR', { compact: true })} />
        <Kpi icon={Sparkles}   label="Revenu passif / mois" value={formatCurrency(data.revenuPassifActuel, 'EUR', { decimals: 0 })} accent />
      </div>

      {/* Donut + Score global */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
        <div className="lg:col-span-2">
          <RepartitionChart classes={data.repartitionClasses} totalNet={data.totalNet} />
        </div>
        <div className="card p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-secondary uppercase tracking-widest mb-4">Score global investisseur</p>
          {scoreGlobal !== null ? (
            <>
              <ScoreRing score={scoreGlobal} caption="Moyenne des 5 scores" />
              <p className="text-xs text-muted mt-3 text-center leading-relaxed">
                Cliquez sur les scores individuels dans l&apos;onglet « Scores &amp; Projection » pour le détail.
              </p>
            </>
          ) : (
            <p className="text-sm text-secondary">Données insuffisantes pour calculer le score global.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, accent }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string; value: string; accent?: boolean
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-secondary uppercase tracking-widest">
        <Icon size={11} />
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-lg sm:text-xl font-semibold financial-value mt-2 ${accent ? 'text-accent' : 'text-primary'}`}>{value}</p>
    </div>
  )
}
