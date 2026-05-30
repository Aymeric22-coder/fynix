/**
 * Étape 9 — Ta fiscalité (CS1).
 *
 * Capture la TMI (Tranche Marginale d'Imposition) pour calibrer les recos
 * fiscales et l'estimation des cashflows immo. Avant CS1, ce champ vivait
 * dans /parametres et était souvent absent → fallback 30 % côté
 * optimiseurFiscal / fiscaliteImmo qui sous-estimait de ~25 % le gain PER
 * pour un cadre à TMI 41 %.
 *
 * UX :
 *  - 6 chips : 0, 11, 30, 41, 45, « Je ne sais pas »
 *  - Chip « Je ne sais pas » → tmi_rate = null (fallback aval 30 %)
 *  - InfoTip explicatif sur la TMI (réutilise primitive existante)
 *  - Mention pédagogique en haut de l'étape
 *
 * Étape skippable (cf. SKIPPABLE_STEPS de wizardValidation). Le wizard
 * reste pleinement utilisable sans renseigner la TMI — le fallback 30 %
 * continue de s'appliquer.
 */
'use client'

import { cn } from '@/lib/utils/format'
import { Field } from '@/components/ui/field'
import { InfoTip } from '@/components/ui/info-tip'
import type { QuestionnaireValues } from '../questionnaire-types'

/** Valeurs proposées (en %). `null` = chip « Je ne sais pas ». */
const TMI_OPTIONS: ReadonlyArray<number | null> = [0, 11, 30, 41, 45, null]

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step9({ values, set }: Props) {
  return (
    <div className="space-y-5">
      {/* Mention pédagogique */}
      <div className="rounded-lg border border-border bg-surface-2 p-3.5">
        <p className="text-xs text-secondary leading-relaxed">
          On a besoin de ta TMI pour calibrer précisément les recos PER, AV
          et l&apos;estimation de tes cashflows locatifs. Sans elle, on
          suppose 30&nbsp;%.
        </p>
      </div>

      <Field
        label={
          <span className="inline-flex items-center gap-1.5">
            Ta tranche marginale d&apos;imposition
            <InfoTip
              text="La Tranche Marginale d'Imposition (TMI) est le taux appliqué à la dernière portion de tes revenus. Ex : salarié à 45 k€/an net → TMI 30 %."
            />
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          {TMI_OPTIONS.map((opt) => {
            const isSelected =
              opt === null
                ? values.tmi_rate === null || values.tmi_rate === undefined
                : values.tmi_rate === opt
            const label = opt === null ? 'Je ne sais pas' : `${opt} %`
            return (
              <button
                key={opt === null ? 'none' : opt}
                type="button"
                onClick={() => set('tmi_rate', opt)}
                aria-pressed={isSelected}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                  isSelected
                    ? 'bg-accent-muted border-accent/30 text-accent'
                    : 'bg-surface-2 border-border text-secondary hover:text-primary',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        {(values.tmi_rate === null || values.tmi_rate === undefined) && (
          <p className="text-xs text-muted mt-2">
            Estimation 30&nbsp;% appliquée par défaut dans les calculs fiscaux.
            Tu peux toujours la mettre à jour plus tard.
          </p>
        )}
      </Field>
    </div>
  )
}
