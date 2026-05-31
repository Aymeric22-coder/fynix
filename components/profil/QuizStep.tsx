/**
 * Bloc réutilisable pour afficher un quiz (Bourse / Crypto / Immo).
 *
 * Reçoit la définition complète du quiz (depuis lib/profil/calculs.ts)
 * et l'état courant des réponses (tableau d'index ou null). Délègue les
 * mises à jour au parent via `onChange`.
 *
 * Pas de logique de scoring ici — le scoring est calculé à la volée
 * dans la carte de profil via computeProfileMetrics().
 *
 * CS3 R5 — Bouton « Je connais déjà — Expert » :
 *   - Confirmation native window.confirm() pour rester léger.
 *   - Push du domaine dans `quiz_self_declared_domains` (TEXT[] DB).
 *   - Le tableau de réponses quiz_X garde son sentinel [-1,-1,...] (= "non
 *     répondu"), cohérent avec le pattern existant. C'est le boost dans
 *     experienceScore qui prend le relais (~70 % du score Expert).
 *
 * Fix QW10 — Lock du choix au premier clic (calibration honnête) :
 *   Avant ce fix, un user pouvait cliquer une mauvaise réponse, voir la
 *   bonne option highlightée verte + lire la micro-leçon, puis re-cliquer
 *   sur la bonne réponse. Score final = correct → auto-déclaration tacite
 *   d'expert sur le domaine, qui contourne la calibration et le bouton
 *   Expert légitime.
 *   La règle est maintenant : dès qu'une question a reçu une réponse
 *   (quiz_X[i] !== -1, dérivé directement du tableau ; pas de nouveau
 *   state local), elle est verrouillée. Tous ses boutons deviennent
 *   non-cliquables (disabled + aria-disabled + tabIndex=-1) et la micro-
 *   leçon devient permanente. Cohérent avec la reprise wizard : un quiz
 *   déjà répondu en DB s'affiche locked.
 *   Seul un reset profile (POST /api/profile/reset) peut "refaire" un
 *   quiz, comportement existant inchangé.
 */
'use client'

import { useState } from 'react'
import { Award, Check, Lightbulb, X } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { QuizQuestion, ExpertDomain } from '@/lib/profil/calculs'

interface QuizStepProps {
  badge:    string                                 // ex: "Évaluation Bourse"
  quiz:     ReadonlyArray<QuizQuestion>
  answers:  ReadonlyArray<number | null | undefined>
  onChange: (answers: number[]) => void
  /** Variante de couleur du badge. Reste sur les tokens existants. */
  tone?:    'info' | 'success' | 'warning'
  /** CS3 R5 — Domaine du quiz (utilisé pour l'auto-déclaration expert). */
  domain:           ExpertDomain
  /** CS3 R5 — Liste actuelle des domaines auto-déclarés (depuis le state du wizard). */
  selfDeclared:     ReadonlyArray<string>
  /** CS3 R5 — Callback pour push/pull le domaine. */
  onExpertToggle:   (next: string[]) => void
}

const TONE_BADGE: Record<NonNullable<QuizStepProps['tone']>, string> = {
  info:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  success: 'bg-accent-muted text-accent border-accent/30',
  warning: 'bg-warning-muted text-warning border-warning/30',
}

// CS3 R5 — Libellé canonique du domaine pour la confirmation modal.
const DOMAIN_LABELS: Record<ExpertDomain, string> = {
  bourse: 'Bourse',
  crypto: 'Crypto',
  immo:   'Immobilier',
}

