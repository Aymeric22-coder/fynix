/**
 * @deprecated Remplace par `AddTransactionModal` (avec `defaultType='dividend'`)
 * dans tous les nouveaux ecrans. Composant conserve pour eviter de casser
 * un eventuel consommateur externe et faciliter le rollback ; sera
 * supprime dans une prochaine vague de menage.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import type { CurrencyCode } from '@/types/database.types'

interface Props {
  positionId:       string
  positionName:     string
  positionCurrency: CurrencyCode
}

const INITIAL = {
  amount:      undefined as number | undefined,
  executed_at: new Date().toISOString().slice(0, 10),
  label:       '',
}

export function AddDividendModal({ positionId, positionName, positionCurrency }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if (!v.amount || v.amount <= 0) return { error: 'Montant requis (> 0)' }
      if (!v.executed_at)             return { error: 'Date requise' }

      const res = await fetch('/api/portfolio/dividends', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          position_id:  positionId,
          amount:       v.amount,
          currency:     positionCurrency,
          executed_at:  v.executed_at,
          label:        v.label || undefined,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); setOpen(false); router.refresh() },
  })

  return (
    <>
      <Button variant="secondary" icon={Plus} onClick={() => setOpen(true)}>
        Ajouter un dividende
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Dividende — ${positionName}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormGrid>
            <Field label="Montant" required hint={`Brut, en ${positionCurrency}`}>
              <Input
                type="number" step="any" min={0}
                value={values.amount ?? ''}
                onChange={(e) => setNumber('amount', e.target.value)}
                placeholder="12.50"
                autoFocus
                required
              />
            </Field>
            <Field label="Date d'encaissement" required>
              <Input
                type="date"
                value={values.executed_at}
                onChange={(e) => set('executed_at', e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
          </FormGrid>

          <Field label="Libellé" hint="Optionnel — sinon généré automatiquement">
            <Input
              value={values.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Acompte 2026 / dividende exceptionnel…"
            />
          </Field>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={loading}>Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
