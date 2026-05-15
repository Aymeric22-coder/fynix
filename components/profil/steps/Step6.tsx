/** Étape 6 — Quiz Crypto. */
'use client'

import { QuizStep } from '../QuizStep'
import { QUIZ_CRYPTO } from '@/lib/profil/calculs'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step6({ values, set }: Props) {
  return (
    <QuizStep
      badge="Évaluation Crypto"
      tone="warning"
      quiz={QUIZ_CRYPTO}
      answers={values.quiz_crypto ?? []}
      onChange={(a) => set('quiz_crypto', a)}
    />
  )
}
