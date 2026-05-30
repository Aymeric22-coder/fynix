/**
 * Étape 10 — Tes projets de vie (CS5).
 *
 * Capture les évènements de vie utilisés par le moteur de projection FIRE
 * (cf. lib/profil/lifeEvents.ts + table `life_events`). Persiste côté
 * parent via les props `lifeEvents` + `setLifeEvents` — la table n'est
 * sync'ée vers Supabase qu'à la soumission finale du wizard
 * (POST /api/profile/life-events/sync).
 *
 * UX :
 *   - 4 blocs toggle on/off (Retraite, Capital exceptionnel, Achat RP, Naissance)
 *   - 1 seul Capital exceptionnel autorisé en MVP (cf. décision #7)
 *   - Date saisie en MM/AAAA → engine arrondit à l'année la plus proche
 *   - InfoTip pension avec lien info-retraite.fr (décision #1)
 *   - Question 3 options "Es-tu déjà propriétaire ?" pilotant la visibilité
 *     du bloc Achat RP (persistée dans profiles.proprietaire_rp_status)
 *   - Skip naissance si age >= 50 (décision #4) avec override 1-clic
 */
'use client'

import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { Field } from '@/components/ui/field'
import { InfoTip } from '@/components/ui/info-tip'
import type { QuestionnaireValues } from '../questionnaire-types'
import {
  LIFE_EVENT_LABELS,
  LIFE_EVENT_EMOJI,
  CAPITAL_EXCEPTIONNEL_PRESETS,
  INFO_RETRAITE_URL,
  PENSION_TAUX_REMPLACEMENT_FALLBACK,
  NAISSANCE_COUT_MENSUEL_EUR,
  NAISSANCE_DUREE_PRISE_EN_CHARGE_ANS,
  type CapitalExceptionnelPreset,
  type LifeEventType,
  type ProprietaireRpStatus,
} from '@/lib/profil/lifeEventsConstants'
import type { LifeEventDraft } from '../lifeEventsDraft'

interface Props {
  values:         QuestionnaireValues
  set:            <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
  lifeEvents:     LifeEventDraft[]
  setLifeEvents:  (events: LifeEventDraft[]) => void
}

const RP_STATUS_OPTIONS: { value: ProprietaireRpStatus; label: string }[] = [
  { value: 'oui_actuel',    label: 'Oui, déjà propriétaire' },
  { value: 'non_prevu',     label: 'Non, mais c\'est prévu' },
  { value: 'non_pas_prevu', label: 'Non, pas dans mes plans' },
]

const MONTHS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
]

/** Construit une date YYYY-MM-01 (le jour est fixé à 01 en BDD). */
function buildDate(year: number | null, month: number | null): string {
  const y = year ?? new Date().getFullYear() + 1
  const m = (month ?? 1).toString().padStart(2, '0')
  return `${y}-${m}-01`
}

function parseDate(s: string | null): { year: number | null; month: number | null } {
  if (!s) return { year: null, month: null }
  const [y, m] = s.split('-')
  return {
    year:  y ? Number(y) : null,
    month: m ? Number(m) : null,
  }
}

/** Trouve l'évènement actif d'un type donné (1 seul par type en MVP). */
function findEvent(events: LifeEventDraft[], type: LifeEventType): LifeEventDraft | null {
  return events.find((e) => e.type === type) ?? null
}

/** Insère ou remplace un évènement (1 par type — MVP). */
function upsertEvent(events: LifeEventDraft[], next: LifeEventDraft): LifeEventDraft[] {
  const filtered = events.filter((e) => e.type !== next.type)
  return [...filtered, next]
}

/** Supprime tous les évènements d'un type. */
function removeEventsOfType(events: LifeEventDraft[], type: LifeEventType): LifeEventDraft[] {
  return events.filter((e) => e.type !== type)
}

// ────────────────────────────────────────────────────────────────────
// Sous-composant : toggle d'évènement (bloc carte)
// ────────────────────────────────────────────────────────────────────

