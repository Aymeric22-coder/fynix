/**
 * QW7 — Avatar profil VIVANT pendant le wizard (Phase 6 Engagement).
 *
 * Reçoit l'état COURANT du wizard form (partial). Affiche progressivement
 * les sections au fur et à mesure que l'utilisateur remplit. Pas de
 * placeholder « — » : une section soit existe, soit est masquée.
 *
 * Décision (a) actée pour les métriques partielles : on n'appelle PAS
 * `computeProfileMetrics` (qui présume un profil complet et peut produire
 * du NaN ou de mauvais chiffres sur des données partielles). On utilise
 * directement les helpers atomiques de `lib/profil/calculs.ts`
 * (`savingsRate`, `quizScore`, `riskScore`) et on encapsule la dérivation
 * dans `computeLiveMetrics` (pure, testable, colocalisée).
 *
 * Architecture mobile-ready : aucune dépendance au DOM du parent
 * `ProfilQuestionnaire` — le composant se monte en isolation (testable
 * dans un <Sheet> drawer mobile sans refacto).
 *
 * Animation : `animate-in fade-in slide-in-from-right` sur le wrapper
 * extérieur de chaque section. Quand une section change de valeur (mais
 * était déjà visible), pas d'animation (le `key` reste stable).
 */
'use client'

import { useMemo } from 'react'
import { User as UserIcon, Flame, Award, Target, Briefcase, Wallet, Sparkles } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import {
  savingsRate, quizScore, riskScore,
  QUIZ_BOURSE, QUIZ_CRYPTO, QUIZ_IMMO,
  FIRE_TYPES,
} from '@/lib/profil/calculs'
import type { QuestionnaireValues } from './questionnaire-types'
import type { LifeEventDraft } from './lifeEventsDraft'
import { LIFE_EVENT_LABELS, LIFE_EVENT_EMOJI } from '@/lib/profil/lifeEventsConstants'

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface LiveQuizSummary {
  domain:    'bourse' | 'crypto' | 'immo'
  label:     string
  icon:      string
  // 'self_expert' = chip Expert auto-déclaré (CS3 R5), pas de score chiffré.
  // 'partial'     = au moins une question répondue, score sur réponses données.
  state:     'self_expert' | 'partial' | 'complete'
  correct?:  number
  total?:    number
}

export interface LiveMetrics {
  hasAnyData:   boolean
  hasIdentity:  boolean
  identity: {
    prenom:   string | null
    age:      number | null
    subtitle: string
  }
  hasCashflow:  boolean
  cashflow: {
    revenus:     number
    charges:     number
    epargne:     number
    savingsPct:  number
  }
  hasFiscalite: boolean
  fiscalite: {
    tmiLabel:    string
  }
  hasEnveloppes: boolean
  envelopeLabels: ReadonlyArray<string>
  hasSavoirs:   boolean
  savoirs:      ReadonlyArray<LiveQuizSummary>
  hasRisque:    boolean
  risque: {
    score:  number
    label:  string
    tone:   'danger' | 'warning' | 'info' | 'success'
  }
  hasFire:      boolean
  fire: {
    typeName:        string | null
    cibleMensuelle:  number | null
    ageCible:        number | null
  }
  hasLifeEvents: boolean
  lifeEventsActifs: ReadonlyArray<{ id: string; label: string; emoji: string }>
}

// ────────────────────────────────────────────────────────────────────
// Helper pur — colocalisé pour tests
// ────────────────────────────────────────────────────────────────────

const RISK_LABEL: Record<LiveMetrics['risque']['tone'], string> = {
  danger:  'Prudent',
  warning: 'Modéré',
  info:    'Dynamique',
  success: 'Audacieux',
}

function riskToneFromScore(score: number): LiveMetrics['risque']['tone'] {
  if (score < 30) return 'danger'
  if (score < 55) return 'warning'
  if (score < 80) return 'info'
  return 'success'
}

function tmiToLabel(tmi: number | null | undefined): string {
  if (tmi === null || tmi === undefined) return 'Non renseignée (≈ 30 %)'
  return `${tmi} %`
}

function summarizeQuiz(
  domain:    'bourse' | 'crypto' | 'immo',
  label:     string,
  icon:      string,
  answers:   ReadonlyArray<number | null | undefined> | null | undefined,
  selfDeclared: ReadonlyArray<string> | null | undefined,
  quizDef:   typeof QUIZ_BOURSE,
): LiveQuizSummary | null {
  if (selfDeclared?.includes(domain)) {
    return { domain, label, icon, state: 'self_expert' }
  }
  const a = answers ?? []
  const answered = a.filter((x) => typeof x === 'number' && x !== -1).length
  if (answered === 0) return null
  const correct = quizScore(a, quizDef)
  const total   = quizDef.length
  return {
    domain, label, icon,
    state:   answered === total ? 'complete' : 'partial',
    correct, total,
  }
}

