/**
 * Carte de profil affichée quand le questionnaire est rempli.
 *
 * Composée de 4 blocs :
 *  1. Hero : avatar + nom + statut + badge profil + 3 KPIs (investi/an,
 *     taux d'épargne, épargne/mois).
 *  2. Triptyque : Score global (anneau), Profil de risque (jauge), Objectif FIRE.
 *  3. Duo : Résultats des 3 quiz + Axes d'amélioration + Cash flow mensuel.
 *  4. Bouton « Modifier mon profil ».
 *
 * Le calcul de toutes les métriques est délégué à `computeProfileMetrics`
 * (lib/profil/calculs.ts) — la carte ne contient AUCUNE logique métier.
 */
'use client'

import { Edit3, User as UserIcon, Flame, Target, Hourglass, Calendar, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'
import { computeProfileMetrics, FIRE_TYPES } from '@/lib/profil/calculs'
import { ScoreRing } from './ScoreRing'
import { GaugeArc } from './GaugeArc'
import type { Profile } from '@/types/database.types'

interface Props {
  profile:  Profile
  onEdit:   () => void
}

const TONE_BG: Record<'success' | 'warning' | 'info' | 'danger', string> = {
  success: 'bg-accent-muted text-accent',
  warning: 'bg-warning-muted text-warning',
  info:    'bg-blue-500/10 text-blue-400',
  danger:  'bg-danger-muted text-danger',
}

export function ProfilCard({ profile, onEdit }: Props) {
  const m = computeProfileMetrics(profile)
  const fireDef = FIRE_TYPES.find((f) => f.id === profile.fire_type)

  const subtitleParts = [
    profile.statut_pro,
    profile.situation_familiale,
    profile.age ? `${profile.age} ans` : null,
  ].filter(Boolean)

  return (
    <div className="max-w-4xl mx-auto space-y-3 animate-[fadeUp_.6s_ease_forwards]">
      {/* ─────── 1. HERO ─────── */}
      <div className="card p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-accent/5 blur-2xl pointer-events-none" />
        <div className="flex items-start justify-between gap-4 flex-wrap relative">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-surface-2 border-2 border-accent/40 flex items-center justify-center">
              <UserIcon size={24} className="text-secondary" />
            </div>
            <div>
              <p className="text-xl font-semibold text-primary">{profile.prenom ?? 'Investisseur'}</p>
              <p className="text-xs text-secondary mt-0.5">{subtitleParts.join(' · ') || '—'}</p>
            </div>
          </div>
          <Badge variant="success" className="uppercase tracking-widest">{m.profileType}</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden mt-6">
          <Kpi label="Investi / an"   value={formatCurrency(m.epargne * 12, 'EUR', { decimals: 0 })} accent />
          <Kpi label="Taux d'épargne" value={`${m.savingsRatePct}%`} accent />
          <Kpi label="Épargne / mois" value={formatCurrency(m.epargne, 'EUR', { decimals: 0 })} />
        </div>
      </div>

      {/* ─────── 2. TRIPTYQUE — Score / Risque / FIRE ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="card p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-secondary uppercase tracking-widest mb-4">Score investisseur</p>
          <ScoreRing score={m.globalPct} />
        </div>

        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest mb-4">Profil de risque</p>
          <GaugeArc pct={m.riskPct} tone={m.riskLabel.tone} label={m.riskLabel.label} />
        </div>

        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest mb-4">Objectif FIRE</p>
          <ul className="space-y-3">
            <FireLine icon={<Flame size={14} className="text-accent" />}     label="Type"       value={fireDef?.name ?? '—'} accent />
            <FireLine icon={<Target size={14} className="text-secondary" />} label="Cible"      value={formatCurrency(m.fireTargetCapital, 'EUR', { decimals: 0 })} />
            <FireLine icon={<Hourglass size={14} className="text-accent" />} label="Estimation" value={m.fireYearsValue >= 99 ? 'N/A' : `${Math.ceil(m.fireYearsValue)} ans`} accent />
            <FireLine icon={<Calendar size={14} className="text-secondary" />} label="Âge FIRE" value={m.fireAge ? `${m.fireAge} ans` : '—'} />
            {profile.priorite && (
              <FireLine icon={<Lightbulb size={14} className="text-secondary" />} label="Priorité" value={profile.priorite} />
            )}
          </ul>
        </div>
      </div>

      {/* ─────── 3. DUO — Quiz + Axes + Cashflow ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Résultats Quiz + Enveloppes */}
        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest mb-4">Résultats quiz de compétences</p>
          <div className="space-y-2.5">
            <QuizResultRow name="Bourse"     icon="📊" correct={m.bourse.correct} total={m.bourse.total} level={m.bourse.level} />
            <QuizResultRow name="Crypto"     icon="₿"  correct={m.crypto.correct} total={m.crypto.total} level={m.crypto.level} />
            <QuizResultRow name="Immobilier" icon="🏠" correct={m.immo.correct}   total={m.immo.total}   level={m.immo.level} />
          </div>
          {(profile.enveloppes ?? []).length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-xs text-secondary uppercase tracking-widest mb-3">Enveloppes ouvertes</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.enveloppes!.map((e) => (
                  <span key={e} className="px-2.5 py-0.5 rounded-full text-xs border border-accent/30 bg-accent-muted text-accent">{e}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Axes + Cashflow */}
        <div className="card p-5">
          <p className="text-xs text-secondary uppercase tracking-widest mb-4">Points clés & axes d&apos;amélioration</p>
          <div className="divide-y divide-border">
            {m.axes.map((a, i) => (
              <div key={i} className="flex items-center gap-2 py-2">
                <span className="text-sm">{a.icon}</span>
                <span className="flex-1 text-xs text-secondary leading-relaxed">{a.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${a.tone === 'good' ? TONE_BG.success : TONE_BG.warning}`}>
                  {a.tone === 'good' ? '✓ Bien' : '⚠ À améliorer'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-secondary uppercase tracking-widest mb-3">Cash flow mensuel</p>
            <CashflowBar name="Revenus" value={m.revenusTotal} max={m.revenusTotal} tone="success" />
            <CashflowBar name="Charges" value={m.chargesTotal} max={m.revenusTotal} tone="danger" />
            <CashflowBar name="Épargne" value={m.epargne}      max={m.revenusTotal} tone="info" />
          </div>
        </div>
      </div>

      {/* ─────── 4. Bouton Modifier ─────── */}
      <div className="pt-2">
        <Button variant="secondary" icon={Edit3} onClick={onEdit}>Modifier mon profil</Button>
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sous-composants internes
// ─────────────────────────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5 text-center">
      <p className={`text-base font-semibold financial-value ${accent ? 'text-accent' : 'text-primary'}`}>{value}</p>
      <p className="text-[10px] text-muted uppercase tracking-widest mt-1">{label}</p>
    </div>
  )
}

function FireLine({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted uppercase tracking-widest">{label}</p>
        <p className={`text-sm font-medium truncate ${accent ? 'text-accent' : 'text-primary'}`}>{value}</p>
      </div>
    </li>
  )
}

function QuizResultRow({
  name, icon, correct, total, level,
}: {
  name: string; icon: string; correct: number; total: number
  level: { label: string; pct: number; tone: 'danger' | 'warning' | 'info' | 'success' }
}) {
  const barColor =
    level.tone === 'success' ? 'bg-accent' :
    level.tone === 'info'    ? 'bg-blue-400' :
    level.tone === 'warning' ? 'bg-warning' :
    'bg-danger'
  const badgeColor = TONE_BG[level.tone]

  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-primary">
          <span>{icon}</span>
          <span>{name}</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
          {level.label}
        </span>
      </div>
      <div className="h-1 bg-border rounded overflow-hidden">
        <div className={`h-full rounded transition-all duration-1000 ${barColor}`} style={{ width: `${level.pct}%` }} />
      </div>
      <p className="text-[10px] text-muted text-right mt-1.5">
        {correct}/{total} bonne{correct > 1 ? 's' : ''} réponse{correct > 1 ? 's' : ''}
      </p>
    </div>
  )
}

function CashflowBar({ name, value, max, tone }: { name: string; value: number; max: number; tone: 'success' | 'danger' | 'info' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const color =
    tone === 'success' ? 'bg-accent' :
    tone === 'danger'  ? 'bg-danger' :
    'bg-blue-400'
  return (
    <div className="flex items-center gap-2 mb-2 last:mb-0">
      <span className="text-xs text-secondary w-16 flex-shrink-0">{name}</span>
      <div className="flex-1 h-1.5 bg-border rounded overflow-hidden">
        <div className={`h-full rounded transition-all duration-1000 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted financial-value w-20 text-right">
        {formatCurrency(value, 'EUR', { decimals: 0 })}
      </span>
    </div>
  )
}
