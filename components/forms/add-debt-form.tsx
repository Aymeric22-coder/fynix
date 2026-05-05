'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'

interface Props { open: boolean; onClose: () => void }

const INITIAL = {
  name:            '',
  debt_type:       'mortgage' as string,
  lender:          '',
  initial_amount:  undefined as number | undefined,
  interest_rate:   undefined as number | undefined,
  insurance_rate:  0 as number,
  duration_months: undefined as number | undefined,
  start_date:      '',
  deferral_type:   'none' as string,
  deferral_months: 0 as number,
  notes:           '',
}

export function AddDebtForm({ open, onClose }: Props) {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if (!v.name || !v.initial_amount || !v.interest_rate || !v.duration_months || !v.start_date)
        return { error: 'Nom, montant, taux, durée et date sont requis' }

      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            v.name,
          debt_type:       v.debt_type,
          lender:          v.lender || null,
          initial_amount:  v.initial_amount,
          interest_rate:   v.interest_rate,
          insurance_rate:  v.insurance_rate,
          duration_months: v.duration_months,
          start_date:      v.start_date,
          deferral_type:   v.deferral_type,
          deferral_months: v.deferral_months,
          notes:           v.notes || null,
          currency:        'EUR',
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  // Calcul mensualité en direct
  let previewPMT: number | null = null
  if (values.initial_amount && values.interest_rate && values.duration_months) {
    const r = values.interest_rate / 100 / 12
    const n = values.duration_months - values.deferral_months
    previewPMT = r === 0
      ? values.initial_amount / n
      : (values.initial_amount * r) / (1 - Math.pow(1 + r, -n))
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un crédit" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormSection>
          <Field label="Libellé du crédit" required>
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ex : Crédit acquisition Lyon" required />
          </Field>
          <FormGrid>
            <Field label="Type">
              <Select value={values.debt_type} onChange={(e) => set('debt_type', e.target.value)}>
                <option value="mortgage">Immobilier</option>
                <option value="consumer">Consommation</option>
                <option value="professional">Professionnel</option>
              </Select>
            </Field>
            <Field label="Organisme prêteur">
              <Input value={values.lender} onChange={(e) => set('lender', e.target.value)} placeholder="Crédit Agricole" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Paramètres financiers">
          <FormGrid>
            <Field label="Montant emprunté (€)" required>
              <Input type="number" min={0} value={values.initial_amount ?? ''} onChange={(e) => setNumber('initial_amount', e.target.value)} placeholder="200 000" required />
            </Field>
            <Field label="Date de début" required>
              <Input type="date" value={values.start_date} onChange={(e) => set('start_date', e.target.value)} required />
            </Field>
          </FormGrid>
          <FormGrid cols={3}>
            <Field label="Taux nominal (%)" required hint="Taux annuel hors assurance">
              <Input type="number" step={0.01} min={0} value={values.interest_rate ?? ''} onChange={(e) => setNumber('interest_rate', e.target.value)} placeholder="3.50" required />
            </Field>
            <Field label="Assurance (%)">
              <Input type="number" step={0.01} min={0} value={values.insurance_rate ?? ''} onChange={(e) => setNumber('insurance_rate', e.target.value)} placeholder="0.30" />
            </Field>
            <Field label="Durée (mois)" required>
              <Input type="number" min={1} max={480} value={values.duration_months ?? ''} onChange={(e) => setNumber('duration_months', e.target.value)} placeholder="240" required />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Différé">
          <FormGrid>
            <Field label="Type de différé">
              <Select value={values.deferral_type} onChange={(e) => set('deferral_type', e.target.value)}>
                <option value="none">Aucun</option>
                <option value="partial">Partiel (intérêts seulement)</option>
                <option value="total">Total (aucun paiement)</option>
              </Select>
            </Field>
            <Field label="Durée différé (mois)">
              <Input type="number" min={0} max={60} value={values.deferral_months ?? ''} onChange={(e) => setNumber('deferral_months', e.target.value)} placeholder="0" disabled={values.deferral_type === 'none'} />
            </Field>
          </FormGrid>
        </FormSection>

        {/* Preview mensualité */}
        {previewPMT !== null && (
          <div className="bg-accent-muted border border-accent/20 rounded-lg px-4 py-3 text-sm">
            <span className="text-secondary">Mensualité estimée (hors assurance) : </span>
            <span className="text-accent font-medium financial-value">
              {previewPMT.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
          </div>
        )}

        <Field label="Notes">
          <Textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Conditions particulières, garanties…" />
        </Field>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Enregistrer le crédit</Button>
        </div>
      </form>
    </Modal>
  )
}
