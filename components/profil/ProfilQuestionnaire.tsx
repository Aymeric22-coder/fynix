/**
 * Orchestrateur du questionnaire en N étapes (cf. STEPS).
 *
 * - Maintient le state local des réponses (initialisé depuis le profil
 *   existant en DB si rechargement / modification).
 * - Affiche une barre de progression dorée fine + points de navigation.
 *   Note : on garde l'accent emerald de l'app, pas le gold du mockup.
 * - À la dernière étape, le bouton "Voir mon profil" déclenche la
 *   sauvegarde via `onSubmit` et bascule sur la carte.
 *
 * Tâche B :
 * - Validation réactive : bouton "Continuer" désactivé tant que les
 *   champs obligatoires de l'étape ne sont pas remplis (étapes 1 et 8).
 *   CS1 a ajouté une étape 9 « Ta fiscalité » (skippable).
 * - "Passer cette étape" sur les étapes non-critiques (2, 3, 6, 7).
 * - Persistance intermédiaire via `saveStep` à chaque changement
 *   d'étape, pour permettre la reprise.
 */
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Flame, Info, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/format'
import { STEPS } from '@/lib/profil/calculs'
import { REQUIRED_STEPS, SKIPPABLE_STEPS, missingFields } from '@/lib/profil/wizardValidation'
import {
  computeActivePath, getNextStep, getPrevStep, findSkipReason,
  END, type StepId,
} from '@/lib/profil/routing'
import { getChapterProgress } from '@/lib/profil/chaptersConstants'
import { EMPTY_VALUES, type QuestionnaireValues } from './questionnaire-types'
import type { LifeEventDraft } from './lifeEventsDraft'
import { Step1 } from './steps/Step1'
import { Step2 } from './steps/Step2'
import { Step3 } from './steps/Step3'
import { Step4 } from './steps/Step4'
import { Step5 } from './steps/Step5'
import { Step6 } from './steps/Step6'
import { Step7 } from './steps/Step7'
import { Step8 } from './steps/Step8'
import { Step9 } from './steps/Step9'
import { Step10 } from './steps/Step10'

interface Props {
  initialValues?: Partial<QuestionnaireValues>
  /** Étape à laquelle ouvrir le wizard (par défaut 1). Permet la reprise
   *  après abandon : si l'utilisateur avait validé l'étape 4, on l'ouvre à 5. */
  initialStep?:   number
  onSubmit:       (v: QuestionnaireValues, lifeEvents: LifeEventDraft[]) => Promise<{ error?: string }>
  /** Sauvegarde intermédiaire : appelée à chaque changement d'étape pour
   *  persister la progression. Optionnelle : si absente, pas de save auto. */
  onStepSave?:    (step: number, partial: Partial<QuestionnaireValues>) => Promise<{ error?: string }>
  /** Pour les profils déjà complétés : permet de revenir en arrière. */
  onCancel?:      () => void
  /** CS5 — Évènements de vie pré-chargés depuis la table life_events. */
  initialLifeEvents?: LifeEventDraft[]
}

