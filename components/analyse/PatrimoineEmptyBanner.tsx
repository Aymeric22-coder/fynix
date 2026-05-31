/**
 * CS2 LOT 4 — Bandeau affiché dans /analyse quand le patrimoine agrégé est
 * vide (totalNet === 0) ET que le wizard est complété (wizard_step_completed
 * >= 10). Évite que l'utilisateur voie une projection démarrant à 0 € sans
 * comprendre pourquoi.
 *
 * Pattern visuel : carte accent-muted avec icône + texte + 2 CTAs.
 * Tutoiement, ton FIRECORE (chaleureux mais factuel).
 */
'use client'

import Link from 'next/link'
import { Wallet, TrendingUp, ArrowRight } from 'lucide-react'

interface Props {
  /** True si l'utilisateur a finalisé le wizard (sinon ne pas afficher). */
  wizardComplete: boolean
  /** Patrimoine agrégé total. Le bandeau ne s'affiche que si === 0. */
  totalNet:       number
}

export function PatrimoineEmptyBanner({ wizardComplete, totalNet }: Props) {
  // Garde : on n'affiche le bandeau que si l'utilisateur a terminé le wizard
  // (sinon il est encore en cours d'onboarding) ET si le patrimoine est vide.
  if (!wizardComplete) return null
  if (totalNet > 0)    return null

  return (
    <div
      data-testid="patrimoine-empty-banner"
      className="rounded-xl border border-accent/30 bg-accent-muted/40 p-5 mb-5 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div className="flex items-start gap-3">
        <Wallet size={20} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary mb-1">
            On ne voit pas encore tes placements
          </p>
          <p className="text-xs text-secondary leading-relaxed mb-3">
            Ta projection FIRE démarre à 0 € parce qu&apos;aucun actif n&apos;a été
            renseigné dans tes tables. Ajoute tes placements financiers et tes
            comptes pour que ta projection reflète ta vraie situation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/portefeuille"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-bg hover:bg-accent-hover transition-colors"
            >
              <TrendingUp size={12} />
              Ajouter mes placements
              <ArrowRight size={12} />
            </Link>
            <Link
              href="/cash"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-accent/40 bg-surface-2 text-accent hover:bg-accent-muted transition-colors"
            >
              <Wallet size={12} />
              Ajouter mes comptes / livrets
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
