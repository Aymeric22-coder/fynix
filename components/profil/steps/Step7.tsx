/** Étape 7 — Quiz Immobilier. */
'use client'

import { QuizStep } from '../QuizStep'
import { QUIZ_IMMO } from '@/lib/profil/calculs'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step7({ values, set }: Props) {
  return (
    <QuizStep
      badge="Évaluation Immobilier"
      tone="success"
      quiz={QUIZ_IMMO}
      answers={values.quiz_immo ?? []}
      onChange={(a) => set('quiz_immo', a)}
    />
  )
}
