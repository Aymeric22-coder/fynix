/**
 * Liste des recommandations personnalisées (Phase 3) + disclaimer AMF.
 *
 * Tri serveur : déjà priorisé (haute > moyenne > info) par genererRecommandations.
 * Bordure colorée par priorité (rouge / orange / bleu).
 */
'use client'

import {
  AlertTriangle, AlertCircle, Info, Compass, Receipt, Sparkles, Shield, PiggyBank,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Recommandation } from '@/types/analyse'

interface Props {
  recos: Recommandation[]
}

const PRIO_COLOR: Record<Recommandation['priorite'], { border: string; badge: string; label: string; icon: LucideIcon }> = {
  haute: {
    border: 'border-l-danger',
    badge:  'bg-danger-muted text-danger',
    label:  'Priorité haute',
    icon:   AlertTriangle,
  },
  moyenne: {
    border: 'border-l-warning',
    badge:  'bg-warning-muted text-warning',
    label:  'Priorité moyenne',
    icon:   AlertCircle,
  },
  info: {
    border: 'border-l-blue-400',
    badge:  'bg-blue-500/10 text-blue-400',
    label:  'Suggestion',
    icon:   Info,
  },
}

const CATEGORIE_ICON: Record<Recommandation['categorie'], LucideIcon> = {
  diversification: Compass,
  fiscalite:       Receipt,
  fire:            Sparkles,
  risque:          Shield,
  liquidite:       PiggyBank,
}

export function Recommandations({ recos }: Props) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <p className="text-xs text-secondary uppercase tracking-widest">Recommandations personnalisées</p>
        <p className="text-xs text-muted mt-0.5">{recos.length} action{recos.length > 1 ? 's' : ''} prioritaire{recos.length > 1 ? 's' : ''}</p>
      </div>

      {recos.length === 0 ? (
        <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-3 text-sm text-primary">
          ✨ Aucune recommandation prioritaire — votre patrimoine est bien aligné avec votre profil.
        </div>
      ) : (
        <div className="space-y-3">
          {recos.map((r) => <RecoCard key={r.id} reco={r} />)}
        </div>
      )}

      <p className="mt-5 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
        ⚠ Ces recommandations sont des simulations automatiques basées sur les données de votre patrimoine.
        Elles ne constituent pas un conseil en investissement au sens de la réglementation AMF.
        Consultez un conseiller en gestion de patrimoine pour toute décision importante.
      </p>
    </div>
  )
}

function RecoCard({ reco }: { reco: Recommandation }) {
  const { border, badge, label } = PRIO_COLOR[reco.priorite]
  const PrioIcon = PRIO_COLOR[reco.priorite].icon
  const CatIcon  = CATEGORIE_ICON[reco.categorie]

  return (
    <div className={`bg-surface-2 rounded-lg border-l-4 ${border} px-4 py-3.5`}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CatIcon size={14} className="text-secondary" />
          <h3 className="text-sm font-semibold text-primary">{reco.titre}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge}`}>
          <PrioIcon size={10} />
          <span>{label}</span>
        </span>
      </div>

      <p className="text-xs text-secondary leading-relaxed mb-2">{reco.description}</p>

      {reco.impact_estime && (
        <p className="text-xs text-accent mb-2">→ {reco.impact_estime}</p>
      )}

      <div className="bg-bg/40 border border-border rounded-md px-3 py-2 mt-2">
        <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Action recommandée</p>
        <p className="text-xs text-primary leading-relaxed">{reco.action}</p>
      </div>
    </div>
  )
}
