'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid, FormSection } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  open:      boolean
  onClose:   () => void
  envelopes: FinancialEnvelope[]
}

const INITIAL = {
  name:              '',
  ticker:            '',
  amount_per_period: undefined as number | undefined,
  frequency:         'monthly' as string,
  envelope_id:       '',
  start_date:        new Date().toISOString().split('T')[0] as string,
  end_date:          '',
  occurrences_count: undefined as number | undefined,
}

const FREQ_OPTIONS = [
  { value: 'weekly',      label: 'Hebdomadaire' },
  { value: 'biweekly',   label: 'Bihebdomadaire' },
  { value: 'monthly',    label: 'Mensuel' },
  { value: 'quarterly',  label: 'Trimestriel' },
]

const FREQ_PERIOD: Record<string, number> = {
  weekly: 52, biweekly: 26, monthly: 12, quarterly: 4,
}

export function AddDcaPlanForm({ open, onClose, envelopes }: Props) {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if (!v.name || !v.ticker || !v.amount_per_period || !v.start_date)
        return { error: 'Nom, ticker, montant et date de début sont requis' }

      const res = await fetch('/api/dca/plans', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:              v.name,
          ticker:            v.ticker.trim().toUpperCase(),
          amount_per_period: v.amount_per_period,
          frequency:         v.frequency,
          envelope_id:       v.envelope_id || null,
          start_date:        v.start_date,
          end_date:          v.end_date || null,
          occurrences_count: v.occurrences_count || null,
          currency:          'EUR',
          is_active:         true,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  // Projections annuelles
  const annualOccurrences = FREQ_PERIOD[values.frequency] ?? 12
  const annualAmount = values.amount_per_period
    ? values.amount_per_period * annualOccurrences
    : null

  // Nombre d'occurrences générées si end_date renseignée
  let estimatedOccurrences: number | null = null
  if (values.start_date && values.end_date) {
    const start = new Date(values.start_date)
    const end   = new Date(values.end_date)
    const days  = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    const periodDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30.44, quarterly: 91.31 }
    estimatedOccurrences = Math.max(0, Math.floor(days / (periodDays[values.frequency] ?? 30.44)))
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouveau plan DCA" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormSection>
          <Field label="Nom du plan" required>
            <Input
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="ex : ETF World mensuel"
              required
            />
          </Field>
          <FormGrid>
            <Field label="Ticker" required hint="ex : CW8, BTC-EUR, AAPL">
              <Input
                value={values.ticker}
                onChange={(e) => set('ticker', e.target.value.toUpperCase())}
                placeholder="CW8"
                className="font-mono"
                required
              />
            </Field>
            <Field label="Enveloppe fiscale">
              <Select value={values.envelope_id} onChange={(e) => set('envelope_id', e.target.value)}>
                <option value="">— Aucune —</option>
                {envelopes.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Paramètres du plan">
          <FormGrid>
            <Field label="Montant par occurrence (€)" required>
              <Input
                type="number"
                step="any"
                min={1}
                value={values.amount_per_period ?? ''}
                onChange={(e) => setNumber('amount_per_period', e.target.value)}
                placeholder="100"
                required
              />
            </Field>
            <Field label="Fréquence" required>
              <Select value={values.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {FREQ_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>

          {/* Projection annuelle */}
          {annualAmount !== null && (
            <div className="bg-accent-muted border border-accent/20 rounded-lg px-4 py-3 text-sm">
              <span className="text-secondary">Investissement annuel estimé : </span>
              <span className="text-accent font-medium financial-value">
                {formatCurrency(annualAmount, 'EUR')}
              </span>
              <span className="text-muted ml-1">({annualOccurrences} occurrences)</span>
            </div>
          )}
        </FormSection>

        <FormSection title="Planification">
          <FormGrid>
            <Field label="Date de début" required>
              <Input
                type="date"
                value={values.start_date}
                onChange={(e) => set('start_date', e.target.value)}
                required
              />
            </Field>
            <Field label="Date de fin" hint="Laisser vide pour indéfini">
              <Input
                type="date"
                value={values.end_date}
                onChange={(e) => set('end_date', e.target.value)}
                min={values.start_date}
              />
            </Field>
          </FormGrid>

          <Field label="Nombre d'occurrences max" hint="Alternative à la date de fin — laisser vide pour illimité">
            <Input
              type="number"
              min={1}
              max={600}
              value={values.occurrences_count ?? ''}
              onChange={(e) => setNumber('occurrences_count', e.target.value)}
              placeholder="ex : 24"
              disabled={!!values.end_date}
            />
          </Field>

          {estimatedOccurrences !== null && (
            <p className="text-xs text-secondary">
              → <span className="text-primary font-medium">{estimatedOccurrences}</span> occurrences générées sur la période
              {values.amount_per_period && (
                <span> · total {formatCurrency(estimatedOccurrences * values.amount_per_period, 'EUR', { compact: true })}</span>
              )}
            </p>
          )}
        </FormSection>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Créer le plan</Button>
        </div>
      </form>
    </Modal>
  )
}
