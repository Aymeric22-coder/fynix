/**
 * QW9-bis — Composant de présentation de la cible FIRE ajustée à la
 * composition du foyer.
 *
 * Source unique de la mise en page de l'ajustement famille. Utilisé par :
 *  - ProfilCard (variant `detailed`)
 *  - Dashboard Hero, score Progression FIRE, slider ProjectionFIRE (variant `inline`)
 *
 * Rendu conditionnel : retourne `null` si `!detail.hasAdjustment` — la
 * surface appelante affiche alors UN SEUL chiffre, jamais "3000 → 3000".
 *
 * Les surfaces non-interactives (email, ARIA mock) NE consomment PAS ce
 * composant — elles utilisent `buildCibleFoyerEmailLabel` (texte court).
 */
'use client'

import Link from 'next/link'
import { Users, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { formatCurrency } from '@/lib/utils/format'
import type { CibleFoyerDetail } from '@/lib/profil/cibleFamille'

interface CibleFoyerProps {
  detail:    CibleFoyerDetail
  variant:   'inline' | 'detailed'
  /** className additionnel sur le wrapper externe. */
  className?: string
}

/**
 * Formate un montant en euros (decimals: 0). Utilisé partout pour rester
 * cohérent avec le reste de l'app (financial-value, tabular-nums).
 * Renvoie p.ex. "3 000 €" — le suffixe "/mois" ou "/m" est ajouté à la
 * concaténation côté template (jamais inclus ici pour éviter "€ €/mois").
 */
function fmt(eur: number): string {
  return formatCurrency(eur, 'EUR', { decimals: 0 })
}

/**
 * Contenu textuel du tooltip / bloc detailed, factorisé pour éviter toute
 * divergence entre les 2 variants. Source unique de la copie.
 */
function FoyerExplanation({ detail }: { detail: CibleFoyerDetail }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-secondary leading-relaxed">
        Tu as saisi <span className="text-primary font-medium financial-value">
          {fmt(detail.brut)}/mois
        </span>.
        Pour ton foyer, on vise{' '}
        <span className="text-accent font-semibold financial-value">
          {fmt(detail.ajuste)}/mois
        </span> :
      </p>
      <ul className="space-y-1 text-xs text-secondary">
        {detail.raisons.map((r) => (
          <li key={r.label} className="flex items-baseline gap-2">
            <span className="text-accent financial-value font-medium whitespace-nowrap">
              +{fmt(r.montant)}/mois
            </span>
            <span className="leading-relaxed">{r.label}</span>
          </li>
        ))}
      </ul>
      {detail.hasCoupleBonus && (
        <p className="text-[11px] text-muted leading-relaxed pt-1 border-t border-border">
          <Info size={10} className="inline mr-1 align-baseline" />
          <Link
            href="/profil"
            className="underline hover:text-accent transition-colors"
          >
            Renseigne le revenu de ton conjoint
          </Link>{' '}
          pour affiner ta cible.
        </p>
      )}
    </div>
  )
}

export function CibleFoyer({ detail, variant, className }: CibleFoyerProps) {
  // Rendu conditionnel : pas d'ajustement → on n'affiche rien. La surface
  // appelante s'occupe d'afficher son chiffre unique habituel.
  if (!detail.hasAdjustment) return null

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 max-w-full ${className ?? ''}`}>
        <Badge
          variant="success"
          className="inline-flex items-center gap-1 max-w-full overflow-hidden"
        >
          <Users size={11} className="flex-shrink-0" aria-hidden="true" />
          {/* Mobile : le libellé peut tronquer ("Foyer : 5 100 €/m") mais
              JAMAIS la valeur. On laisse le libellé se raccourcir naturellement
              via le wrapping flex ; le montant est dans un span whitespace-nowrap. */}
          <span className="truncate hidden sm:inline">Pour ton foyer&nbsp;:&nbsp;</span>
          <span className="truncate inline sm:hidden">Foyer&nbsp;:&nbsp;</span>
          <span className="financial-value whitespace-nowrap flex-shrink-0">
            {fmt(detail.ajuste)}/m
          </span>
        </Badge>
        <InfoTip
          text={`Cible ajustée pour ton foyer : ${fmt(detail.ajuste)}/mois (saisi : ${fmt(detail.brut)}/mois)`}
          content={<FoyerExplanation detail={detail} />}
        />
      </span>
    )
  }

  // variant === 'detailed'
  return (
    <div
      className={`bg-surface-2 border border-border rounded-lg p-3.5 space-y-2 ${className ?? ''}`}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest">Cible (saisie)</p>
          <p className="text-sm text-primary font-medium financial-value">{fmt(detail.brut)}/mois</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted uppercase tracking-widest flex items-center gap-1 justify-end">
            Pour ton foyer
            <Badge variant="success" className="text-[9px] px-1.5 py-0">ajusté</Badge>
          </p>
          <p className="text-base text-accent font-semibold financial-value">{fmt(detail.ajuste)}/mois</p>
        </div>
      </div>
      <ul className="space-y-1 text-xs text-secondary pt-2 border-t border-border">
        {detail.raisons.map((r) => (
          <li key={r.label} className="flex items-baseline gap-2">
            <span className="text-accent financial-value font-medium whitespace-nowrap">
              +{fmt(r.montant)}/mois
            </span>
            <span className="leading-relaxed">{r.label}</span>
          </li>
        ))}
      </ul>
      {detail.hasCoupleBonus && (
        <p className="text-[11px] text-muted leading-relaxed pt-1.5 border-t border-border">
          <Info size={10} className="inline mr-1 align-baseline" />
          <Link
            href="/profil"
            className="underline hover:text-accent transition-colors"
          >
            Renseigne le revenu de ton conjoint
          </Link>{' '}
          pour affiner ta cible.
        </p>
      )}
    </div>
  )
}
