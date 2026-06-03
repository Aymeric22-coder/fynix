/**
 * `AddCashIntentForm` — Client Component (Cash V1.2, Volet E).
 *
 * Modal de création / édition d'une intention de cash volontaire.
 * Validation client miroir de la garde serveur (zod côté API). Affiche
 * proprement les messages 422 (dépassement Σ intents).
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { CASH_INTENT_MOTIFS, CASH_INTENT_MOTIF_LABEL } from '@/lib/cash/intents-labels'
import type { CashIntentMotif } from '@/lib/cash/intents'

interface CashAccountOption {
  id:   string
  name: string
}

interface InitialData {
  id:              string
  montant:         number
  motif:           CashIntentMotif
  motif_libre:     string
  cash_account_id: string | null
  target_date:     string
}

interface Props {
  open:           boolean
  onClose:        () => void
  /** Liste des comptes cash pour le select « depuis quel compte ». */
  cashAccounts?:  CashAccountOption[]
  /** Présent pour édition, absent pour création. */
  initialData?:   InitialData
}

const INITIAL = {
  montant:         undefined as number | undefined,
  motif:           'apport_immo' as CashIntentMotif,
  motif_libre:     '',
  cash_account_id: '',
  target_date:     '',
}

export function AddCashIntentForm({ open, onClose, cashAccounts = [], initialData }: Props) {
  const router = useRouter()
  const isEdit = !!initialData
  const [serverError, setServerError] = useState<string | null>(null)

  const { values, set, setNumber, loading, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          montant:         initialData.montant as number | undefined,
          motif:           initialData.motif,
          motif_libre:     initialData.motif_libre,
          cash_account_id: initialData.cash_account_id ?? '',
          target_date:     initialData.target_date,
        }
      : INITIAL,
    async onSubmit(v) {
      setServerError(null)
      if (v.montant === undefined || v.montant <= 0) {
        return { error: 'Le montant doit être > 0.' }
      }
      const url    = isEdit ? `/api/cash/intents/${initialData!.id}` : '/api/cash/intents'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          montant:         v.montant,
          motif:           v.motif,
          motif_libre:     v.motif_libre || null,
          cash_account_id: v.cash_account_id || null,
          target_date:     v.target_date || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        // 422 : dépassement → message lisible. 400 : validation zod.
        setServerError(json.error ?? 'Erreur inattendue.')
        return { error: json.error ?? 'Erreur inattendue.' }
      }
      return {}
    },
    onSuccess() { reset(); setServerError(null); onClose(); router.refresh() },
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier l\'intention' : 'Déclarer une intention'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Motif" required>
          <Select
            value={values.motif}
            onChange={(e) => set('motif', e.target.value as CashIntentMotif)}
          >
            {CASH_INTENT_MOTIFS.map((m) => (
              <option key={m} value={m}>{CASH_INTENT_MOTIF_LABEL[m]}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Précision (optionnel)"
          hint="Ex : « Apport Saint-Brieuc Q4 », « Voyage Tokyo automne »"
        >
          <Input
            value={values.motif_libre}
            onChange={(e) => set('motif_libre', e.target.value.slice(0, 280))}
            placeholder="Description courte"
          />
        </Field>

        <FormGrid>
          <Field label="Montant (€)" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={values.montant ?? ''}
              onChange={(e) => setNumber('montant', e.target.value)}
              placeholder="5 000"
              required
            />
          </Field>
          <Field
            label="Date cible (optionnel)"
            hint="Laisse vide si tu n'as pas de date précise"
          >
            <Input
              type="date"
              value={values.target_date}
              onChange={(e) => set('target_date', e.target.value)}
            />
          </Field>
        </FormGrid>

        {cashAccounts.length > 0 && (
          <Field label="Compte associé (optionnel)" hint="Lie l'intention à un compte précis">
            <Select
              value={values.cash_account_id}
              onChange={(e) => set('cash_account_id', e.target.value)}
            >
              <option value="">Non précisé</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        )}

        {serverError && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
            {serverError}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Enregistrer' : 'Déclarer'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
