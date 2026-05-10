'use client'

import { useRouter } from 'next/navigation'
import { Modal }  from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency, ASSET_CLASS_LABELS } from '@/lib/utils/format'
import type { AssetClass, FinancialEnvelope } from '@/types/database.types'

interface Props {
  open:      boolean
  onClose:   () => void
  envelopes: Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>[]
}

const INITIAL = {
  name:             '',
  asset_class:      'equity' as AssetClass,
  ticker:           '',
  isin:             '',
  envelope_id:      '',
  quantity:         undefined as number | undefined,
  average_price:    undefined as number | undefined,
  currency:         'EUR' as const,
  broker:           '',
  acquisition_date: '',
  notes:            '',
}

const ASSET_CLASSES: AssetClass[] = [
  'equity','etf','fund','crypto','scpi','reit','bond','metal',
  'private_equity','crowdfunding','private_debt','structured',
  'opci','siic','derivative','defi','other',
]

export function AddPositionForm({ open, onClose, envelopes }: Props) {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if (!v.name)                        return { error: 'Le nom de l\'instrument est requis' }
      if (!v.quantity || v.quantity <= 0) return { error: 'Quantité invalide' }
      if (v.average_price === undefined || v.average_price < 0)
        return { error: 'PRU invalide' }

      const res = await fetch('/api/portfolio/positions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument: {
            name:        v.name,
            asset_class: v.asset_class,
            ticker:      v.ticker.trim() || undefined,
            isin:        v.isin.trim()   || undefined,
            currency:    v.currency,
          },
          envelope_id:      v.envelope_id || undefined,
          quantity:         v.quantity,
          average_price:    v.average_price,
          currency:         v.currency,
          broker:           v.broker || undefined,
          acquisition_date: v.acquisition_date || undefined,
          notes:            v.notes || undefined,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  const investedTotal = values.quantity && values.average_price
    ? values.quantity * values.average_price
    : null

  return (
    <Modal open={open} onClose={onClose} title="Ajouter une position" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormSection title="Instrument">
          <Field label="Nom" required hint="ex: Apple Inc., iShares Core MSCI World, Bitcoin">
            <Input
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Apple Inc."
              required
            />
          </Field>
          <FormGrid>
            <Field label="Classe d'actif" required>
              <Select value={values.asset_class} onChange={(e) => set('asset_class', e.target.value as AssetClass)}>
                {ASSET_CLASSES.map((c) => (
                  <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Devise">
              <Select value={values.currency} onChange={(e) => set('currency', e.target.value as 'EUR')}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
                <option value="JPY">JPY</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </Select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Ticker" hint="ex: AAPL, IWDA, BTC-EUR">
              <Input
                value={values.ticker}
                onChange={(e) => set('ticker', e.target.value.toUpperCase())}
                placeholder="AAPL"
              />
            </Field>
            <Field label="ISIN" hint="ex: US0378331005">
              <Input
                value={values.isin}
                onChange={(e) => set('isin', e.target.value.toUpperCase())}
                placeholder="US0378331005"
              />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Position">
          <FormGrid>
            <Field label="Quantité" required hint="Décimales autorisées (crypto)">
              <Input
                type="number" step="any" min={0}
                value={values.quantity ?? ''}
                onChange={(e) => setNumber('quantity', e.target.value)}
                placeholder="10"
                required
              />
            </Field>
            <Field label="PRU" required hint="Prix de revient unitaire (devise position)">
              <Input
                type="number" step="any" min={0}
                value={values.average_price ?? ''}
                onChange={(e) => setNumber('average_price', e.target.value)}
                placeholder="150.00"
                required
              />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Enveloppe">
              <Select value={values.envelope_id} onChange={(e) => set('envelope_id', e.target.value)}>
                <option value="">— Détention directe —</option>
                {envelopes.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Courtier">
              <Input
                value={values.broker}
                onChange={(e) => set('broker', e.target.value)}
                placeholder="Trade Republic, Boursorama…"
              />
            </Field>
          </FormGrid>
          <Field label="Date d'acquisition">
            <Input
              type="date"
              value={values.acquisition_date}
              onChange={(e) => set('acquisition_date', e.target.value)}
            />
          </Field>

          {investedTotal !== null && (
            <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
              <span className="text-secondary">Capital investi : </span>
              <span className="text-primary font-medium financial-value">
                {formatCurrency(investedTotal, values.currency)}
              </span>
            </div>
          )}
        </FormSection>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Stratégie, contexte d'achat…"
          />
        </Field>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Ajouter la position</Button>
        </div>
      </form>
    </Modal>
  )
}
