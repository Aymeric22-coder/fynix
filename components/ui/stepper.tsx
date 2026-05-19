import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/format'

export interface StepperStep {
  id:       string
  label:    string
  optional?: boolean
}

interface Props {
  steps:        StepperStep[]
  /** Index 1-based de l'étape courante. */
  current:      number
  /** Index 1-based des étapes déjà validées. */
  completed?:   Set<number>
  onJump?:      (stepIndex: number) => void
}

/**
 * Stepper horizontal : numéros + labels + barre de progression.
 * Étapes complétées : check vert. Étape courante : accent emerald.
 * Étapes futures : muted.
 */
export function Stepper({ steps, current, completed, onJump }: Props) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3">
      {steps.map((step, i) => {
        const idx       = i + 1
        const isCurrent = idx === current
        const isDone    = completed?.has(idx) ?? idx < current
        const isClickable = !!onJump && (isDone || isCurrent)
        const circle = (
          <span
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium border transition-colors',
              isDone
                ? 'bg-accent border-accent text-bg'
                : isCurrent
                  ? 'border-accent text-accent'
                  : 'border-border text-muted',
            )}
          >
            {isDone ? <Check size={14} /> : idx}
          </span>
        )
        return (
          <li key={step.id} className="flex items-center gap-2 sm:gap-3 min-w-0">
            {isClickable ? (
              <button
                type="button"
                onClick={() => onJump?.(idx)}
                className="flex items-center gap-2 group"
              >
                {circle}
                <span
                  className={cn(
                    'hidden sm:block text-xs whitespace-nowrap',
                    isCurrent
                      ? 'text-primary font-medium'
                      : isDone
                        ? 'text-secondary group-hover:text-primary'
                        : 'text-muted',
                  )}
                >
                  {step.label}
                  {step.optional && <span className="text-muted ml-1">(facultatif)</span>}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {circle}
                <span className={cn(
                  'hidden sm:block text-xs whitespace-nowrap',
                  isCurrent ? 'text-primary font-medium' : 'text-muted',
                )}>
                  {step.label}
                  {step.optional && <span className="text-muted ml-1">(facultatif)</span>}
                </span>
              </div>
            )}
            {i < steps.length - 1 && (
              <span className={cn(
                'h-px w-4 sm:w-8 transition-colors',
                isDone ? 'bg-accent' : 'bg-border',
              )} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
