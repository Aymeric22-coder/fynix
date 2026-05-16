/**
 * Onglet "Immobilier physique" — wrap ImmoSummary existant.
 * Inclut un message dédié si aucun bien.
 */
'use client'

import { Building2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ImmoSummary } from '../ImmoSummary'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

export function ImmoPhysiqueAnalyse({ data }: Props) {
  if (data.biens.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Aucun bien immobilier"
        description="Ajoutez vos biens dans /immobilier pour voir l'analyse détaillée (LTV, cashflow, rendement net)."
      />
    )
  }
  return (
    <ImmoSummary
      biens={data.biens}
      totalImmo={data.totalImmo}
      totalDettes={data.totalDettes}
      totalImmoEquity={data.totalImmoEquity}
      revenuPassifImmo={data.revenuPassifImmo}
      rendementNetImmoMoyen={data.rendementNetImmoMoyen}
      revenuPassifCible={data.fireInputs.revenu_passif_cible}
    />
  )
}
