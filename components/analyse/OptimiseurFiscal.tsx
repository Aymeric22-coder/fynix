/**
 * Optimiseur fiscal — section /analyse onglet "Optimisation fiscale".
 *
 * Affiche les 8 opportunités fiscales chiffrées en € pour l'utilisateur,
 * triées applicables d'abord + par priorité. Calculs 100 % client via
 * lib/analyse/optimiseurFiscal.ts.
 *
 * Composé de 3 blocs :
 *   1. Hero "Économies potentielles : X €/an"
 *   2. Profil fiscal résumé (TMI + enveloppes + régimes immo)
 *   3. Grille des 8 opportunités (applicables en premier, non applicables grisées)
 *   4. Disclaimer fiscal obligatoire
 */
'use client'

import { useMemo } from 'react'
import {
  Sparkles, Wallet, Building2, PiggyBank, FileWarning, Users,
  Check, X, Scale, ArrowRight, Coins,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import {
  calculerOpportunitesFiscales,
  type OpportuniteFiscale, type ProfilFiscal,
  type CategorieOpportunite, type EffortOpportunite,
} from '@/lib/analyse/optimiseurFiscal'
import { formatCurrency } from '@/lib/utils/format'
import { Badge } from '@/components/ui/badge'
import type { PatrimoineComplet } from '@/types/analyse'

interface Props {
  patrimoine: PatrimoineComplet
}

const CATEGORIE_ICON: Record<CategorieOpportunite, LucideIcon> = {
  enveloppe: Wallet,
  immo:      Building2,
  per:       PiggyBank,
  deficit:   FileWarning,
  holding:   Users,
}

const PRIORITE_LABEL: Record<1 | 2 | 3, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
  1: { label: '🔴 Urgent',     tone: 'danger' },
  2: { label: '🟠 Important',  tone: 'warning' },
  3: { label: '🟡 À étudier',  tone: 'info' },
}

const EFFORT_LABEL: Record<EffortOpportunite, string> = {
  faible: 'Effort faible',
  moyen:  'Effort moyen',
  eleve:  'Effort élevé',
}

