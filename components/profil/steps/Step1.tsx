/**
 * Étape 1 — Situation personnelle.
 * Prénom (texte), âge (nombre), enfants (select), situation familiale et
 * statut pro (chips à choix unique).
 */
'use client'

import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { Chip } from '../Chip'
import { ENFANTS, SITUATIONS_FAMILIALES, STATUTS_PRO } from '@/lib/profil/calculs'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step1({ values, set }: Props) {
  return (
    <div className="space-y-5">
      <Field label="Prénom">
        <Input
          placeholder="Ex : Alexandre"
          value={values.prenom ?? ''}
          onChange={(e) => set('prenom', e.target.value || null)}
        />
      </Field>

      <FormGrid>
        <Field label="Âge">
          <Input
            type="number" min={0} max={120}
            placeholder="32"
            value={values.age ?? ''}
            onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="Enfants à charge">
          <Select
            value={values.enfants ?? ''}
            onChange={(e) => set('enfants', e.target.value || null)}
          >
            <option value="">—</option>
            {ENFANTS.map((v) => <option key={v}>{v}</option>)}
          </Select>
        </Field>
      </FormGrid>

      <Field label="Situation familiale">
        <div className="flex flex-wrap gap-2">
          {SITUATIONS_FAMILIALES.map((v) => (
            <Chip
              key={v}
              active={values.situation_familiale === v}
              onClick={() => set('situation_familiale', v)}
            >
              {v}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Statut professionnel">
        <div className="flex flex-wrap gap-2">
          {STATUTS_PRO.map((v) => (
            <Chip
              key={v}
              active={values.statut_pro === v}
              onClick={() => set('statut_pro', v)}
            >
              {v}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}
