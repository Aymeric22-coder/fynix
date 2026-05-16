/**
 * Onglet "Scores & Projection" — wrap les 3 composants existants :
 * bande des 5 scores cliquables + projection FIRE multi-composantes
 * + simulateur d'acquisitions (déjà inclus dans ProjectionFIRE).
 */
'use client'

import { ScoresBand } from '../ScoresBand'
import { ProjectionFIRE } from '../ProjectionFIRE'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

export function ScoresProjectionAnalyse({ data }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">Scores d&apos;intelligence</p>
        <ScoresBand scores={data.scores} />
        <p className="text-xs text-muted mt-2">Cliquez sur une carte pour voir le détail du calcul et l&apos;action recommandée.</p>
      </div>
      <ProjectionFIRE patrimoine={data} />
    </div>
  )
}
