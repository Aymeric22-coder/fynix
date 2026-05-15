/**
 * Étape 4 — Capacité d'investissement.
 * Affiche le "reste à vivre" calculé automatiquement (revenus − charges)
 * comme indicateur live au-dessus des inputs.
 */
'use client'

import { Field, Input } from '@/components/ui/field'
import { Chip } from '../Chip'
import { ENVELOPPES } from '@/lib/profil/calculs'
import { formatCurrency } from '@/lib/utils/format'
import type { QuestionnaireValues } from '../questionnaire-types'

interface Props {
  values: QuestionnaireValues
  set:    <K extends keyof QuestionnaireValues>(k: K, v: QuestionnaireValues[K]) => void
}

export function Step4({ values, set }: Props) {
  const num = (k: 'epargne_mensuelle' | 'invest_mensuel') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, e.target.value ? Number(e.target.value) : null)

  // Calcul live du reste à vivre depuis les valeurs déjà saisies aux étapes 2 et 3
  const revenus = (values.revenu_mensuel ?? 0) + (values.revenu_conjoint ?? 0) + (values.autres_revenus ?? 0)
  const charges = (values.loyer ?? 0) + (values.autres_credits ?? 0) + (values.charges_fixes ?? 0) + (values.depenses_courantes ?? 0)
  const reste   = revenus - charges

  function toggleEnveloppe(v: string) {
    const cur = values.enveloppes ?? []
    set('enveloppes', cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
  }

  return (
    <div className="space-y-5">
      {reste > 0 && (
        <div className="flex items-center justify-between bg-accent-muted border border-accent/30 rounded-lg px-4 py-3">
          <span className="text-xs text-secondary">Reste à vivre calculé</span>
          <span className="text-sm font-semibold text-accent financial-value">
            {formatCurrency(reste, 'EUR', { decimals: 0 })} / mois
          </span>
        </div>
      )}

      <Field label="Épargne mensuelle actuelle">
        <Input type="number" min={0} placeholder="500"
               value={values.epargne_mensuelle ?? ''} onChange={num('epargne_mensuelle')} />
      </Field>
      <Field label="Capacité mensuelle souhaitée">
        <Input type="number" min={0} placeholder="800"
               value={values.invest_mensuel ?? ''} onChange={num('invest_mensuel')} />
      </Field>

      <Field label="Enveloppes d'investissement ouvertes" hint="Sélection multiple">
        <div className="flex flex-wrap gap-2">
          {ENVELOPPES.map((v) => (
            <Chip key={v} active={(values.enveloppes ?? []).includes(v)} onClick={() => toggleEnveloppe(v)}>
              {v}
            </Chip>
          ))}
        </div>
      </Field>
    </div>
  )
}
