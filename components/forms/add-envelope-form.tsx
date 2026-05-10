'use client'

import { useRouter } from 'next/navigation'
import { Modal }  from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import type { EnvelopeType } from '@/types/database.types'

interface Props {
  open:    boolean
  onClose: () => void
  /** Callback optionnel après création réussie (renvoie l'enveloppe créée). */
  onCreated?: (envelope: { id: string; name: string; envelope_type: EnvelopeType; broker: string | null }) => void
}

const ENVELOPE_TYPE_OPTIONS: Array<{ value: EnvelopeType; label: string }> = [
  { value: 'pea',           label: 'PEA' },
  { value: 'cto',           label: 'CTO (Compte-titres)' },
  { value: 'assurance_vie', label: 'Assurance Vie' },
  { value: 'per',           label: 'PER' },
  { value: 'wallet_crypto', label: 'Wallet crypto' },
  { value: 'other',         label: 'Autre' },
]

const INITIAL = {
  name:          '',
  envelope_type: 'pea' as EnvelopeType,
  broker:        '',
  notes:         '',
}

export function AddEnvelopeForm({ open, onClose, onCreated }: Props) {
  const router = useRouter()

  const { values, set, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if (!v.name)          return { error: 'Le nom est requis' }
      if (!v.envelope_type) return { error: 'Le type est requis' }

      const res = await fetch('/api/financial/envelopes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          v.name,
          envelope_type: v.envelope_type,
          broker:        v.broker || undefined,
          currency:      'EUR',
          is_active:     true,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      if (onCreated && json.data) {
        onCreated({
          id:            json.data.id,
          name:          json.data.name,
          envelope_type: json.data.envelope_type,
          broker:        json.data.broker,
        })
      }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle enveloppe" size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Nom" required hint="ex: PEA Boursorama, AV Lucya">
          <Input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="PEA Boursorama"
            required
            autoFocus
          />
        </Field>

        <FormGrid>
          <Field label="Type" required>
            <Select value={values.envelope_type} onChange={(e) => set('envelope_type', e.target.value as EnvelopeType)}>
              {ENVELOPE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Courtier">
            <Input
              value={values.broker}
              onChange={(e) => set('broker', e.target.value)}
              placeholder="Boursorama, Trade Republic…"
            />
          </Field>
        </FormGrid>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer</Button>
        </div>
      </form>
    </Modal>
  )
}