export function computeLiveMetrics(
  v:          QuestionnaireValues,
  lifeEvents: ReadonlyArray<LifeEventDraft>,
): LiveMetrics {
  // Identité
  const hasIdentity = !!(v.prenom || v.age || v.situation_familiale || v.statut_pro)
  const subtitleParts = [
    v.statut_pro,
    v.situation_familiale,
    v.age ? `${v.age} ans` : null,
  ].filter(Boolean) as string[]

  // Cashflow
  const revenus = (v.revenu_mensuel ?? 0) + (v.revenu_conjoint ?? 0) + (v.autres_revenus ?? 0)
  const charges = (v.loyer ?? 0) + (v.autres_credits ?? 0) + (v.charges_fixes ?? 0) + (v.depenses_courantes ?? 0)
  const epargne = v.epargne_mensuelle ?? 0
  const hasCashflow = revenus > 0 || charges > 0 || epargne > 0
  const savingsPct = revenus > 0 ? savingsRate(epargne, revenus) : 0

  // Fiscalité
  const hasFiscalite = v.tmi_rate !== null && v.tmi_rate !== undefined

  // Enveloppes
  const envelopeLabels = (v.enveloppes ?? []).filter((e) => e !== 'Aucune')
  const hasEnveloppes  = envelopeLabels.length > 0

  // Savoirs (3 quiz lignes)
  const savoirsList: LiveQuizSummary[] = []
  const sd = v.quiz_self_declared_domains
  const b = summarizeQuiz('bourse', 'Bourse', '📊', v.quiz_bourse, sd, QUIZ_BOURSE)
  const c = summarizeQuiz('crypto', 'Crypto', '₿',  v.quiz_crypto, sd, QUIZ_CRYPTO)
  const i = summarizeQuiz('immo',   'Immo',   '🏠', v.quiz_immo,   sd, QUIZ_IMMO)
  if (b) savoirsList.push(b)
  if (c) savoirsList.push(c)
  if (i) savoirsList.push(i)
  const hasSavoirs = savoirsList.length > 0

  // Risque
  const r = riskScore({
    risk_1: v.risk_1 ?? undefined,
    risk_2: v.risk_2 ?? undefined,
    risk_3: v.risk_3 ?? undefined,
    risk_4: v.risk_4 ?? undefined,
  })
  // riskScore retombe sur 50 par défaut — on ne considère "hasRisque" que si
  // au moins une question est répondue (sinon on aurait toujours 50/Modéré).
  const hasRisque = !!(v.risk_1 || v.risk_2 || v.risk_3 || v.risk_4)
  const riskTone  = riskToneFromScore(r)

  // FIRE
  const hasFire = !!(v.fire_type || v.revenu_passif_cible || v.age_cible)
  const fireTypeName = v.fire_type
    ? (FIRE_TYPES.find((f) => f.id === v.fire_type || f.name === v.fire_type)?.name ?? v.fire_type)
    : null

  // Life events actifs
  const lifeEventsActifs = lifeEvents
    .filter((e) => e.is_active)
    .map((e) => ({
      id:    e.id ?? `${e.type}-${e.occurrence_date}`,
      label: e.label ?? LIFE_EVENT_LABELS[e.type],
      emoji: LIFE_EVENT_EMOJI[e.type],
    }))
  const hasLifeEvents = lifeEventsActifs.length > 0

  const hasAnyData = hasIdentity || hasCashflow || hasFiscalite || hasEnveloppes
                  || hasSavoirs  || hasRisque   || hasFire      || hasLifeEvents

  return {
    hasAnyData,
    hasIdentity,
    identity:    { prenom: v.prenom, age: v.age, subtitle: subtitleParts.join(' · ') },
    hasCashflow,
    cashflow:    { revenus, charges, epargne, savingsPct },
    hasFiscalite,
    fiscalite:   { tmiLabel: tmiToLabel(v.tmi_rate) },
    hasEnveloppes,
    envelopeLabels,
    hasSavoirs,
    savoirs:     savoirsList,
    hasRisque,
    risque:      { score: r, label: RISK_LABEL[riskTone], tone: riskTone },
    hasFire,
    fire:        {
      typeName:       fireTypeName,
      cibleMensuelle: v.revenu_passif_cible ?? null,
      ageCible:       v.age_cible ?? null,
    },
    hasLifeEvents,
    lifeEventsActifs,
  }
}

// ────────────────────────────────────────────────────────────────────
// Composant
// ────────────────────────────────────────────────────────────────────

interface Props {
  values:     QuestionnaireValues
  lifeEvents: ReadonlyArray<LifeEventDraft>
}

