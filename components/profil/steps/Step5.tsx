/** Étape 5 — Quiz Bourse. */
'use client'

import { QuizStep } from '../QuizStep'
import { QUIZ_BOURSE } from '@/lib/profil/calculs'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step5({ values, set }: Props) {
  return (
    <QuizStep
      badge="Évaluation Bourse"
      tone="info"
      quiz={QUIZ_BOURSE}
      answers={values.quiz_bourse ?? []}
      onChange={(a) => set('quiz_bourse', a)}
    />
  )
}