function EventCard(props: {
  type:      LifeEventType
  active:    boolean
  onToggle:  () => void
  muted?:    boolean
  mutedText?: string
  onUnmute?: () => void
  children:  React.ReactNode
}) {
  const { type, active, onToggle, muted, mutedText, onUnmute, children } = props
  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors',
        muted ? 'border-border bg-surface-2 opacity-70' :
        active ? 'border-accent/40 bg-accent-muted/40' :
                 'border-border bg-surface-2',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">{LIFE_EVENT_EMOJI[type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-medium text-primary">{LIFE_EVENT_LABELS[type]}</p>
            {!muted ? (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={onToggle}
                  className="h-4 w-4 accent-emerald-500 cursor-pointer"
                />
                <span className="text-xs text-secondary">{active ? 'Activé' : 'Désactivé'}</span>
              </label>
            ) : null}
          </div>
          {muted && mutedText && (
            <div className="mt-2">
              <p className="text-xs text-muted leading-relaxed">{mutedText}</p>
              {onUnmute && (
                <button
                  type="button"
                  onClick={onUnmute}
                  className="text-xs text-accent underline hover:text-accent-hover mt-1"
                >
                  Je veux quand même le renseigner
                </button>
              )}
            </div>
          )}
          {active && !muted && (
            <div className="mt-3 space-y-3">{children}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Champs date MM/AAAA réutilisable
// ────────────────────────────────────────────────────────────────────

function DateMonthYearInput(props: {
  date:    string | null
  setDate: (next: string) => void
}) {
  const { date, setDate } = props
  const { year, month } = parseDate(date)
  const currentYear = new Date().getFullYear()
  return (
    <div className="flex items-center gap-2">
      <select
        value={month ?? 1}
        onChange={(e) => setDate(buildDate(year, Number(e.target.value)))}
        className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm text-primary"
        aria-label="Mois"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <input
        type="number"
        min={currentYear}
        max={currentYear + 50}
        value={year ?? ''}
        onChange={(e) => setDate(buildDate(Number(e.target.value), month))}
        placeholder="Année"
        className="bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm text-primary w-24 focus:outline-none focus:border-accent"
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Step 10 component
// ────────────────────────────────────────────────────────────────────

export function Step10({ values, set, lifeEvents, setLifeEvents }: Props) {
  const age = values.age ?? 0
  const naissanceMutedByAge = age >= 50

  // ── Retraite ──────────────────────────────────────────────────────
  const retraiteEvt = findEvent(lifeEvents, 'retraite')
  const toggleRetraite = () => {
    if (retraiteEvt) setLifeEvents(removeEventsOfType(lifeEvents, 'retraite'))
    else setLifeEvents(upsertEvent(lifeEvents, {
      type: 'retraite', is_active: true,
      occurrence_date: buildDate(new Date().getFullYear() + 5, 1),
      montant: null, label: null, meta: {},
    }))
  }

  // ── Capital exceptionnel ──────────────────────────────────────────
  const capitalEvt = findEvent(lifeEvents, 'capital_exceptionnel')
  const toggleCapital = () => {
    if (capitalEvt) setLifeEvents(removeEventsOfType(lifeEvents, 'capital_exceptionnel'))
    else setLifeEvents(upsertEvent(lifeEvents, {
      type: 'capital_exceptionnel', is_active: true,
      occurrence_date: buildDate(new Date().getFullYear() + 5, 1),
      montant: null, label: 'Héritage',
      meta: { preset: 'heritage' },
    }))
  }

  // ── Achat RP ──────────────────────────────────────────────────────
  // Le bloc s'affiche UNIQUEMENT si l'utilisateur a répondu "non_prevu"
  // à la question "Es-tu déjà propriétaire ?". Sinon : question affichée seule.
  const rpStatus = values.proprietaire_rp_status
  const showAchatRp = rpStatus === 'non_prevu'
  const achatRpEvt = findEvent(lifeEvents, 'achat_rp')
  const toggleAchatRp = () => {
    if (achatRpEvt) setLifeEvents(removeEventsOfType(lifeEvents, 'achat_rp'))
    else setLifeEvents(upsertEvent(lifeEvents, {
      type: 'achat_rp', is_active: true,
      occurrence_date: buildDate(new Date().getFullYear() + 3, 1),
      montant: null, label: null,
      meta: { apport: 0, duree_credit_annees: 25 },
    }))
  }
  // Si on change la RP status à oui_actuel/non_pas_prevu, on retire l'evt RP.
  const setRpStatus = (next: ProprietaireRpStatus) => {
    set('proprietaire_rp_status', next)
    if (next !== 'non_prevu' && achatRpEvt) {
      setLifeEvents(removeEventsOfType(lifeEvents, 'achat_rp'))
    }
  }

  // ── Naissance ─────────────────────────────────────────────────────
  const naissanceEvt = findEvent(lifeEvents, 'naissance')
  const toggleNaissance = () => {
    if (naissanceEvt) setLifeEvents(removeEventsOfType(lifeEvents, 'naissance'))
    else setLifeEvents(upsertEvent(lifeEvents, {
      type: 'naissance', is_active: true,
      occurrence_date: buildDate(new Date().getFullYear() + 2, 1),
      montant: null, label: null,
      meta: { nb_enfants: 1 },
    }))
  }

  // Fallback pension affiché en aide
  const pensionFallback = useMemo(() => {
    const r = (values.revenu_mensuel ?? 0) + (values.revenu_conjoint ?? 0) + (values.autres_revenus ?? 0)
    return Math.round(r * PENSION_TAUX_REMPLACEMENT_FALLBACK)
  }, [values.revenu_mensuel, values.revenu_conjoint, values.autres_revenus])

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface-2 p-3.5">
        <p className="text-xs text-secondary leading-relaxed">
          Plus tu nous en dis, plus ta projection FIRE colle à ta réalité.
          Tu peux laisser tous les blocs désactivés — cette étape est optionnelle.
        </p>
      </div>

      {/* ── 1. Retraite ───────────────────────────────────────────── */}
      <EventCard type="retraite" active={!!retraiteEvt} onToggle={toggleRetraite}>
        <Field label="Date prévue (mois / année)">
          <DateMonthYearInput
            date={retraiteEvt?.occurrence_date ?? null}
            setDate={(d) => retraiteEvt && setLifeEvents(upsertEvent(lifeEvents, { ...retraiteEvt, occurrence_date: d }))}
          />
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-1.5">
              Pension mensuelle estimée (€)
              <InfoTip
                text={
                  `Estimation conservative. Si tu ne sais pas, on prendra ${pensionFallback || '50 %'} €/mois ` +
                  `(50 % de tes revenus actuels). Affine via info-retraite.fr / Agirc-Arrco.`
                }
              />
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={20000}
              step={50}
              value={retraiteEvt?.montant ?? ''}
              placeholder={pensionFallback ? `≈ ${pensionFallback}` : '2000'}
              onChange={(e) => {
                const n = e.target.value === '' ? null : Number(e.target.value)
                if (retraiteEvt) setLifeEvents(upsertEvent(lifeEvents, { ...retraiteEvt, montant: n }))
              }}
              className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-primary w-32 focus:outline-none focus:border-accent"
            />
            <a
              href={INFO_RETRAITE_URL}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent underline hover:text-accent-hover"
            >
              info-retraite.fr <ExternalLink size={12} />
            </a>
          </div>
        </Field>
      </EventCard>

      {/* ── 2. Capital exceptionnel ────────────────────────────────── */}
      <EventCard type="capital_exceptionnel" active={!!capitalEvt} onToggle={toggleCapital}>
        <Field label="Catégorie">
          <div className="flex flex-wrap gap-2">
            {CAPITAL_EXCEPTIONNEL_PRESETS.map((p) => {
              const isSelected = (capitalEvt?.meta as { preset?: string } | undefined)?.preset === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    if (!capitalEvt) return
                    setLifeEvents(upsertEvent(lifeEvents, {
                      ...capitalEvt,
                      meta: { ...(capitalEvt.meta ?? {}), preset: p.value as CapitalExceptionnelPreset },
                      label: p.value === 'autre' ? (capitalEvt.label ?? 'Capital exceptionnel') : p.label,
                    }))
                  }}
                  aria-pressed={isSelected}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    isSelected ? 'bg-accent-muted border-accent/30 text-accent' :
                                 'bg-surface-2 border-border text-secondary hover:text-primary',
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          {(capitalEvt?.meta as { preset?: string } | undefined)?.preset === 'autre' && (
            <input
              type="text"
              value={capitalEvt?.label ?? ''}
              placeholder="Précise…"
              onChange={(e) => {
                if (!capitalEvt) return
                setLifeEvents(upsertEvent(lifeEvents, { ...capitalEvt, label: e.target.value }))
              }}
              className="mt-2 bg-surface-2 border border-border rounded-md px-2 py-1.5 text-sm text-primary w-full focus:outline-none focus:border-accent"
            />
          )}
        </Field>
        <Field label="Date prévue (mois / année)">
          <DateMonthYearInput
            date={capitalEvt?.occurrence_date ?? null}
            setDate={(d) => capitalEvt && setLifeEvents(upsertEvent(lifeEvents, { ...capitalEvt, occurrence_date: d }))}
          />
        </Field>
        <Field label="Montant estimé (€)">
          <input
            type="number"
            min={0}
            max={10_000_000}
            step={1000}
            value={capitalEvt?.montant ?? ''}
            placeholder="50000"
            onChange={(e) => {
              const n = e.target.value === '' ? null : Number(e.target.value)
              if (capitalEvt) setLifeEvents(upsertEvent(lifeEvents, { ...capitalEvt, montant: n }))
            }}
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-primary w-40 focus:outline-none focus:border-accent"
          />
        </Field>
      </EventCard>

      {/* ── 3. Achat RP ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <p className="text-sm font-medium text-primary mb-3 flex items-center gap-2">
          <span>{LIFE_EVENT_EMOJI.achat_rp}</span>
          {LIFE_EVENT_LABELS.achat_rp}
        </p>
        <Field label="Es-tu déjà propriétaire de ta résidence principale ?">
          <div className="flex flex-wrap gap-2">
            {RP_STATUS_OPTIONS.map((opt) => {
              const isSelected = rpStatus === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRpStatus(opt.value)}
                  aria-pressed={isSelected}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    isSelected ? 'bg-accent-muted border-accent/30 text-accent' :
                                 'bg-surface-2 border-border text-secondary hover:text-primary',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Field>

        {showAchatRp && (
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!achatRpEvt}
                onChange={toggleAchatRp}
                className="h-4 w-4 accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs text-secondary">Renseigner mon projet d&apos;achat</span>
            </label>

            {achatRpEvt && (
              <>
                <Field label="Date prévue (mois / année)">
                  <DateMonthYearInput
                    date={achatRpEvt.occurrence_date}
                    setDate={(d) => setLifeEvents(upsertEvent(lifeEvents, { ...achatRpEvt, occurrence_date: d }))}
                  />
                </Field>
                <Field label="Prix estimé (€)">
                  <input
                    type="number" min={0} max={5_000_000} step={5000}
                    value={achatRpEvt.montant ?? ''}
                    placeholder="350000"
                    onChange={(e) => {
                      const n = e.target.value === '' ? null : Number(e.target.value)
                      setLifeEvents(upsertEvent(lifeEvents, { ...achatRpEvt, montant: n }))
                    }}
                    className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-primary w-40 focus:outline-none focus:border-accent"
                  />
                </Field>
                <Field label="Apport prévu (€)">
                  <input
                    type="number" min={0} max={5_000_000} step={1000}
                    value={(achatRpEvt.meta as { apport?: number } | undefined)?.apport ?? ''}
                    placeholder="50000"
                    onChange={(e) => {
                      const n = e.target.value === '' ? 0 : Number(e.target.value)
                      setLifeEvents(upsertEvent(lifeEvents, {
                        ...achatRpEvt,
                        meta: { ...(achatRpEvt.meta ?? {}), apport: n },
                      }))
                    }}
                    className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-primary w-40 focus:outline-none focus:border-accent"
                  />
                </Field>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Naissance ──────────────────────────────────────────── */}
      <EventCard
        type="naissance"
        active={!!naissanceEvt}
        onToggle={toggleNaissance}
        muted={naissanceMutedByAge && !naissanceEvt}
        mutedText={naissanceMutedByAge && !naissanceEvt ?
          'Compte tenu de ton âge, on suppose qu\'aucune naissance future n\'est planifiée.' : undefined}
        onUnmute={naissanceMutedByAge && !naissanceEvt ? toggleNaissance : undefined}
      >
        <Field label="Année prévue (mois / année)">
          <DateMonthYearInput
            date={naissanceEvt?.occurrence_date ?? null}
            setDate={(d) => naissanceEvt && setLifeEvents(upsertEvent(lifeEvents, { ...naissanceEvt, occurrence_date: d }))}
          />
        </Field>
        <Field label="Nombre d'enfants">
          <input
            type="number" min={1} max={5} step={1}
            value={(naissanceEvt?.meta as { nb_enfants?: number } | undefined)?.nb_enfants ?? 1}
            onChange={(e) => {
              const n = Math.max(1, Number(e.target.value) || 1)
              if (naissanceEvt) setLifeEvents(upsertEvent(lifeEvents, {
                ...naissanceEvt,
                meta: { ...(naissanceEvt.meta ?? {}), nb_enfants: n },
              }))
            }}
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm text-primary w-20 focus:outline-none focus:border-accent"
          />
        </Field>
        <p className="text-xs text-muted">
          On compte&nbsp;
          <span className="text-primary">{NAISSANCE_COUT_MENSUEL_EUR}&nbsp;€/mois</span>
          &nbsp;de charges supplémentaires par enfant pendant {NAISSANCE_DUREE_PRISE_EN_CHARGE_ANS}&nbsp;ans.
        </p>
      </EventCard>
    </div>
  )
}
