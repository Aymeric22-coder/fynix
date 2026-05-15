'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Modal }  from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  positionId:   string
  positionName: string
  quantity:     number
  currency:     string
  /** Dernier prix connu (pour affichage indicatif dans la modale). */
  lastPrice?:   number | null
  lastDate?:    string | null
}

const INITIAL = {
  price:       undefined as number | undefined,
  total_value: undefined as number | undefined,
  priced_at:   '' as string,  // ISO date yyyy-MM-dd, défaut backend = now
  notes:       '',
}

export function AddPriceModalTrigger(props: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent-muted text-accent hover:bg-accent hover:text-white transition-colors"
        title="Saisir une nouvelle valeur pour cet instrument"
      >
        <Plus size={12} /> Ajouter une valeur
      </button>
      <AddPriceModal {...props} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

interface ModalProps extends Props {
  open:    boolean
  onClose: () => void
}

function AddPriceModal({
  positionId, positionName, quantity, currency,
  lastPrice, lastDate, open, onClose,
}: ModalProps) {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if ((!v.price || v.price <= 0) && (!v.total_value || v.total_value <= 0)) {
        return { error: 'Saisis soit le prix unitaire, soit la valeur totale' }
      }
      const res = await fetch(`/api/portfolio/positions/${positionId}/prices`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price:       v.price,
          total_value: v.total_value,
          priced_at:   v.priced_at || undefined,
          notes:       v.notes || undefined,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  const derivedPrice = !values.price && values.total_value && quantity > 0
    ? values.total_value / quantity
    : null

  return (
    <Modal open={open} onClose={onClose} title="Ajouter une valeur" size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm space-y-1">
          <div className="text-primary font-medium">{positionName}</div>
          <div className="text-xs text-secondary">
            {quantity} part{quantity > 1 ? 's' : ''}
            {lastPrice !== null && lastPrice !== undefined && (
              <> · dernière valeur connue : {formatCurrency(lastPrice, currency, { decimals: 2 })}
                {lastDate && (
                  <> le {new Date(lastDate).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                  })}</>
                )}
              </>
            )}
          </div>
        </div>

        <FormGrid>
          <Field
            label="Prix unitaire"
            hint="Devise de la position"
          >
            <Input
              type="number" step="any" min={0}
              value={values.price ?? ''}
              onChange={(e) => {
                setNumber('price', e.target.value)
                if (e.target.value) set('total_value', undefined)
              }}
              placeholder={lastPrice ? String(lastPrice) : 'ex: 204'}
            />
          </Field>
          <Field
            label="OU valeur totale"
            hint="Pratique pour AV : valeur du contrat"
          >
            <Input
              type="number" step="any" min={0}
              value={values.total_value ?? ''}
              onChange={(e) => {
                setNumber('total_value', e.target.value)
                if (e.target.value) set('price', undefined)
              }}
              placeholder="ex: 2996,90"
            />
          </Field>
        </FormGrid>

        {derivedPrice !== null && (
          <p className="text-xs text-secondary -mt-3">
            → prix unitaire déduit :{' '}
            <span className="text-primary financial-value">
              {formatCurrency(derivedPrice, currency, { decimals: 4 })}
            </span>
          </p>
        )}

        <Field label="Date de la valeur" hint="Défaut : maintenant">
          <Input
            type="date"
            value={values.priced_at}
            onChange={(e) => set('priced_at', e.target.value)}
          />
        </Field>

        <Field label="Notes" hint="Ex: source = relevé Lucya Cardif">
          <Textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Contexte de la valorisation…"
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
            <X size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Enregistrer la valeur</Button>
        </div>
      </form>
    </Modal>
  )
}