export function LiveAvatarCard({ values, lifeEvents }: Props) {
  const m = useMemo(() => computeLiveMetrics(values, lifeEvents), [values, lifeEvents])

  return (
    <aside
      data-testid="live-avatar-card"
      className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-500"
    >
      {/* ── Header (toujours visible — sert d'ancre visuelle) ── */}
      <div className="card p-4">
        <p className="text-[10px] text-secondary uppercase tracking-widest mb-2">
          Ton profil en construction
        </p>
        {m.hasIdentity ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-2 border-2 border-accent/40 flex items-center justify-center">
              <UserIcon size={18} className="text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary truncate">
                {m.identity.prenom ?? 'Toi'}
              </p>
              {m.identity.subtitle && (
                <p className="text-xs text-secondary truncate">{m.identity.subtitle}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted leading-relaxed">
            Les sections apparaîtront au fil de tes réponses.
          </p>
        )}
      </div>

      {/* ── Cashflow ── */}
      {m.hasCashflow && (
        <Section icon={<Wallet size={14} className="text-accent" />} title="Aujourd'hui">
          <MiniKvRow label="Revenus"    value={formatCurrency(m.cashflow.revenus, 'EUR', { decimals: 0 })} />
          <MiniKvRow label="Charges"    value={formatCurrency(m.cashflow.charges, 'EUR', { decimals: 0 })} />
          <MiniKvRow
            label="Épargne"
            value={formatCurrency(m.cashflow.epargne, 'EUR', { decimals: 0 })}
            sub={m.cashflow.revenus > 0 ? `${m.cashflow.savingsPct}% des revenus` : undefined}
            accent
          />
        </Section>
      )}

      {/* ── Fiscalité (TMI) ── */}
      {m.hasFiscalite && (
        <Section icon={<Briefcase size={14} className="text-secondary" />} title="Fiscalité">
          <MiniKvRow label="TMI" value={m.fiscalite.tmiLabel} />
        </Section>
      )}

      {/* ── Enveloppes ── */}
      {m.hasEnveloppes && (
        <Section icon={<Sparkles size={14} className="text-accent" />} title="Enveloppes">
          <div className="flex flex-wrap gap-1.5">
            {m.envelopeLabels.map((e) => (
              <span
                key={e}
                className="px-2 py-0.5 rounded-full text-[10px] border border-accent/30 bg-accent-muted text-accent whitespace-nowrap"
              >
                {e}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* ── Savoirs (quiz) ── */}
      {m.hasSavoirs && (
        <Section icon={<Award size={14} className="text-accent" />} title="Tes savoirs">
          {m.savoirs.map((s) => (
            <div key={s.domain} className="flex items-center justify-between gap-2 py-1">
              <span className="text-xs text-primary flex items-center gap-1.5">
                <span aria-hidden>{s.icon}</span> {s.label}
              </span>
              {s.state === 'self_expert' ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-accent/40 bg-accent-muted text-accent uppercase tracking-wider">
                  Expert auto-déclaré
                </span>
              ) : (
                <span className="text-[11px] text-muted financial-value">
                  {s.correct}/{s.total}{s.state === 'partial' ? ' (en cours)' : ''}
                </span>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ── Risque ── */}
      {m.hasRisque && (
        <Section icon={<Target size={14} className="text-secondary" />} title="Profil de risque">
          <MiniKvRow label="Type" value={m.risque.label} accent />
          <div className="h-1 bg-border rounded overflow-hidden mt-2">
            <div
              className={
                'h-full rounded transition-all duration-500 ' +
                (m.risque.tone === 'success' ? 'bg-accent' :
                 m.risque.tone === 'info'    ? 'bg-blue-400' :
                 m.risque.tone === 'warning' ? 'bg-warning' : 'bg-danger')
              }
              style={{ width: `${m.risque.score}%` }}
            />
          </div>
        </Section>
      )}

      {/* ── FIRE ── */}
      {m.hasFire && (
        <Section icon={<Flame size={14} className="text-accent" />} title="Ta cible FIRE">
          {m.fire.typeName && <MiniKvRow label="Type" value={m.fire.typeName} accent />}
          {m.fire.cibleMensuelle !== null && (
            <MiniKvRow
              label="Revenu cible"
              value={`${formatCurrency(m.fire.cibleMensuelle, 'EUR', { decimals: 0 })}/m`}
            />
          )}
          {m.fire.ageCible !== null && (
            <MiniKvRow label="Âge cible" value={`${m.fire.ageCible} ans`} />
          )}
        </Section>
      )}

      {/* ── Projets de vie (CS5) ── */}
      {m.hasLifeEvents && (
        <Section icon={<Sparkles size={14} className="text-accent" />} title="Tes projets">
          <div className="space-y-1">
            {m.lifeEventsActifs.map((e) => (
              <div key={e.id} className="text-xs text-secondary">
                <span aria-hidden className="mr-1.5">{e.emoji}</span>
                {e.label}
              </div>
            ))}
          </div>
        </Section>
      )}
    </aside>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sous-composants internes
// ────────────────────────────────────────────────────────────────────

function Section(props: {
  icon:     React.ReactNode
  title:    string
  children: React.ReactNode
}) {
  return (
    <div className="card p-4 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="flex items-center gap-2 mb-3">
        {props.icon}
        <p className="text-[10px] text-secondary uppercase tracking-widest font-medium">
          {props.title}
        </p>
      </div>
      <div className="space-y-1">{props.children}</div>
    </div>
  )
}

function MiniKvRow(props: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-secondary truncate">{props.label}</span>
      <div className="text-right">
        <span className={
          'text-xs font-medium financial-value ' +
          (props.accent ? 'text-accent' : 'text-primary')
        }>
          {props.value}
        </span>
        {props.sub && (
          <p className="text-[10px] text-muted leading-tight">{props.sub}</p>
        )}
      </div>
    </div>
  )
}
