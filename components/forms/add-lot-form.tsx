'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'

interface InitialData {
  id:             string
  name:           string
  lot_type:       string | null
  surface_m2:     number | null
  status:         string
  rent_amount:    number | null
  charges_amount: number | null
  tenant_name:    string | null
  lease_start_date:    string | null
  lease_end_date:      string | null
}

interface Props {
  open:         boolean
  onClose:      () => void
  propertyId:   string
  initialData?: InitialData
}

const INITIAL = {
  name:            '',
  lot_type:        'apartment' as string,
  surface_m2:      undefined as number | undefined,
  status:          'vacant'  as string,
  rent_amount:     undefined as number | undefined,
  charges_amount:  0         as number,
  tenant_name:     '',
  lease_start_date:     '',
  lease_end_date:       '',
}

export function AddLotForm({ open, onClose, propertyId, initialData }: Props) {
  const router = useRouter()

  const isEdit = !!initialData

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          name:           initialData.name,
          lot_type:       initialData.lot_type       ?? 'apartment',
          surface_m2:     initialData.surface_m2     ?? undefined as number | undefined,
          status:         initialData.status,
          rent_amount:    initialData.rent_amount     ?? undefined as number | undefined,
          charges_amount: initialData.charges_amount  ?? 0,
          tenant_name:    initialData.tenant_name     ?? '',
          lease_start_date:    initialData.lease_start_date     ?? '',
          lease_end_date:      initialData.lease_end_date       ?? '',
        }
      : INITIAL,
    async onSubmit(v) {
      if (!v.name) return { error: 'Le nom du lot est requis' }

      const url    = isEdit
        ? `/api/real-estate/${propertyId}/lots/${initialData!.id}`
        : `/api/real-estate/${propertyId}/lots`
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:           v.name,
          lot_type:       v.lot_type       || null,
          surface_m2:     v.surface_m2     ?? null,
          status:         v.status,
          rent_amount:    v.rent_amount    ?? null,
          charges_amount: v.charges_amount ?? 0,
          tenant_name:    v.tenant_name    || null,
          lease_start_date:    v.lease_start_date    || null,
          lease_end_date:      v.lease_end_date      || null,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  const isRented = values.status === 'rented'
  const cashflow = isRented && values.rent_amount
    ? values.rent_amount - (values.charges_amount ?? 0)
    : null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier le lot' : 'Ajouter un lot'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Nom du lot" required>
          <Input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ex : Appartement T2, Garage n°3"
            required
          />
        </Field>

        <FormGrid>
          <Field label="Type">
            <Select value={values.lot_type} onChange={(e) => set('lot_type', e.target.value)}>
              <option value="apartment">Appartement</option>
              <option value="house">Maison</option>
              <option value="garage">Garage / Parking</option>
              <option value="commercial">Local commercial</option>
              <option value="studio">Studio</option>
              <option value="other">Autre</option>
            </Select>
          </Field>
          <Field label="Surface (m²)">
            <Input
              type="number" step={0.1} min={0}
              value={values.surface_m2 ?? ''}
              onChange={(e) => setNumber('surface_m2', e.target.value)}
              placeholder="35"
            />
          </Field>
        </FormGrid>

        <Field label="Statut">
          <Select value={values.status} onChange={(e) => set('status', e.target.value)}>
            <option value="vacant">Vacant</option>
            <option value="rented">Loué</option>
            <option value="owner_occupied">Occupé par le propriétaire</option>
            <option value="works">En travaux</option>
          </Select>
        </Field>

        {isRented && (
          <>
            <FormGrid>
              <Field label="Loyer mensuel (€)">
                <Input
                  type="number" step={0.01} min={0}
                  value={values.rent_amount ?? ''}
                  onChange={(e) => setNumber('rent_amount', e.target.value)}
                  placeholder="750"
                />
              </Field>
              <Field label="Charges locataire (€/mois)">
                <Input
                  type="number" step={0.01} min={0}
                  value={values.charges_amount ?? ''}
                  onChange={(e) => setNumber('charges_amount', e.target.value)}
                  placeholder="80"
                />
              </Field>
            </FormGrid>

            {cashflow !== null && (
              <div className="bg-accent-muted border border-accent/20 rounded-lg px-4 py-3 text-sm">
                <span className="text-secondary">Cash-flow net mensuel : </span>
                <span className="text-accent font-medium financial-value">
                  {formatCurrency(cashflow, 'EUR')}
                </span>
              </div>
            )}

            <Field label="Nom du locataire">
              <Input
                value={values.tenant_name}
                onChange={(e) => set('tenant_name', e.target.value)}
                placeholder="Jean Dupont"
              />
            </Field>
            <FormGrid>
              <Field label="Début du bail">
                <Input type="date" value={values.lease_start_date} onChange={(e) => set('lease_start_date', e.target.value)} />
              </Field>
              <Field label="Fin du bail">
                <Input type="date" value={values.lease_end_date} onChange={(e) => set('lease_end_date', e.target.value)} />
              </Field>
            </FormGrid>
          </>
        )}

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Ajouter le lot'}</Button>
        </div>
      </form>
    </Modal>
  )
}
