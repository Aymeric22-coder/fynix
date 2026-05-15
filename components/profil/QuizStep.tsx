/**
 * Bloc réutilisable pour afficher un quiz (Bourse / Crypto / Immo).
 *
 * Reçoit la définition complète du quiz (depuis lib/profil/calculs.ts)
 * et l'état courant des réponses (tableau d'index ou null). Délègue les
 * mises à jour au parent via `onChange`.
 *
 * Pas de logique de scoring ici — le scoring est calculé à la volée
 * dans la carte de profil via computeProfileMetrics().
 */
'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/format'
import type { QuizQuestion } from '@/lib/profil/calculs'

interface QuizStepProps {
  badge:    string                                 // ex: "Évaluation Bourse"
  quiz:     ReadonlyArray<QuizQuestion>
  answers:  ReadonlyArray<number | null | undefined>
  onChange: (answers: number[]) => void
  /** Variante de couleur du badge. Reste sur les tokens existants. */
  tone?:    'info' | 'success' | 'warning'
}

const TONE_BADGE: Record<NonNullable<QuizStepProps['tone']>, string> = {
  info:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
  success: 'bg-accent-muted text-accent border-accent/30',
  warning: 'bg-warning-muted text-warning border-warning/30',
}

export function QuizStep({ badge, quiz, answers, onChange, tone = 'success' }: QuizStepProps) {
  function selectOption(qIndex: number, optIndex: number) {
    // Étend le tableau jusqu'à qIndex, remplit les trous avec -1 (= "non répondu").
    // -1 ne matche aucune `ans` (toujours 0..3) donc le scoring le compte comme faux.
    const next: number[] = []
    for (let i = 0; i < Math.max(qIndex + 1, answers.length); i++) {
      const cur = answers[i]
      next[i] = typeof cur === 'number' ? cur : -1
    }
    next[qIndex] = optIndex
    onChange(next)
  }

  return (
    <div className="space-y-6">
      <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border', TONE_BADGE[tone])}>
        ✦ {badge}
      </span>

      {quiz.map((q, qi) => (
        <div key={qi} className="space-y-3">
          <p className="text-xs text-secondary uppercase tracking-widest">Question {qi + 1} / {quiz.length}</p>
          <p className="text-sm text-primary">{q.q}</p>
          <div className="space-y-2">
            {q.opts.map((opt, oi) => {
              const selected = answers[qi] === oi
              return (
                <button
                  type="button"
                  key={oi}
                  onClick={() => selectOption(qi, oi)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-lg border transition-colors',
                    selected
                      ? 'border-accent bg-accent-muted'
                      : 'border-border bg-surface-2 hover:border-border-2',
                  )}
                >
                  <span className={cn(
                    'flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center transition-colors',
                    selected ? 'border-accent bg-accent text-bg' : 'border-muted',
                  )}>
                    {selected && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className={cn('text-sm leading-relaxed', selected ? 'text-primary' : 'text-secondary')}>
                    {opt}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
