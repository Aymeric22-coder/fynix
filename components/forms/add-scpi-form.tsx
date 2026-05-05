'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid, FormSection } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'

interface InitialData {
  id:                  string
  name:                string
  scpi_name:           string
  holding_mode:        string
  envelope_name:       string | null
  nb_shares:           number
  subscription_price:  number | null
  current_share_price: number | null
  withdrawal_price:    number | null
  distribution_rate:   number | null
  acquisition_date:    string | null
}

interface Props {
  open:         boolean
  onClose:      () => void
  initialData?: InitialData
}

const INITIAL = {
  name:              '',
  scpi_name:         '',
  holding_mode:      'direct',
  envelope_name:     '',
  nb_shares:         undefined as number | undefined,
  subscription_price:undefined as number | undefined,
  current_share_price:undefined as number | undefined,
  withdrawal_price:  undefined as number | undefined,
  distribution_rate: undefined as number | undefined,
  acquisition_date:  '',
}

export function AddScpiForm({ open, onClose, initialData }: Props) {
  const router = useRouter()

  const isEdit = !!initialData

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          name:               initialData.name,
          scpi_name:          initialData.scpi_name,
          holding_mode:       initialData.holding_mode,
          envelope_name:      initialData.envelope_name ?? '',
          nb_shares:          initialData.nb_shares as number | undefined,
          subscription_price: initialData.subscription_price  ?? undefined as number | undefined,
          current_share_price:initialData.current_share_price ?? undefined as number | undefined,
          withdrawal_price:   initialData.withdrawal_price    ?? undefined as number | undefined,
          distribution_rate:  initialData.distribution_rate   ?? undefined as number | undefined,
          acquisition_date:   initialData.acquisition_date    ?? '',
        }
      : INITIAL,
    async onSubmit(v) {
      if (!v.name || !v.scpi_name || !v.nb_shares)
        return { error: 'Nom, SCPI et nombre de parts sont requis' }

      const url    = isEdit ? `/api/scpi/${initialData!.id}` : '/api/scpi'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:               v.name,
          scpi_name:          v.scpi_name,
          holding_mode:       v.holding_mode,
          envelope_name:      v.envelope_name || null,
          nb_shares:          v.nb_shares,
          subscription_price: v.subscription_price  ?? null,
          current_share_price:v.current_share_price ?? null,
          withdrawal_price:   v.withdrawal_price    ?? null,
          distribution_rate:  v.distribution_rate   ?? null,
          acquisition_date:   v.acquisition_date    || null,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  const investedTotal = values.nb_shares && values.subscription_price
    ? values.nb_shares * values.subscription_price : null
  const currentTotal  = values.nb_shares && (values.withdrawal_price ?? values.current_share_price)
    ? values.nb_shares * (values.withdrawal_price ?? values.current_share_price ?? 0) : null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier la SCPI' : 'Ajouter une SCPI'} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormSection>
          <Field label="Nom d'affichage" required hint="Nom libre pour retrouver la ligne facilement">
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ex : SCPI Corum Origin" required />
          </Field>
          <Field label="Nom officiel de la SCPI" required>
            <Input value={values.scpi_name} onChange={(e) => set('scpi_name', e.target.value)} placeholder="Corum Origin" required />
          </Field>
        </FormSection>

        <FormSection title="Mode de détention">
          <FormGrid>
            <Field label="Détention via">
              <Select value={values.holding_mode} onChange={(e) => set('holding_mode', e.target.value)}>
                <option value="direct">Direct</option>
                <option value="assurance_vie">Assurance Vie</option>
                <option value="sci">SCI</option>
                <option value="other">Autre</option>
              </Select>
            </Field>
            <Field label="Nom du contrat / SCI" hint="Si détention indirecte">
              <Input value={values.envelope_name} onChange={(e) => set('envelope_name', e.target.value)} placeholder="Lucya Cardif" disabled={values.holding_mode === 'direct'} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Parts & valorisation">
          <Field label="Nombre de parts" required>
            <Input type="number" step="any" min={0} value={values.nb_shares ?? ''} onChange={(e) => setNumber('nb_shares', e.target.value)} placeholder="100" required />
          </Field>
          <FormGrid>
            <Field label="Prix de souscription moyen (€/part)" hint="PRU">
              <Input type="number" step="0.01" min={0} value={values.subscription_price ?? ''} onChange={(e) => setNumber('subscription_price', e.target.value)} placeholder="1 000.00" />
            </Field>
            <Field label="Valeur de retrait actuelle (€/part)">
              <Input type="number" step="0.01" min={0} value={values.withdrawal_price ?? ''} onChange={(e) => setNumber('withdrawal_price', e.target.value)} placeholder="980.00" />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Valeur de part DVM (€)" hint="Dernière valeur publiée">
              <Input type="number" step="0.01" min={0} value={values.current_share_price ?? ''} onChange={(e) => setNumber('current_share_price', e.target.value)} placeholder="1 020.00" />
            </Field>
            <Field label="Taux de distribution (%)" hint="TDVM annuel">
              <Input type="number" step="0.01" min={0} max={20} value={values.distribution_rate ?? ''} onChange={(e) => setNumber('distribution_rate', e.target.value)} placeholder="4.50" />
            </Field>
          </FormGrid>
          <Field label="Date d'acquisition">
            <Input type="date" value={values.acquisition_date} onChange={(e) => set('acquisition_date', e.target.value)} />
          </Field>

          {(investedTotal !== null || currentTotal !== null) && (
            <div className="grid grid-cols-2 gap-3">
              {investedTotal !== null && (
                <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
                  <p className="text-xs text-secondary mb-1">Total investi</p>
                  <p className="text-primary font-medium financial-value">{formatCurrency(investedTotal, 'EUR', { compact: true })}</p>
                </div>
              )}
              {currentTotal !== null && (
                <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
                  <p className="text-xs text-secondary mb-1">Valeur actuelle</p>
                  <p className="text-accent font-medium financial-value">{formatCurrency(currentTotal, 'EUR', { compact: true })}</p>
                </div>
              )}
            </div>
          )}
        </FormSection>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Ajouter la SCPI'}</Button>
        </div>
      </form>
    </Modal>
  )
}
