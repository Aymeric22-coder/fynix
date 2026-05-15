/**
 * Étape 8 — Profil de risque & objectif FIRE.
 * - 4 questions comportementales (radios)
 * - Sélection du type de FIRE (cartes cliquables)
 * - Revenu passif cible + âge cible + priorité principale
 */
'use client'

import { cn } from '@/lib/utils/format'
import { Field, Input, FormGrid } from '@/components/ui/field'
import { Chip } from '../Chip'
import { FIRE_TYPES, PRIORITES, RISK_QUESTIONS } from '@/lib/profil/calculs'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step8({ values, set }: Props) {
  return (
    <div className="space-y-7">
      {/* Questions de risque */}
      <div className="space-y-6">
        {RISK_QUESTIONS.map(({ key, q, opts }) => (
          <div key={key} className="space-y-2">
            <p className="text-sm text-primary">{q}</p>
            <div className="space-y-2">
              {opts.map(({ v, l }) => {
                const selected = values[key] === v
                return (
                  <button
                    type="button"
                    key={v}
                    onClick={() => set(key, v)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-lg border transition-colors',
                      selected
                        ? 'border-accent bg-accent-muted'
                        : 'border-border bg-surface-2 hover:border-border-2',
                    )}
                  >
                    <span className={cn(
                      'flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center',
                      selected ? 'border-accent' : 'border-muted',
                    )}>
                      {selected && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                    </span>
                    <span className={cn('text-sm', selected ? 'text-primary' : 'text-secondary')}>{l}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Type de FIRE */}
      <div className="space-y-3 pt-4 border-t border-border">
        <p className="text-xs text-secondary uppercase tracking-widest">Type de FIRE visé</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIRE_TYPES.map((f) => {
            const selected = values.fire_type === f.id
            return (
              <button
                type="button"
                key={f.id}
                onClick={() => set('fire_type', f.id)}
                className={cn(
                  'text-left px-4 py-3 rounded-lg border transition-colors',
                  selected
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-surface-2 hover:border-border-2',
                )}
              >
                <p className={cn('text-sm font-medium', selected ? 'text-accent' : 'text-primary')}>{f.name}</p>
                <p className="text-xs text-secondary mt-0.5 leading-relaxed">{f.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <FormGrid>
        <Field label="Revenu passif mensuel cible">
          <Input
            type="number" min={0} placeholder="4 000"
            value={values.revenu_passif_cible ?? ''}
            onChange={(e) => set('revenu_passif_cible', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="Âge cible FIRE">
          <Input
            type="number" min={0} max={120} placeholder="45"
            value={values.age_cible ?? ''}
            onChange={(e) => set('age_cible', e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
      </FormGrid>

      <Field label="Priorité principale">
        <div className="flex flex-wrap gap-2">
          {PRIORITES.map((v) => (
            <Chip key={v} active={values.priorite === v} onClick={() => set('priorite', v)}>
              {v}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}
