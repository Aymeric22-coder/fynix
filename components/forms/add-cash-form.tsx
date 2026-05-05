'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'

interface InitialData {
  id:            string
  name:          string
  account_type:  string
  bank_name:     string
  balance:       number
  interest_rate: number
  balance_date:  string
}

interface Props {
  open:         boolean
  onClose:      () => void
  initialData?: InitialData
}

const INITIAL = {
  name:          '',
  account_type:  'livret_a',
  bank_name:     '',
  balance:       undefined as number | undefined,
  interest_rate: undefined as number | undefined,
  balance_date:  new Date().toISOString().split('T')[0] as string,
}

const ACCOUNT_OPTIONS = [
  { value: 'livret_a',      label: 'Livret A' },
  { value: 'ldds',          label: 'LDDS' },
  { value: 'lep',           label: 'LEP' },
  { value: 'livret_jeune',  label: 'Livret Jeune' },
  { value: 'pel',           label: 'PEL' },
  { value: 'cel',           label: 'CEL' },
  { value: 'compte_courant',label: 'Compte courant' },
  { value: 'compte_epargne',label: 'Compte épargne' },
  { value: 'other',         label: 'Autre' },
]

// Taux réglementés courants (indicatifs)
const DEFAULT_RATES: Record<string, number> = {
  livret_a: 3.0, ldds: 3.0, lep: 4.0, livret_jeune: 3.0, pel: 2.25,
}

export function AddCashForm({ open, onClose, initialData }: Props) {
  const router = useRouter()

  const isEdit = !!initialData

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          name:          initialData.name,
          account_type:  initialData.account_type,
          bank_name:     initialData.bank_name,
          balance:       initialData.balance as number | undefined,
          interest_rate: initialData.interest_rate as number | undefined,
          balance_date:  initialData.balance_date,
        }
      : INITIAL,
    async onSubmit(v) {
      if (!v.name || v.balance === undefined)
        return { error: 'Nom et solde sont requis' }

      const url    = isEdit ? `/api/cash/${initialData!.id}` : '/api/cash'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          v.name,
          account_type:  v.account_type,
          bank_name:     v.bank_name || null,
          balance:       v.balance,
          interest_rate: v.interest_rate ?? DEFAULT_RATES[v.account_type] ?? 0,
          balance_date:  v.balance_date,
          currency:      'EUR',
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  // Taux par défaut selon type
  const suggestedRate = DEFAULT_RATES[values.account_type]
  const annualInterest = values.balance && values.interest_rate
    ? values.balance * (values.interest_rate / 100) : null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier le compte' : 'Ajouter un compte'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Nom du compte" required>
          <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ex : Livret A BNP" required />
        </Field>
        <FormGrid>
          <Field label="Type de compte" required>
            <Select value={values.account_type} onChange={(e) => {
              set('account_type', e.target.value)
              const rate = DEFAULT_RATES[e.target.value]
              if (rate) setNumber('interest_rate', String(rate))
            }}>
              {ACCOUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Banque">
            <Input value={values.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="BNP Paribas" />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label="Solde actuel (€)" required>
            <Input type="number" step="0.01" min={0} value={values.balance ?? ''} onChange={(e) => setNumber('balance', e.target.value)} placeholder="10 000" required />
          </Field>
          <Field label="Date du relevé" required>
            <Input type="date" value={values.balance_date} onChange={(e) => set('balance_date', e.target.value)} required />
          </Field>
        </FormGrid>
        <Field
          label="Taux d'intérêt (%)"
          hint={suggestedRate ? `Taux réglementé actuel : ${suggestedRate} %` : undefined}
        >
          <Input type="number" step="0.01" min={0} max={20} value={values.interest_rate ?? ''} onChange={(e) => setNumber('interest_rate', e.target.value)} placeholder={String(suggestedRate ?? '0')} />
        </Field>

        {annualInterest !== null && (
          <div className="bg-accent-muted border border-accent/20 rounded-lg px-4 py-3 text-sm">
            <span className="text-secondary">Intérêts annuels estimés : </span>
            <span className="text-accent font-medium financial-value">{formatCurrency(annualInterest, 'EUR')}</span>
          </div>
        )}

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Ajouter le compte'}</Button>
        </div>
      </form>
    </Modal>
  )
}
