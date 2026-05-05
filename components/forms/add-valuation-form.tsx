'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  open:        boolean
  onClose:     () => void
  propertyId:  string
  surfaceM2?:  number | null
}

const INITIAL = {
  valuation_date: new Date().toISOString().split('T')[0] as string,
  value:          undefined as number | undefined,
  price_per_m2:   undefined as number | undefined,
  source:         'manual' as string,
  confidence:     'medium' as string,
  notes:          '',
}

const SOURCE_LABELS: Record<string, string> = {
  manual:    'Estimation manuelle',
  notary:    'Notaire / Agence',
  dvf:       'DVF / Données de vente',
  meilleursagents: 'MeilleursAgents',
  other:     'Autre source',
}

export function AddValuationForm({ open, onClose, propertyId, surfaceM2 }: Props) {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      if (!v.value || !v.valuation_date)
        return { error: 'Valeur et date sont requis' }

      const res = await fetch(`/api/real-estate/${propertyId}/valuations`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuation_date: v.valuation_date,
          value:          v.value,
          price_per_m2:   v.price_per_m2  ?? null,
          source:         v.source,
          confidence:     v.confidence,
          notes:          v.notes || null,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  // Auto-calcul prix/m² si surface connue
  const impliedPricePerM2 = surfaceM2 && values.value
    ? Math.round(values.value / surfaceM2)
    : null

  // Auto-calcul valeur totale depuis prix/m²
  const impliedValue = surfaceM2 && values.price_per_m2
    ? surfaceM2 * values.price_per_m2
    : null

  return (
    <Modal open={open} onClose={onClose} title="Ajouter une estimation" size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Date d'estimation" required>
          <Input
            type="date"
            value={values.valuation_date}
            onChange={(e) => set('valuation_date', e.target.value)}
            required
          />
        </Field>

        <FormGrid>
          <Field label="Valeur du bien (€)" required>
            <Input
              type="number" step={1000} min={0}
              value={values.value ?? ''}
              onChange={(e) => {
                setNumber('value', e.target.value)
                // Reset price_per_m2 if user enters value directly
              }}
              placeholder="220 000"
              required
            />
          </Field>
          {surfaceM2 && (
            <Field label="Prix / m² (€)" hint={surfaceM2 ? `Surface : ${surfaceM2} m²` : undefined}>
              <Input
                type="number" step={10} min={0}
                value={values.price_per_m2 ?? ''}
                onChange={(e) => {
                  setNumber('price_per_m2', e.target.value)
                  if (e.target.value && surfaceM2) {
                    setNumber('value', String(Math.round(Number(e.target.value) * surfaceM2)))
                  }
                }}
                placeholder="3 400"
              />
            </Field>
          )}
        </FormGrid>

        {/* Confirmation croisée valeur ↔ m² */}
        {impliedPricePerM2 !== null && !values.price_per_m2 && (
          <p className="text-xs text-secondary">
            → Prix au m² implicite : <span className="text-primary font-medium">{formatCurrency(impliedPricePerM2, 'EUR')} / m²</span>
          </p>
        )}
        {impliedValue !== null && !values.value && (
          <p className="text-xs text-secondary">
            → Valeur totale implicite : <span className="text-primary font-medium">{formatCurrency(impliedValue, 'EUR', { compact: true })}</span>
          </p>
        )}

        <FormGrid>
          <Field label="Source">
            <Select value={values.source} onChange={(e) => set('source', e.target.value)}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fiabilité">
            <Select value={values.confidence} onChange={(e) => set('confidence', e.target.value)}>
              <option value="high">Élevée</option>
              <option value="medium">Moyenne</option>
              <option value="low">Faible</option>
            </Select>
          </Field>
        </FormGrid>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Enregistrer l'estimation</Button>
        </div>
      </form>
    </Modal>
  )
}
