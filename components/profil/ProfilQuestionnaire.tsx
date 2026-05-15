/**
 * Orchestrateur du questionnaire en 8 étapes.
 *
 * - Maintient le state local des réponses (initialisé depuis le profil
 *   existant en DB si rechargement / modification).
 * - Affiche une barre de progression dorée fine + points de navigation.
 *   Note : on garde l'accent emerald de l'app, pas le gold du mockup.
 * - À la dernière étape, le bouton "Voir mon profil" déclenche la
 *   sauvegarde via `onSubmit` et bascule sur la carte.
 */
'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/format'
import { STEPS } from '@/lib/profil/calculs'
import { EMPTY_VALUES, type QuestionnaireValues } from './questionnaire-types'
import { Step1 } from './steps/Step1'
import { Step2 } from './steps/Step2'
import { Step3 } from './steps/Step3'
import { Step4 } from './steps/Step4'
import { Step5 } from './steps/Step5'
import { Step6 } from './steps/Step6'
import { Step7 } from './steps/Step7'
import { Step8 } from './steps/Step8'

interface Props {
  initialValues?: Partial<QuestionnaireValues>
  onSubmit:       (v: QuestionnaireValues) => Promise<{ error?: string }>
  /** Pour les profils déjà complétés : permet de revenir en arrière. */
  onCancel?:      () => void
}

export function ProfilQuestionnaire({ initialValues, onSubmit, onCancel }: Props) {
  const [step,    setStep]    = useState(1)
  const [values,  setValues]  = useState<QuestionnaireValues>({ ...EMPTY_VALUES, ...initialValues })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function set<K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }))
  }

  async function handleNext() {
    setError(null)
    if (step < 8) { setStep((s) => s + 1); return }
    // Étape 8 → submit
    setLoading(true)
    const res = await onSubmit(values)
    setLoading(false)
    if (res.error) { setError(res.error); return }
  }

  const meta = STEPS[step - 1]!
  const StepComp = [Step1, Step2, Step3, Step4, Step5, Step6, Step7, Step8][step - 1]!

  return (
    <div className="max-w-2xl mx-auto">
      {/* Barre de progression */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-accent uppercase tracking-widest font-medium">{meta.title}</span>
          <span className="text-xs text-muted financial-value">{step} / 8</span>
        </div>
        <div className="h-0.5 bg-border rounded overflow-hidden">
          <div
            className="h-full bg-accent rounded transition-all duration-500"
            style={{ width: `${(step / 8) * 100}%` }}
          />
        </div>
        <div className="flex justify-center gap-1.5 mt-3">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                s.id === step ? 'bg-accent scale-150' :
                s.id  <  step ? 'bg-accent-hover' :
                'bg-border',
              )}
            />
          ))}
        </div>
      </div>

      {/* Carte de l'étape courante */}
      <div className="card p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-primary mb-1">{meta.title}</h2>
        <p className="text-sm text-secondary mb-6 leading-relaxed">{meta.sub}</p>

        <StepComp values={values} set={set} />

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg mt-4">{error}</p>
        )}

        <div className="flex items-center gap-3 mt-7 pt-5 border-t border-border">
          {step > 1 ? (
            <Button variant="secondary" type="button" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
              Retour
            </Button>
          ) : onCancel ? (
            <Button variant="secondary" type="button" onClick={onCancel}>Annuler</Button>
          ) : <div />}

          <Button
            type="button"
            onClick={handleNext}
            loading={loading}
            icon={step === 8 ? Flame : ArrowRight}
            className="ml-auto"
          >
            {step === 8 ? 'Voir mon profil' : 'Continuer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
