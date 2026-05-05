'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'

interface InitialData {
  id:               string
  transaction_type: string
  label:            string | null
  amount:           number
  quantity:         number | null
  unit_price:       number | null
  executed_at:      string
  notes:            string | null
}

interface Props {
  open:         boolean
  onClose:      () => void
  initialData?: InitialData
}

const INITIAL = {
  transaction_type: 'purchase' as string,
  label:            '',
  amount:           undefined as number | undefined,
  quantity:         undefined as number | undefined,
  unit_price:       undefined as number | undefined,
  executed_at:      new Date().toISOString().split('T')[0] as string,
  notes:            '',
}

const TX_OPTIONS = [
  { value: 'purchase',     label: 'Achat' },
  { value: 'sale',         label: 'Vente' },
  { value: 'rent_income',  label: 'Loyer perçu' },
  { value: 'dividend',     label: 'Dividende' },
  { value: 'interest',     label: 'Intérêt / Coupon' },
  { value: 'loan_payment', label: 'Remboursement crédit' },
  { value: 'deposit',      label: 'Apport de fonds' },
  { value: 'withdrawal',   label: 'Retrait' },
  { value: 'fee',          label: 'Frais' },
  { value: 'tax',          label: 'Impôt / Taxe' },
  { value: 'transfer',     label: 'Virement interne' },
]

// Types pour lesquels montant = quantité × prix unitaire
const PRICE_TYPES = ['purchase', 'sale']

export function AddTransactionForm({ open, onClose, initialData }: Props) {
  const router = useRouter()

  const isEdit = !!initialData

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          transaction_type: initialData.transaction_type,
          label:            initialData.label            ?? '',
          amount:           initialData.amount as number | undefined,
          quantity:         initialData.quantity         ?? undefined as number | undefined,
          unit_price:       initialData.unit_price       ?? undefined as number | undefined,
          executed_at:      initialData.executed_at.split('T')[0],
          notes:            initialData.notes            ?? '',
        }
      : INITIAL,
    async onSubmit(v) {
      if (!v.amount || !v.executed_at)
        return { error: 'Montant et date sont requis' }

      const url    = isEdit ? `/api/transactions/${initialData!.id}` : '/api/transactions'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_type: v.transaction_type,
          label:            v.label || null,
          amount:           v.amount,
          quantity:         v.quantity   ?? null,
          unit_price:       v.unit_price ?? null,
          executed_at:      new Date(v.executed_at).toISOString(),
          notes:            v.notes || null,
          currency:         'EUR',
          data_source:      'manual',
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  const showPriceFields = PRICE_TYPES.includes(values.transaction_type)

  // Auto-calcul montant si quantité × prix
  const impliedAmount = showPriceFields && values.quantity && values.unit_price
    ? values.quantity * values.unit_price
    : null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Modifier l'opération" : 'Enregistrer une opération'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Type d'opération" required>
          <Select value={values.transaction_type} onChange={(e) => set('transaction_type', e.target.value)}>
            {TX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Libellé" hint="Description libre">
          <Input
            value={values.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="ex : Loyer janvier, Achat ETF CW8…"
          />
        </Field>

        <FormGrid>
          <Field label="Montant (€)" required>
            <Input
              type="number" step="any"
              value={values.amount ?? ''}
              onChange={(e) => setNumber('amount', e.target.value)}
              placeholder="1 000"
              required
            />
          </Field>
          <Field label="Date" required>
            <Input
              type="date"
              value={values.executed_at}
              onChange={(e) => set('executed_at', e.target.value)}
              required
            />
          </Field>
        </FormGrid>

        {/* Quantité / prix unitaire pour achats et ventes */}
        {showPriceFields && (
          <FormGrid>
            <Field label="Quantité" hint="Unités / parts">
              <Input
                type="number" step="any" min={0}
                value={values.quantity ?? ''}
                onChange={(e) => {
                  setNumber('quantity', e.target.value)
                  if (e.target.value && values.unit_price)
                    setNumber('amount', String(Number(e.target.value) * values.unit_price))
                }}
                placeholder="10"
              />
            </Field>
            <Field label="Prix unitaire (€)">
              <Input
                type="number" step="any" min={0}
                value={values.unit_price ?? ''}
                onChange={(e) => {
                  setNumber('unit_price', e.target.value)
                  if (e.target.value && values.quantity)
                    setNumber('amount', String(values.quantity * Number(e.target.value)))
                }}
                placeholder="148.50"
              />
            </Field>
          </FormGrid>
        )}

        {impliedAmount !== null && (
          <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
            <span className="text-secondary">Montant calculé : </span>
            <span className="text-primary font-medium financial-value">
              {formatCurrency(impliedAmount, 'EUR')}
            </span>
          </div>
        )}

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Contexte ou commentaire…"
            rows={2}
          />
        </Field>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Enregistrer'}</Button>
        </div>
      </form>
    </Modal>
  )
}
