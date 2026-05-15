/** Étape 2 — Revenus (vous, conjoint, autres, stabilité). */
'use client'

import { Field, Input } from '@/components/ui/field'
import { Chip } from '../Chip'
import { STABILITES_REVENUS } from '@/lib/profil/calculs'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step2({ values, set }: Props) {
  const num = (k: 'revenu_mensuel' | 'revenu_conjoint' | 'autres_revenus') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, e.target.value ? Number(e.target.value) : null)

  return (
    <div className="space-y-5">
      <Field label="Revenus nets mensuels (vous)">
        <Input type="number" min={0} placeholder="3 500"
               value={values.revenu_mensuel ?? ''} onChange={num('revenu_mensuel')} />
      </Field>
      <Field label="Revenus nets mensuels (conjoint)">
        <Input type="number" min={0} placeholder="0"
               value={values.revenu_conjoint ?? ''} onChange={num('revenu_conjoint')} />
      </Field>
      <Field label="Autres revenus (loyers, dividendes…)">
        <Input type="number" min={0} placeholder="0"
               value={values.autres_revenus ?? ''} onChange={num('autres_revenus')} />
      </Field>
      <Field label="Stabilité des revenus">
        <div className="flex flex-wrap gap-2">
          {STABILITES_REVENUS.map((v) => (
            <Chip key={v} active={values.stabilite_revenus === v} onClick={() => set('stabilite_revenus', v)}>
              {v}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}