export function ProfilQuestionnaire({
  initialValues, initialStep = 1, onSubmit, onStepSave, onCancel, initialLifeEvents = [],
}: Props) {
  // CS1 — dernière étape absolue = STEPS.length (9). Inchangé.
  const LAST_STEP = STEPS.length as StepId
  const [step,    setStep]    = useState<StepId>(
    Math.min(LAST_STEP, Math.max(1, initialStep)) as StepId,
  )
  const [values,  setValues]  = useState<QuestionnaireValues>({ ...EMPTY_VALUES, ...initialValues })
  const [lifeEvents, setLifeEvents] = useState<LifeEventDraft[]>(initialLifeEvents)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  /** Vrai si le user a tenté de continuer en laissant des champs vides.
   *  Affiche les messages d'erreur uniquement après cette tentative. */
  const [touched, setTouched] = useState(false)
  /** CS3 — Étapes que l'utilisateur a explicitement choisi de visiter via
   *  le bouton « Je veux quand même y répondre » du skip transparent.
   *  Session-locale (non persistée). Reload = re-propose le skip. */
  const [overrides, setOverrides] = useState<ReadonlySet<StepId>>(new Set())

  function set<K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }))
  }

  // CS3 — Parcours actif recalculé à CHAQUE changement de state. Si
  // l'utilisateur revient cocher une enveloppe crypto, Step 6 réapparaît
  // dans le path au prochain transition.
  const activePath = useMemo(
    () => computeActivePath(values, overrides),
    [values, overrides],
  )
  const positionInPath = Math.max(0, activePath.indexOf(step))   // 0-based
  const lastStepInPath = activePath[activePath.length - 1] ?? LAST_STEP
  const isLastInPath   = step === lastStepInPath

  // CS3 — Skip transparent : si le PROCHAIN step en ordre absolu serait
  // sauté par le moteur, on affiche le message + bouton override sur
  // l'étape COURANTE, juste au-dessus des boutons Continuer/Skip.
  const upcomingSkipped: { step: StepId; reason: string } | null = useMemo(() => {
    for (let s = (step + 1) as number; s <= LAST_STEP; s++) {
      const sid = s as StepId
      const reason = findSkipReason(sid, values, overrides)
      if (reason) return { step: sid, reason }
      // Si pas sauté, on s'arrête : c'est la prochaine étape effective.
      if (!findSkipReason(sid, values, overrides)) break
    }
    return null
  }, [step, values, overrides, LAST_STEP])

  const missing  = missingFields(step, values)
  const stepValid = missing.length === 0
  const canSkip  = SKIPPABLE_STEPS.includes(step)

  async function handleNext() {
    setError(null)

    if (!stepValid) {
      setTouched(true)
      return
    }

    // CS3 — Prochaine étape via le routeur (pas s+1).
    const next = getNextStep(step, values, overrides)

    // Sauvegarde intermédiaire de l'étape complétée (fire & forget : on
    // n'attend pas pour passer à la suite, mais on remonte l'erreur dans
    // le state pour que l'utilisateur sache que sa progression n'est pas
    // garantie — sinon il croit avoir sauve et perd ses donnees au refresh).
    if (onStepSave && next !== END) {
      onStepSave(step, values).then((res) => {
        if (res.error) {
          setError(`Sauvegarde echouee : ${res.error}. Reessaie ou rafraichis la page.`)
        }
      })
    }

    if (next !== END) {
      setStep(next)
      setTouched(false)
      return
    }

    // Dernière étape → submit définitif (marque profile_completed_at)
    setLoading(true)
    const res = await onSubmit(values, lifeEvents)
    setLoading(false)
    if (res.error) { setError(res.error); return }
  }

  async function handleSkip() {
    if (!canSkip) return
    setError(null)
    if (onStepSave) {
      onStepSave(step, values).then((res) => {
        if (res.error) {
          setError(`Sauvegarde echouee : ${res.error}. Reessaie ou rafraichis la page.`)
        }
      })
    }
    // CS3 — Saut explicite suit aussi le parcours actif.
    const next = getNextStep(step, values, overrides)
    if (next !== END) setStep(next)
    setTouched(false)
  }

  /** CS3 — POINT CRITIQUE : Back doit utiliser getPrevStep, PAS s-1.
   *  Sinon l'utilisateur revient sur une étape sautée → confusion. */
  function handleBack() {
    const prev = getPrevStep(step, values, overrides)
    if (prev !== null) setStep(prev)
    setTouched(false)
  }

  /** CS3 — Bouton « Je veux quand même y répondre » sur le skip transparent.
   *  Ajoute l'étape sautée aux overrides session, ce qui la réactive dans
   *  le parcours actif. */
  function handleOverrideSkip(target: StepId) {
    setOverrides((prev) => new Set([...prev, target]))
  }

  /** CS3 — Clic sur un dot (mini-barre de progression). Navigation directe
   *  vers une étape du parcours actif ; si l'étape est actuellement sautée,
   *  cliquer dessus la réactive via override + s'y rend. */
  function handleDotClick(target: StepId) {
    if (target === step) return
    const inPath = activePath.includes(target)
    if (!inPath) {
      // Étape sautée → l'utilisateur veut la voir explicitement.
      setOverrides((prev) => new Set([...prev, target]))
    }
    setStep(target)
    setTouched(false)
  }

  const meta = STEPS[step - 1]!
  // CS10 — header narratif inline : chapitre + sous-titre.
  const chapterProgress = getChapterProgress(step)

  return (
    <div className="max-w-2xl mx-auto">
      {/* CS10 — Header chapitre + barre de progression CS3.
          Le label remplace l'ancien `meta.title` du header (le titre de
          l'étape reste affiché en h2 dans la carte ci-dessous). */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-accent uppercase tracking-widest font-medium transition-colors">
            Chapitre {chapterProgress.chapterIndex + 1} / {chapterProgress.chapterCount}
            <span className="text-secondary"> — </span>
            {chapterProgress.chapter.title}
          </span>
          <span className="text-xs text-muted financial-value">
            {positionInPath + 1} / {activePath.length}
          </span>
        </div>
        <div className="h-0.5 bg-border rounded overflow-hidden">
          <div
            className="h-full bg-accent rounded transition-all duration-500"
            style={{ width: `${((positionInPath + 1) / activePath.length) * 100}%` }}
          />
        </div>
        {/* CS3 — Dots : on garde TOUS les STEPS visibles, mais ceux sautés
            par le moteur (et non override) sont mutés (opacity-40), pour
            que l'utilisateur SACHE qu'ils existent et puisse cliquer. */}
        <div className="flex justify-center gap-1.5 mt-3">
          {STEPS.map((s) => {
            const sid = s.id as StepId
            const isSkipped = !activePath.includes(sid)
            const isCurrent = sid === step
            const isPast    = positionInPath > activePath.indexOf(sid) && !isSkipped
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleDotClick(sid)}
                title={isSkipped
                  ? `${s.title} (sautée — clique pour y aller)`
                  : s.title}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-all cursor-pointer hover:scale-150',
                  isCurrent  ? 'bg-accent scale-150' :
                  isPast     ? 'bg-accent-hover' :
                  isSkipped  ? 'bg-muted opacity-40' :
                               'bg-border',
                )}
              />
            )
          })}
        </div>
      </div>

      {/* CS10 — Subtitle du chapitre : affiché UNIQUEMENT à la 1re étape
          du chapitre, pour faire respirer la transition. Sur les autres
          étapes, on conserve le `meta.sub` de l'étape. */}
      {chapterProgress.isFirstStepInChapter && (
        <div className="mb-5 -mt-3 rounded-lg border border-accent/20 bg-accent-muted/30 p-3.5 animate-in fade-in slide-in-from-top-2 duration-500">
          <p className="text-xs text-secondary leading-relaxed">
            {chapterProgress.chapter.subtitle}
          </p>
        </div>
      )}

      {/* Carte de l'étape courante */}
      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-primary mb-1">{meta.title}</h2>
        <p className="text-sm text-secondary mb-6 leading-relaxed">{meta.sub}</p>

        {/* U10 — Bandeau "profil optionnel" sur la 1re étape */}
        {step === 1 && (
          <div className="text-xs text-secondary border border-border rounded-md p-3 mb-5 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted" />
            <span>
              Ce questionnaire est optionnel.{' '}
              <Link href="/dashboard" className="underline text-accent hover:text-accent-hover">
                Accède au dashboard directement
              </Link>{' '}
              et complète-le plus tard quand tu veux.
            </span>
          </div>
        )}

        {step === 1  && <Step1  values={values} set={set} />}
        {step === 2  && <Step2  values={values} set={set} />}
        {step === 3  && <Step3  values={values} set={set} />}
        {step === 4  && <Step4  values={values} set={set} />}
        {step === 5  && <Step5  values={values} set={set} />}
        {step === 6  && <Step6  values={values} set={set} />}
        {step === 7  && <Step7  values={values} set={set} />}
        {step === 8  && <Step8  values={values} set={set} />}
        {step === 9  && <Step9  values={values} set={set} />}
        {step === 10 && <Step10 values={values} set={set} lifeEvents={lifeEvents} setLifeEvents={setLifeEvents} />}

        {touched && !stepValid && (
          <p className="text-xs text-warning bg-warning-muted px-3 py-2 rounded-lg mt-4">
            Champ{missing.length > 1 ? 's' : ''} requis : {missing.join(', ')}.
          </p>
        )}

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg mt-4">{error}</p>
        )}

        {/* CS3 — Skip transparent : si la prochaine étape va être sautée par
            le moteur, on l'annonce et on offre l'override en bouton secondary
            VISIBLE (pas un lien discret). */}
        {upcomingSkipped && (
          <div className="mt-5 rounded-lg border border-border bg-surface-2 p-3.5 flex items-start gap-3">
            <Info size={16} className="text-accent flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-secondary leading-relaxed">
                On te fait passer l&apos;étape «&nbsp;{STEPS[upcomingSkipped.step - 1]!.title}&nbsp;» :{' '}
                {upcomingSkipped.reason}
              </p>
              <Button
                variant="secondary"
                type="button"
                onClick={() => handleOverrideSkip(upcomingSkipped.step)}
                className="mt-2.5"
              >
                Je veux quand même y répondre
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-7 pt-5 border-t border-border flex-wrap">
          {positionInPath > 0 ? (
            <Button variant="secondary" type="button" icon={ArrowLeft} onClick={handleBack}>
              Retour
            </Button>
          ) : onCancel ? (
            <Button variant="secondary" type="button" onClick={onCancel}>Annuler</Button>
          ) : <div />}

          <div className="ml-auto flex items-center gap-3">
            {canSkip && (
              <Button
                variant="ghost"
                type="button"
                icon={SkipForward}
                onClick={handleSkip}
                title="Sauvegarde les champs déjà remplis et passe à l'étape suivante"
              >
                Passer cette étape
              </Button>
            )}
            <Button
              type="button"
              onClick={handleNext}
              loading={loading}
              icon={isLastInPath ? Flame : ArrowRight}
              disabled={!stepValid && REQUIRED_STEPS.includes(step)}
            >
              {isLastInPath ? 'Voir mon profil' : 'Continuer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
