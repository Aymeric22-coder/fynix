/**
 * Liste des recommandations personnalisées (Phase 3) + disclaimer AMF.
 *
 * Tri serveur : déjà priorisé (haute > moyenne > info) par genererRecommandations.
 * Bordure colorée par priorité (rouge / orange / bleu).
 *
 * Le bouton « ✓ Fait » de chaque carte est persisté côté Supabase via
 * la table `recos_done` (migration 030) — voir hooks/use-recos-done.ts.
 * Les recos marquées comme faites glissent dans une section repliable
 * « Complétées (N) » en bas de la liste, fermée par défaut.
 */
'use client'

import { useState } from 'react'
import {
  AlertTriangle, AlertCircle, Info, Compass, Receipt, Sparkles, Shield, PiggyBank,
  Coins, Clock, Check, RotateCcw, ChevronDown, ChevronUp, Gift,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Recommandation } from '@/types/analyse'
import type { RecommandationEnrichie } from '@/lib/analyse/recommandations'
import { formatEur } from '@/lib/utils/format'
import { useRecosDone } from '@/hooks/use-recos-done'

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
  // CS4 — nouvelle catégorie transmission (recos AV/donations/clause bénéficiaire).
  transmission:    Gift,
}

export function Recommandations({ recos }: Props) {
  // Persisté côté Supabase (table recos_done). `loading` est true pendant
  // le GET initial — on désactive les boutons pour éviter un toggle avant
  // qu'on connaisse l'état persisté.
  const { doneKeys, toggle, loading } = useRecosDone()

  // Section « Complétées » fermée par défaut (accordéon).
  const [completedOpen, setCompletedOpen] = useState(false)

  const remaining = recos.filter((r) => !doneKeys.has(r.id))
  const done      = recos.filter((r) => doneKeys.has(r.id))

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <p className="text-xs text-secondary uppercase tracking-widest">Recommandations personnalisées</p>
          <p className="text-xs text-muted mt-0.5">
            {recos.length === 0
              ? 'aucune action prioritaire'
              : `${remaining.length} restante${remaining.length > 1 ? 's' : ''}${
                  done.length > 0 ? ` · ${done.length} complétée${done.length > 1 ? 's' : ''}` : ''
                }`}
          </p>
        </div>
      </div>

      {recos.length === 0 ? (
        <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-3 text-sm text-primary">
          ✨ Aucune recommandation prioritaire — votre patrimoine est bien aligné avec votre profil.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {remaining.map((r) => (
              <RecoCard
                key={r.id}
                reco={r}
                done={false}
                disabled={loading}
                onToggle={() => { void toggle(r.id, true) }}
              />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border space-y-3">
              <button
                type="button"
                onClick={() => setCompletedOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs text-muted uppercase tracking-widest
                           hover:text-primary transition-colors"
                aria-expanded={completedOpen}
              >
                <span>Complétées ({done.length})</span>
                {completedOpen
                  ? <ChevronUp size={14} />
                  : <ChevronDown size={14} />}
              </button>
              {completedOpen && (
                <div className="space-y-3">
                  {done.map((r) => (
                    <RecoCard
                      key={r.id}
                      reco={r}
                      done
                      disabled={loading}
                      onToggle={() => { void toggle(r.id, false) }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="mt-5 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
        ⚠ Ces recommandations sont des simulations automatiques basées sur les données de votre patrimoine.
        Elles ne constituent pas un conseil en investissement au sens de la réglementation AMF.
        Consultez un conseiller en gestion de patrimoine pour toute décision importante.
      </p>
    </div>
  )
}

function RecoCard({ reco, done, disabled = false, onToggle }: {
  reco:      Recommandation
  done:      boolean
  disabled?: boolean
  onToggle:  () => void
}) {
  const { border, badge, label } = PRIO_COLOR[reco.priorite]
  const PrioIcon = PRIO_COLOR[reco.priorite].icon
  const CatIcon  = CATEGORIE_ICON[reco.categorie]

  // Tache C : champs structurés (gain_estime_eur / mois_gagnes_fire) ajoutés
  // par genererRecommandations via le type local RecommandationEnrichie. Le
  // type public reste Recommandation, on caste pour lire les champs optionnels.
  const enriched = reco as RecommandationEnrichie
  const gainEur     = typeof enriched.gain_estime_eur  === 'number' ? enriched.gain_estime_eur  : null
  const gainLabel   = enriched.gain_estime_label
  const moisGagnes  = typeof enriched.mois_gagnes_fire === 'number' ? enriched.mois_gagnes_fire : null

  return (
    <div className={`bg-surface-2 rounded-lg border-l-4 ${border} px-4 py-3.5 ${done ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CatIcon size={14} className="text-secondary" />
          <h3 className={`text-sm font-semibold text-primary ${done ? 'line-through' : ''}`}>
            {reco.titre}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge}`}>
            <PrioIcon size={10} />
            <span>{label}</span>
          </span>
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={done}
            aria-busy={disabled}
            aria-label={done ? 'Marquer comme à faire' : 'Marquer comme faite'}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              done
                ? 'border-secondary/40 text-secondary hover:text-primary hover:border-primary/40'
                : 'border-accent/40 text-accent hover:bg-accent/10'
            }`}
          >
            {done ? (
              <>
                <RotateCcw size={11} />
                Refaire
              </>
            ) : (
              <>
                <Check size={11} />
                Fait
              </>
            )}
          </button>
        </div>
      </div>

      <p className="text-xs text-secondary leading-relaxed mb-2">{reco.description}</p>

      {reco.impact_estime && (
        <p className="text-xs text-accent mb-2">→ {reco.impact_estime}</p>
      )}

      {/* Chips chiffrées (Tâche C) — visibles uniquement si les champs
          structurés sont fournis par genererRecommandations. */}
      {(gainEur !== null || moisGagnes !== null) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {gainEur !== null && gainEur > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 border border-accent/30 text-xs">
              <Coins size={11} className="text-accent" />
              <span className="text-accent font-medium financial-value">{formatEur(gainEur, { decimals: 0 })}</span>
              {gainLabel && <span className="text-secondary">{gainLabel}</span>}
            </span>
          )}
          {moisGagnes !== null && moisGagnes > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 border border-accent/30 text-xs">
              <Clock size={11} className="text-accent" />
              <span className="text-accent font-medium financial-value">
                {moisGagnes} mois
              </span>
              <span className="text-secondary">gagnés sur l&apos;indépendance</span>
            </span>
          )}
        </div>
      )}

      <div className="bg-bg/40 border border-border rounded-md px-3 py-2 mt-2">
        <p className="text-[10px] text-muted uppercase tracking-widest mb-0.5">Action recommandée</p>
        <p className="text-xs text-primary leading-relaxed">{reco.action}</p>
      </div>
    </div>
  )
}
