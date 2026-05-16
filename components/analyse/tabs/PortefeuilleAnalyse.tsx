/**
 * Onglet "Portefeuille" — orchestre les 6 sous-onglets par classe d'actif.
 * Un sous-onglet n'est visible que si l'utilisateur détient des positions
 * dans cette classe.
 */
'use client'

import { useMemo } from 'react'
import { Tabs, type TabItem } from '@/components/ui/tabs'
import { Briefcase } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { BourseAnalyse }      from './portefeuille/BourseAnalyse'
import { ETFAnalyse }         from './portefeuille/ETFAnalyse'
import { CryptoAnalyse }      from './portefeuille/CryptoAnalyse'
import { ImmoPapierAnalyse }  from './portefeuille/ImmoPapierAnalyse'
import { ObligataireAnalyse } from './portefeuille/ObligataireAnalyse'
import { MetauxAnalyse }      from './portefeuille/MetauxAnalyse'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props { data: PatrimoineComplet }

export function PortefeuilleAnalyse({ data }: Props) {
  // Pré-calcule les classes présentes (pour masquer les sous-onglets vides)
  const presence = useMemo(() => ({
    bourse:     data.positions.some((p) => p.asset_type === 'stock'),
    etf:        data.positions.some((p) => p.asset_type === 'etf'),
    crypto:     data.cryptoTotal > 0,
    immo_papier: data.positions.some((p) => p.asset_type === 'scpi'),
    obligataire: data.positions.some((p) => p.asset_type === 'bond'),
    metaux:     data.positions.some((p) => p.asset_type === 'metal'),
  }), [data])

  const tabs: TabItem[] = []
  if (presence.bourse)      tabs.push({ id: 'bourse',      label: 'Bourse',        content: <BourseAnalyse data={data} /> })
  if (presence.etf)         tabs.push({ id: 'etf',         label: 'ETF / Fonds',   content: <ETFAnalyse data={data} /> })
  if (presence.crypto)      tabs.push({ id: 'crypto',      label: 'Crypto',        content: <CryptoAnalyse data={data} /> })
  if (presence.immo_papier) tabs.push({ id: 'immo_papier', label: 'Immo papier',   content: <ImmoPapierAnalyse data={data} /> })
  if (presence.obligataire) tabs.push({ id: 'obligataire', label: 'Obligataire',   content: <ObligataireAnalyse data={data} /> })
  if (presence.metaux)      tabs.push({ id: 'metaux',      label: 'Métaux',        content: <MetauxAnalyse data={data} /> })

  if (tabs.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Portefeuille financier vide"
        description="Ajoutez des positions dans /portefeuille pour activer les analyses par classe d'actif."
      />
    )
  }

  return <Tabs tabs={tabs} urlParam="sub" />
}
