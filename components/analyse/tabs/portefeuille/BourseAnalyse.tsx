/**
 * Sous-onglet Portefeuille > Bourse — actions directes uniquement.
 *
 * Affiche : sectorielle + géo + concentration par titre.
 */
'use client'

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { analyseSubset, calculerConcentration } from '@/lib/analyse/subsetAnalyse'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { SectorielleChart } from '../../SectorielleChart'
import { GeographiqueChart } from '../../GeographiqueChart'
import { FiabiliteBadge } from '../../FiabiliteBadge'
import { MiniRing } from '../../MiniRing'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

const CONCENTRATION_SEUIL_ALERTE = 20  // % d'une seule action

export function BourseAnalyse({ data }: Props) {
  const actions = useMemo(
    () => data.positions.filter((p) => p.asset_type === 'stock'),
    [data.positions],
  )
  const subset = useMemo(() => analyseSubset(actions), [actions])
  const conc   = useMemo(() => calculerConcentration(actions), [actions])

  return (
    <div className="space-y-4">
      {/* 3 mini-cartes scores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ScoreCard title="Alignement sectoriel" score={subset.scoreSectoriel} caption="vs MSCI World" />
        <ScoreCard title="Alignement géographique" score={subset.scoreGeo} caption="vs MSCI ACWI" />
        <ScoreCard title="Concentration" score={conc.score} caption={conc.topName ? `top: ${conc.topName} ${conc.topPct.toFixed(0)} %` : '—'} />
      </div>

      <FiabiliteBadge fiabilite={subset.fiabilite} unmappedAll={[]} />

      {/* Alerte concentration */}
      {conc.topPct > CONCENTRATION_SEUIL_ALERTE && conc.topName && (
        <div className="card p-4 bg-warning-muted border-warning/30">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-primary">
              <span className="text-warning font-medium">{conc.topName}</span> représente {' '}
              <span className="text-warning font-semibold financial-value">{formatPercent(conc.topPct, { decimals: 1 })}</span>{' '}
              de votre portefeuille boursier — risque idiosyncratique élevé.
            </p>
          </div>
        </div>
      )}

      {/* Sectorielle + Géo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SectorielleChart  buckets={subset.secteur} score={subset.scoreSectoriel} />
        <GeographiqueChart buckets={subset.geo}     score={subset.scoreGeo} />
      </div>

      <p className="text-xs text-muted">
        {actions.length} action{actions.length > 1 ? 's' : ''} directe{actions.length > 1 ? 's' : ''} ·
        valeur totale {formatCurrency(subset.totalValue, 'EUR', { compact: true })}
      </p>
    </div>
  )
}

function ScoreCard({ title, score, caption }: { title: string; score: number; caption: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <MiniRing score={score} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-secondary uppercase tracking-widest">{title}</p>
        <p className="text-[10px] text-muted truncate mt-0.5">{caption}</p>
      </div>
    </div>
  )
}
