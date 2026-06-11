/**
 * FIRE Progress Hero — bandeau principal du Dashboard.
 *
 * Affiche en une carte large : barre de progression patrimoine actuel /
 * cible FIRE (revenu_passif_cible × 25), age d'indépendance projeté vs
 * objectif, comparaison revenu passif actuel vs cible, et CTA "augmenter
 * l'épargne" si l'utilisateur est en retard sur sa trajectoire.
 *
 * Composant SERVER (pas de hook, juste affichage) — les données arrivent
 * pré-calculées depuis la page Dashboard.
 *
 * Si le profil est incomplet (pas d'objectif FIRE défini), affiche un CTA
 * vers /profil au lieu de la projection.
 */

import Link from 'next/link'
import { Sparkles, TrendingUp, Target, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { CibleFoyer } from '@/components/profil/CibleFoyer'
import type { CibleFoyerDetail } from '@/lib/profil/cibleFamille'

export interface FireHeroData {
  /** Profil incomplet → on affiche un CTA vers /profil. */
  profileComplete: boolean
  patrimoine_net_actuel:      number
  patrimoine_fire_cible:      number    // revenu_passif_cible × 12 × 25 (indexée inflation)
  age_actuel:                 number | null
  age_fire_cible:             number | null
  /** Scénario médian (rendement central). Null si hors horizon. */
  age_fire_projete:           number | null
  /** Intervalle de confiance (rendement central ±1,5 %). */
  age_fire_optimiste:         number | null
  age_fire_median:            number | null
  age_fire_pessimiste:        number | null
  /** Rendement central appliqué dans la projection (%). */
  rendement_central_pct:      number
  epargne_mensuelle_actuelle: number
  /** Épargne mensuelle qui permettrait d'atteindre l'objectif. Null si déjà OK. */
  epargne_mensuelle_necessaire: number | null
  revenu_passif_actuel:       number    // €/mois
  /** Cible AJUSTÉE composition foyer (QW9). C'est ce qu'on affiche dans
   *  le sub "sur X €/m visés" — cohérent avec patrimoine_fire_cible. */
  revenu_passif_cible:        number    // €/mois
  /** QW9-bis — Détail de l'ajustement foyer. Si !hasAdjustment, le badge
   *  inline n'est pas rendu (composant retourne null). */
  cibleFoyerDetail:           CibleFoyerDetail | null
}

export function FIREProgressHero({ data }: { data: FireHeroData }) {
  // ── Profil incomplet : CTA vers /profil ────────────────────────────
  if (!data.profileComplete) {
    return (
      <section className="card p-6 border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-accent/20 p-2.5">
              <Target size={20} className="text-accent" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary mb-1">Définis ton objectif d&apos;indépendance</h2>
              <p className="text-xs text-secondary max-w-xl leading-relaxed">
                Indique ton âge, ton âge cible d&apos;indépendance financière et ton revenu passif visé
                pour voir ta trajectoire et savoir ce qu&apos;il te reste à parcourir.
              </p>
            </div>
          </div>
          <Link
            href="/profil"
            className="bg-accent hover:bg-accent/90 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap transition-colors"
          >
            Définir mon objectif d&apos;indépendance
          </Link>
        </div>
      </section>
    )
  }

  const pctProgress = data.patrimoine_fire_cible > 0
    ? Math.min(100, (data.patrimoine_net_actuel / data.patrimoine_fire_cible) * 100)
    : 0

  const onTime = data.age_fire_projete !== null
    && data.age_fire_cible !== null
    && data.age_fire_projete <= data.age_fire_cible

  // Intervalle de confiance : "entre Opt et Pess ans (médiane Med)" si les
  // 3 scénarios convergent dans l'horizon, sinon retombe sur le médian.
  const hasInterval = data.age_fire_optimiste !== null
                   && data.age_fire_pessimiste !== null
                   && data.age_fire_projete !== null
  const ageProjeteText = hasInterval
    ? `Entre ${data.age_fire_optimiste} et ${data.age_fire_pessimiste} ans`
    : data.age_fire_projete !== null
      ? `${data.age_fire_projete} ans`
      : 'Hors horizon'

  const ageProjeteSubLabel = hasInterval
    ? `médiane ${data.age_fire_median} ans`
    : null

  const ageCibleText = data.age_fire_cible !== null ? `${data.age_fire_cible} ans` : '—'

  const tooltipHypotheses =
    `Hypothèses de rendement : rendement médian ${data.rendement_central_pct.toFixed(1)} %/an, `
    + `optimiste +1,5 %, pessimiste −1,5 %. Objectif patrimonial indexé sur 2 %/an d'inflation.`

  const deltaEpargne = data.epargne_mensuelle_necessaire !== null
    ? data.epargne_mensuelle_necessaire - data.epargne_mensuelle_actuelle
    : 0

  return (
    <section className="card p-6 border-accent/30 bg-gradient-to-br from-accent/8 via-surface to-surface">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-accent" />
        <h2 className="text-base font-semibold text-primary">Ta trajectoire vers l&apos;indépendance</h2>
      </div>

      {/* Progress bar patrimoine */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs text-secondary">
            Patrimoine net actuel
          </span>
          <span className="text-xs text-accent font-medium financial-value">
            <AnimatedNumber value={pctProgress} decimals={1} suffix=" % de la cible" />
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-accent/70 to-accent rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${pctProgress}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between mt-1.5 text-[11px] text-muted financial-value">
          <span>{formatCurrency(data.patrimoine_net_actuel, 'EUR', { compact: true })}</span>
          <span>
            {formatCurrency(data.patrimoine_fire_cible, 'EUR', { compact: true })} cible
            {/* QW9-bis close-out — Suffixe sobre "· foyer ajusté" quand la
                cible est foyer-ajustée. Même pattern que le `details` du score
                Progression FIRE. Pas de tooltip ni badge — la décomposition
                complète vit sur le badge CibleFoyer plus bas. */}
            {data.cibleFoyerDetail?.hasAdjustment && ' · foyer ajusté'}
          </span>
        </div>
      </div>

      {/* 3 lignes synthèse */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Row
          icon={<TrendingUp size={13} className={onTime ? 'text-accent' : 'text-warning'} />}
          label="Indépendance projetée"
          value={ageProjeteText}
          sub={ageProjeteSubLabel ?? `Objectif : ${ageCibleText}`}
          extraSub={ageProjeteSubLabel ? `Objectif : ${ageCibleText}` : null}
          accent={onTime ? 'success' : 'warning'}
          tooltip={tooltipHypotheses}
        />
        <Row
          icon={<Wallet size={13} className="text-secondary" />}
          label="Revenu passif"
          value={`${formatCurrency(data.revenu_passif_actuel, 'EUR', { decimals: 0 })}/m`}
          sub={`sur ${formatCurrency(data.revenu_passif_cible, 'EUR', { decimals: 0 })}/m visés`}
          // QW9-bis — Badge "Pour ton foyer" + tooltip si ajustement actif.
          // Composant retourne null si !hasAdjustment → aucun bruit visuel
          // pour les profils sans ajustement (la valeur data.revenu_passif_cible
          // est alors == valeur brute saisie, le sub reste cohérent).
          extra={data.cibleFoyerDetail
            ? <CibleFoyer detail={data.cibleFoyerDetail} variant="inline" className="mt-1" />
            : null}
        />
      </div>

      {/* CTA delta épargne si en retard */}
      {!onTime && deltaEpargne > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-warning leading-relaxed">
            <span className="font-medium">Pour atteindre ton objectif à {ageCibleText}</span> : augmente
            ton épargne mensuelle de <span className="financial-value font-semibold">
            +{formatCurrency(deltaEpargne, 'EUR', { decimals: 0 })}/mois
            </span> (actuel : {formatCurrency(data.epargne_mensuelle_actuelle, 'EUR', { decimals: 0 })}/mois).
          </p>
        </div>
      )}
    </section>
  )
}

function Row({ icon, label, value, sub, extraSub, accent, tooltip, extra }: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  extraSub?: string | null
  accent?: 'success' | 'warning'
  tooltip?: string
  /** QW9-bis — slot pour insérer un composant React additionnel sous le sub
   *  (ex. badge CibleFoyer). Rendu uniquement si non-null. */
  extra?: React.ReactNode
}) {
  const color = accent === 'success' ? 'text-accent'
              : accent === 'warning' ? 'text-warning'
              : 'text-primary'
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted uppercase tracking-widest flex items-center gap-1">
          {label}
          {tooltip && (
            <span className="cursor-help select-none" title={tooltip}>ⓘ</span>
          )}
        </p>
        <p className={`text-base font-semibold financial-value ${color}`}>{value}</p>
        <p className="text-[11px] text-muted truncate">{sub}</p>
        {extraSub && <p className="text-[10px] text-muted truncate">{extraSub}</p>}
        {extra}
      </div>
    </div>
  )
}
