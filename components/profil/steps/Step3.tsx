/** Étape 3 — Charges & dépenses. */
'use client'

import { Field, Input } from '@/components/ui/field'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step3({ values, set }: Props) {
  const num = (k: 'loyer' | 'autres_credits' | 'charges_fixes' | 'depenses_courantes') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, e.target.value ? Number(e.target.value) : null)

  return (
    <div className="space-y-5">
      <Field label="Loyer / mensualité résidence principale">
        <Input type="number" min={0} placeholder="900"
               value={values.loyer ?? ''} onChange={num('loyer')} />
      </Field>
      <Field label="Autres crédits en cours">
        <Input type="number" min={0} placeholder="0"
               value={values.autres_credits ?? ''} onChange={num('autres_credits')} />
      </Field>
      <Field label="Charges fixes (assurances, abonnements…)">
        <Input type="number" min={0} placeholder="300"
               value={values.charges_fixes ?? ''} onChange={num('charges_fixes')} />
      </Field>
      <Field label="Dépenses courantes estimées">
        <Input type="number" min={0} placeholder="800"
               value={values.depenses_courantes ?? ''} onChange={num('depenses_courantes')} />
      </Field>
    </div>
  )
}