export function OptimiseurFiscal({ patrimoine }: Props) {
  const fi  = patrimoine.fireInputs
  const tmi = fi.tmi_rate

  // useMemo TOUJOURS appelé avant tout return conditionnel (rules of hooks).
  const result = useMemo(() => calculerOpportunitesFiscales({ patrimoine }), [patrimoine])

  // Profil incomplet → CTA vers /profil
  if (tmi === null || tmi === undefined) {
    return (
      <div className="card p-6 border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface">
        <div className="flex items-start gap-3 mb-3">
          <div className="rounded-full bg-accent/20 p-2.5">
            <Scale size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-primary">Optimiseur fiscal</h2>
            <p className="text-sm text-secondary mt-0.5">
              Complétez votre profil pour débloquer l&apos;analyse fiscale personnalisée.
            </p>
          </div>
        </div>
        <p className="text-xs text-secondary leading-relaxed mb-4">
          Pour calculer vos opportunités fiscales (PEA, PER, déficit foncier, démembrement…),
          FIRECORE a besoin de votre tranche marginale d&apos;imposition (TMI), des enveloppes que vous
          détenez et des régimes fiscaux de vos biens immobiliers.
        </p>
        <Link
          href="/profil"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Compléter mon profil
          <ArrowRight size={14} />
        </Link>
      </div>
    )
  }

  const applicables    = result.opportunites.filter((o) => o.applicable)
  const nonApplicables = result.opportunites.filter((o) => !o.applicable)

  return (
    <div className="space-y-5">
      {/* ─── Hero : économies potentielles ─── */}
      <section className="card p-6 border-accent/30 bg-gradient-to-br from-accent/10 via-surface to-surface relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-accent/5 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-accent/20 p-2.5">
                <Scale size={20} className="text-accent" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-primary">Optimiseur fiscal</h2>
                <p className="text-xs text-secondary mt-0.5">
                  Opportunités identifiées selon votre situation
                </p>
              </div>
            </div>
            {applicables.length > 0 && (
              <Badge variant="success">
                {applicables.length} opportunité{applicables.length > 1 ? 's' : ''} détectée{applicables.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {/* Économies potentielles */}
          <div className="mt-3">
            <p className="text-xs text-secondary uppercase tracking-widest">Économies potentielles</p>
            <p className="text-3xl sm:text-4xl font-bold text-accent financial-value mt-1">
              {formatCurrency(result.gain_total_estime_annuel, 'EUR', { decimals: 0 })}
              <span className="text-base text-secondary font-medium ml-1.5">/an</span>
            </p>
            <p className="text-xs text-muted mt-1.5">
              soit{' '}
              <span className="text-primary financial-value font-medium">
                {formatCurrency(result.gain_total_estime_5ans, 'EUR', { decimals: 0 })}
              </span>
              {' '}sur 5 ans, en additionnant toutes les opportunités applicables
            </p>
          </div>
        </div>
      </section>

      {/* ─── Profil fiscal résumé ─── */}
      <ProfilFiscalCard profil={result.profil_fiscal} />

      {/* ─── Opportunités applicables ─── */}
      {applicables.length > 0 && (
        <section>
          <h3 className="text-xs text-secondary uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Sparkles size={11} className="text-accent" />
            Opportunités applicables ({applicables.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {applicables.map((opp) => (
              <OpportuniteCard key={opp.id} opp={opp} />
            ))}
          </div>
        </section>
      )}

      {/* ─── Opportunités non applicables ─── */}
      {nonApplicables.length > 0 && (
        <section>
          <h3 className="text-xs text-secondary uppercase tracking-widest mb-3">
            Non applicables actuellement ({nonApplicables.length})
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {nonApplicables.map((opp) => (
              <OpportuniteCard key={opp.id} opp={opp} grayedOut />
            ))}
          </div>
        </section>
      )}

      {/* ─── Disclaimer fiscal ─── */}
      <div className="card p-4 border-l-4 border-l-warning bg-warning/5">
        <div className="flex items-start gap-2">
          <span className="text-base shrink-0" aria-hidden>⚖️</span>
          <p className="text-xs text-secondary leading-relaxed">
            Ces estimations sont indicatives et basées sur les données renseignées dans FIRECORE.
            <strong className="text-primary"> Consultez un conseiller fiscal ou un expert-comptable</strong>
            {' '}avant toute décision d&apos;optimisation. La fiscalité française évolue chaque année et
            les seuils, taux et plafonds mentionnés peuvent changer. Cet outil ne constitue pas un
            conseil fiscal au sens de la réglementation et ne se substitue pas à un avis professionnel.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Profil fiscal résumé
// ─────────────────────────────────────────────────────────────────

function ProfilFiscalCard({ profil }: { profil: ProfilFiscal }) {
  return (
    <section className="card p-5">
      <h3 className="text-xs text-secondary uppercase tracking-widest mb-3">Votre profil fiscal</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="TMI"
          value={`${profil.tmi_pct} %`}
          sub="Tranche marginale"
        />
        <Kpi
          label="Revenus fonciers"
          value={formatCurrency(profil.revenus_fonciers_annuels, 'EUR', { compact: true })}
          sub="annuels (loyers bruts)"
        />
        <Kpi
          label="Revenus CTO estimés"
          value={formatCurrency(profil.revenus_cto_annuels, 'EUR', { compact: true })}
          sub="dividendes annuels"
        />
        <Kpi
          label="Capacité PER"
          value={formatCurrency(profil.capacite_per_annuelle, 'EUR', { compact: true })}
          sub="disponible/an"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-secondary mb-1.5">Enveloppes ouvertes</p>
          <div className="flex flex-wrap gap-1.5">
            {profil.enveloppes_ouvertes.length > 0
              ? profil.enveloppes_ouvertes.map((e) => (
                  <Badge key={e} variant="success">{e}</Badge>
                ))
              : <span className="text-xs text-muted italic">Aucune enveloppe déclarée</span>}
          </div>
        </div>
        <div>
          <p className="text-xs text-secondary mb-1.5">Enveloppes manquantes</p>
          <div className="flex flex-wrap gap-1.5">
            {profil.enveloppes_manquantes.length > 0
              ? profil.enveloppes_manquantes.map((e) => (
                  <Badge key={e} variant="muted">{e}</Badge>
                ))
              : <span className="text-xs text-accent">✓ Toutes les enveloppes courantes sont ouvertes</span>}
          </div>
        </div>
      </div>

      {profil.regime_immo_actuel.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-secondary mb-1.5">Régimes immo actifs</p>
          <div className="flex flex-wrap gap-1.5">
            {profil.regime_immo_actuel.map((r) => (
              <Badge key={r} variant="muted">{r}</Badge>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3">
      <p className="text-[10px] text-secondary uppercase tracking-widest">{label}</p>
      <p className="text-base font-semibold financial-value text-primary mt-1.5">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Carte d'opportunité
// ─────────────────────────────────────────────────────────────────

function OpportuniteCard({ opp, grayedOut }: { opp: OpportuniteFiscale; grayedOut?: boolean }) {
  const Icon = CATEGORIE_ICON[opp.categorie]
  const prio = PRIORITE_LABEL[opp.priorite]

  return (
    <article className={`card p-5 ${grayedOut ? 'opacity-60' : ''} ${opp.applicable ? 'border-accent/15' : ''}`}>
      {/* Header : icône + titre + badge priorité */}
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={14} className={opp.applicable ? 'text-accent shrink-0' : 'text-muted shrink-0'} />
          <h4 className="text-sm font-semibold text-primary truncate">{opp.titre}</h4>
        </div>
        {opp.applicable && <Badge variant={prio.tone}>{prio.label}</Badge>}
      </div>

      {/* Gain en grand si applicable */}
      {opp.applicable ? (
        <div className="mb-3">
          <p className="text-2xl font-bold text-accent financial-value">
            {formatCurrency(opp.gain_annuel_eur, 'EUR', { decimals: 0 })}
            <span className="text-xs text-secondary font-medium ml-1">/an</span>
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted mt-0.5">
            <span className="inline-flex items-center gap-1">
              <Coins size={10} />
              {formatCurrency(opp.gain_5ans_eur, 'EUR', { decimals: 0 })} sur 5 ans
            </span>
            <span className="text-secondary">·</span>
            <span>{EFFORT_LABEL[opp.effort]}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-warning italic mb-3 leading-relaxed">
          {opp.raison_non_applicable ?? 'Non applicable à votre situation.'}
        </p>
      )}

      {/* Description */}
      <p className="text-xs text-secondary leading-relaxed mb-3">{opp.description}</p>

      {/* Action concrète */}
      {opp.applicable && (
        <div className="bg-bg/40 border border-border rounded-md px-3 py-2 mt-2">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Action concrète</p>
          <p className="text-xs text-primary leading-relaxed">{opp.action_concrete}</p>
        </div>
      )}

      {/* Conditions */}
      {opp.conditions.length > 0 && opp.applicable && (
        <ul className="mt-3 space-y-1">
          {opp.conditions.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted">
              <Check size={10} className="text-accent shrink-0 mt-0.5" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {!opp.applicable && opp.conditions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {opp.conditions.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted">
              <X size={10} className="text-muted shrink-0 mt-0.5" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