export function QuizStep({
  badge, quiz, answers, onChange, tone = 'success',
  domain, selfDeclared, onExpertToggle,
}: QuizStepProps) {
  const isDeclaredExpert = selfDeclared.includes(domain)
  // Consolidation 2 — remplace window.confirm() par <ConfirmDialog>.
  // State local : la modal est triggered au clic « Je connais déjà »
  // quand l'utilisateur n'est pas encore expert auto-déclaré.
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleExpertClick() {
    if (isDeclaredExpert) {
      // Déjà déclaré → retirer immédiatement (revenir au quiz manuel,
      // pas besoin de confirmation pour défaire son propre choix).
      onExpertToggle(selfDeclared.filter((d) => d !== domain))
      return
    }
    // Pas encore expert → ouvrir la modal de confirmation stylée.
    setConfirmOpen(true)
  }

  function confirmExpert() {
    onExpertToggle([...selfDeclared, domain])
  }

  function selectOption(qIndex: number, optIndex: number) {
    // Fix QW10 — Lock : si la question a déjà reçu une réponse (sentinel
    // -1 explicitement filtré), le clic est ignoré. Garde-fou défensif
    // doublé du `disabled` sur le bouton — si jamais un focus clavier
    // skippait le disabled, on bloque ici aussi.
    const cur = answers[qIndex]
    if (typeof cur === 'number' && cur >= 0) return

    // Étend le tableau jusqu'à qIndex, remplit les trous avec -1 (= "non répondu").
    // -1 ne matche aucune `ans` (toujours 0..3) donc le scoring le compte comme faux.
    const next: number[] = []
    for (let i = 0; i < Math.max(qIndex + 1, answers.length); i++) {
      const v = answers[i]
      next[i] = typeof v === 'number' ? v : -1
    }
    next[qIndex] = optIndex
    onChange(next)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border', TONE_BADGE[tone])}>
          ✦ {badge}
        </span>
        {/* CS3 R5 — Bouton « Je connais déjà — Expert ». */}
        <button
          type="button"
          onClick={handleExpertClick}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
            isDeclaredExpert
              ? 'bg-accent-muted border-accent/40 text-accent'
              : 'bg-surface-2 border-border text-secondary hover:text-primary hover:border-accent/30',
          )}
        >
          <Award size={12} />
          {isDeclaredExpert
            ? `Niveau Expert auto-déclaré (cliquer pour annuler)`
            : `Je connais déjà — Expert`}
        </button>
      </div>

      {/* CS3 R5 — Si auto-déclaré : on masque les questions pour éviter le
          bruit visuel + on rappelle le boost appliqué. */}
      {isDeclaredExpert ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm text-secondary leading-relaxed">
          <p>
            <Award size={14} className="text-accent inline mr-1.5 align-text-bottom" />
            Tu as déclaré connaître <span className="text-primary font-medium">{DOMAIN_LABELS[domain]}</span>.
            On calibrera l&apos;app en supposant un bon niveau (sans toutefois
            te classer Expert pur, on ne t&apos;a pas auditionné).
          </p>
          <p className="text-xs text-muted mt-2">
            Tu peux toujours cliquer sur le bouton ci-dessus pour annuler et
            répondre aux questions.
          </p>
        </div>
      ) : quiz.map((q, qi) => {
        // QW10 — Calcul du feedback pédagogique. On compare la réponse
        // sélectionnée à correctIndex. Si différente (et != sentinel -1),
        // on colore correct/wrong et on affiche la micro-leçon en dessous.
        // Fix QW10 — `locked` est dérivé directement du tableau quiz_X
        //  (pas de state local). Une question répondue = verrouillée. La
        //  reprise wizard hérite donc automatiquement de l'état locked.
        const selectedIdx = answers[qi]
        const hasAnswered = typeof selectedIdx === 'number' && selectedIdx >= 0
        const locked      = hasAnswered  // alias sémantique pour la lecture
        const isCorrect   = hasAnswered && selectedIdx === q.correctIndex
        const isWrong     = hasAnswered && !isCorrect
        return (
        <div key={q.id} className="space-y-3" data-locked={locked ? 'true' : 'false'}>
          <p className="text-xs text-secondary uppercase tracking-widest">Question {qi + 1} / {quiz.length}</p>
          <p className="text-sm text-primary">{q.text}</p>
          <div className="space-y-2" role="radiogroup" aria-label={q.text}>
            {q.options.map((opt, oi) => {
              const selected      = selectedIdx === oi
              // QW10 — highlight correct/wrong UNIQUEMENT après une réponse.
              const isCorrectOpt  = hasAnswered && oi === q.correctIndex
              const isWrongOpt    = hasAnswered && selected && oi !== q.correctIndex
              // Fix QW10 — option grisée si la question est locked et que
              // CETTE option n'est ni la sélectionnée ni la bonne réponse.
              // (La bonne reste verte, la sélectionnée fausse reste rouge,
              // les autres distractrices passent en opacité réduite.)
              const dimmed        = locked && !selected && !isCorrectOpt
              return (
                <button
                  type="button"
                  key={oi}
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={locked}
                  tabIndex={locked && !selected ? -1 : 0}
                  disabled={locked}
                  onClick={() => selectOption(qi, oi)}
                  aria-label={
                    locked && selected
                      ? `${opt} — verrouillé : ta réponse`
                      : locked && isCorrectOpt
                        ? `${opt} — bonne réponse`
                        : undefined
                  }
                  className={cn(
                    'w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-lg border transition-colors',
                    // Cursor : pas de pointer si locked, not-allowed sur les
                    // boutons non-sélectionnés (signal visuel fort).
                    locked
                      ? (selected || isCorrectOpt ? 'cursor-default' : 'cursor-not-allowed')
                      : 'hover:border-border-2',
                    isCorrectOpt    ? 'border-accent bg-accent-muted' :
                    isWrongOpt      ? 'border-danger/50 bg-danger-muted' :
                    selected        ? 'border-accent bg-accent-muted' :
                                      'border-border bg-surface-2',
                    dimmed && 'opacity-50',
                  )}
                >
                  <span className={cn(
                    'flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center transition-colors',
                    isCorrectOpt ? 'border-accent bg-accent text-bg' :
                    isWrongOpt   ? 'border-danger bg-danger text-bg' :
                    selected     ? 'border-accent bg-accent text-bg' :
                                   'border-muted',
                  )}>
                    {isCorrectOpt && <Check size={10} strokeWidth={3} />}
                    {isWrongOpt   && <X size={10} strokeWidth={3} />}
                    {selected && !isCorrectOpt && !isWrongOpt && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className={cn(
                    'text-sm leading-relaxed',
                    isCorrectOpt ? 'text-primary' :
                    isWrongOpt   ? 'text-primary' :
                    selected     ? 'text-primary' :
                                   'text-secondary',
                  )}>
                    {opt}
                  </span>
                </button>
              )
            })}
          </div>

          {/* QW10 — Micro-leçon inline. Affichée quand la réponse est
              fausse ET reste affichée définitivement (la question étant
              verrouillée au premier clic, l'utilisateur ne peut plus
              "se corriger" — la leçon devient un compte-rendu permanent
              au lieu d'un feedback transitoire).
              Pattern « moment pédagogique » Duolingo, version honnête. */}
          {isWrong && (
            <div
              data-testid={`micro-lesson-${q.id}`}
              className="rounded-lg border-l-4 border-l-accent border-y border-r border-y-accent/20 border-r-accent/20 bg-accent/5 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-start gap-3">
                <Lightbulb size={16} className="text-accent flex-shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-accent uppercase tracking-widest font-medium mb-1.5">
                    Pour la prochaine fois — <span aria-hidden className="not-italic">{q.lessonEmoji}</span> {q.lessonTitle}
                  </p>
                  <p className="text-sm text-secondary leading-relaxed">{q.lesson}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        )
      })}

      {/* Consolidation 2 — Modal de confirmation Expert auto-déclaré
          (CS3 R5). Remplace l'ancien window.confirm() natif. Stacking
          avec micro-leçons QW10 OK : Modal a z-50 et est rendu en
          portail dans document.body, donc au-dessus du flow normal. */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Te déclarer expert"
        description={
          <>
            En te déclarant expert sur <span className="text-primary font-medium">{DOMAIN_LABELS[domain]}</span>,
            ce quiz sera passé. Ta projection considérera que tu maîtrises
            déjà ce sujet — elle sera calibrée en conséquence. Tu peux
            toujours revenir y répondre plus tard si tu veux affiner.
          </>
        }
        confirmLabel="Je suis expert"
        cancelLabel="Continuer le quiz"
        onConfirm={confirmExpert}
      />
    </div>
  )
}
