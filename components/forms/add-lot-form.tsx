'use client'

import { useRouter } from 'next/navigation'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'
import {
  ShortTermLotFields,
  type ShortTermLotFieldsValues,
} from '@/components/real-estate/short-term-lot-fields'
import type {
  RentalType,
  TourismClassification,
} from '@/types/database.types'

type ShortTermSeasonality = ShortTermLotFieldsValues['seasonality_coefficients']

interface InitialData {
  id:             string
  name:           string
  lot_type:       string | null
  surface_m2:     number | null
  status:         string
  rent_amount:    number | null
  charges_amount: number | null
  market_rent:    number | null
  tenant_name:    string | null
  lease_start_date:    string | null
  lease_end_date:      string | null
  // ── Migration 042 — Courte durée (optionnelles) ──
  rental_type?:                RentalType | null
  nightly_rate_low?:           number | null
  nightly_rate_mid?:           number | null
  nightly_rate_high?:          number | null
  occupancy_rate_pct?:         number | null
  cleaning_fee_per_stay?:      number | null
  avg_stay_nights?:            number | null
  platform_airbnb_pct?:        number | null
  platform_booking_pct?:       number | null
  platform_airbnb_mix_pct?:    number | null
  platform_booking_mix_pct?:   number | null
  platform_direct_mix_pct?:    number | null
  concierge_fee_pct?:          number | null
  cleaning_cost_per_stay?:     number | null
  linen_cost_per_stay?:        number | null
  tourism_classification?:     TourismClassification | null
  seasonality_coefficients?:   ShortTermSeasonality
}

interface Props {
  open:         boolean
  onClose:      () => void
  propertyId:   string
  /** Type d'usage du bien — preselectionne `short_term` pour les lots saisonniers. */
  defaultRentalType?: RentalType
  initialData?: InitialData
}

const INITIAL = {
  name:            '',
  lot_type:        'apartment' as string,
  surface_m2:      undefined as number | undefined,
  status:          'vacant'  as string,
  rent_amount:     undefined as number | undefined,
  charges_amount:  0         as number,
  market_rent:     undefined as number | undefined,
  tenant_name:     '',
  lease_start_date:     '',
  lease_end_date:       '',
  rental_type:    'long_term' as RentalType,
  nightly_rate_low:         undefined as number | undefined,
  nightly_rate_mid:         undefined as number | undefined,
  nightly_rate_high:        undefined as number | undefined,
  occupancy_rate_pct:       70   as number | undefined,
  cleaning_fee_per_stay:    undefined as number | undefined,
  avg_stay_nights:          3    as number | undefined,
  platform_airbnb_pct:      15   as number | undefined,
  platform_booking_pct:     15   as number | undefined,
  platform_airbnb_mix_pct:  60   as number | undefined,
  platform_booking_mix_pct: 30   as number | undefined,
  platform_direct_mix_pct:  10   as number | undefined,
  concierge_fee_pct:        undefined as number | undefined,
  cleaning_cost_per_stay:   undefined as number | undefined,
  linen_cost_per_stay:      undefined as number | undefined,
  tourism_classification:   '' as TourismClassification | '',
  seasonality_coefficients: null as ShortTermSeasonality,
}

export function AddLotForm({ open, onClose, propertyId, initialData, defaultRentalType }: Props) {
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
          market_rent:    initialData.market_rent     ?? undefined as number | undefined,
          tenant_name:    initialData.tenant_name     ?? '',
          lease_start_date:    initialData.lease_start_date     ?? '',
          lease_end_date:      initialData.lease_end_date       ?? '',
          rental_type:    (initialData.rental_type    ?? 'long_term') as RentalType,
          nightly_rate_low:         initialData.nightly_rate_low      ?? undefined as number | undefined,
          nightly_rate_mid:         initialData.nightly_rate_mid      ?? undefined as number | undefined,
          nightly_rate_high:        initialData.nightly_rate_high     ?? undefined as number | undefined,
          occupancy_rate_pct:       initialData.occupancy_rate_pct    ?? 70,
          cleaning_fee_per_stay:    initialData.cleaning_fee_per_stay ?? undefined as number | undefined,
          avg_stay_nights:          initialData.avg_stay_nights       ?? 3,
          platform_airbnb_pct:      initialData.platform_airbnb_pct   ?? 15,
          platform_booking_pct:     initialData.platform_booking_pct  ?? 15,
          platform_airbnb_mix_pct:  initialData.platform_airbnb_mix_pct  ?? 60,
          platform_booking_mix_pct: initialData.platform_booking_mix_pct ?? 30,
          platform_direct_mix_pct:  initialData.platform_direct_mix_pct  ?? 10,
          concierge_fee_pct:        initialData.concierge_fee_pct        ?? undefined as number | undefined,
          cleaning_cost_per_stay:   initialData.cleaning_cost_per_stay   ?? undefined as number | undefined,
          linen_cost_per_stay:      initialData.linen_cost_per_stay      ?? undefined as number | undefined,
          tourism_classification:   (initialData.tourism_classification ?? '') as TourismClassification | '',
          seasonality_coefficients: initialData.seasonality_coefficients ?? null,
        }
      : { ...INITIAL, rental_type: defaultRentalType ?? INITIAL.rental_type },
    async onSubmit(v) {
      if (!v.name) return { error: 'Le nom du lot est requis' }
      if ((v.rental_type === 'short_term' || v.rental_type === 'mixed') && !v.nightly_rate_low) {
        return { error: 'Le tarif nuit basse saison est requis pour la courte durée' }
      }

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
          market_rent:    v.market_rent    ?? null,
          tenant_name:    v.tenant_name    || null,
          lease_start_date: v.lease_start_date || null,
          lease_end_date:   v.lease_end_date   || null,
          rental_type:    v.rental_type,
          // Champs courte duree (null si long_term)
          nightly_rate_low:         v.rental_type === 'long_term' ? null : v.nightly_rate_low ?? null,
          nightly_rate_mid:         v.rental_type === 'long_term' ? null : v.nightly_rate_mid ?? null,
          nightly_rate_high:        v.rental_type === 'long_term' ? null : v.nightly_rate_high ?? null,
          occupancy_rate_pct:       v.rental_type === 'long_term' ? null : v.occupancy_rate_pct ?? null,
          cleaning_fee_per_stay:    v.rental_type === 'long_term' ? null : v.cleaning_fee_per_stay ?? null,
          avg_stay_nights:          v.rental_type === 'long_term' ? null : v.avg_stay_nights ?? null,
          platform_airbnb_pct:      v.rental_type === 'long_term' ? null : v.platform_airbnb_pct ?? null,
          platform_booking_pct:     v.rental_type === 'long_term' ? null : v.platform_booking_pct ?? null,
          platform_airbnb_mix_pct:  v.rental_type === 'long_term' ? null : v.platform_airbnb_mix_pct ?? null,
          platform_booking_mix_pct: v.rental_type === 'long_term' ? null : v.platform_booking_mix_pct ?? null,
          platform_direct_mix_pct:  v.rental_type === 'long_term' ? null : v.platform_direct_mix_pct ?? null,
          concierge_fee_pct:        v.rental_type === 'long_term' ? null : v.concierge_fee_pct ?? null,
          cleaning_cost_per_stay:   v.rental_type === 'long_term' ? null : v.cleaning_cost_per_stay ?? null,
          linen_cost_per_stay:      v.rental_type === 'long_term' ? null : v.linen_cost_per_stay ?? null,
          tourism_classification:   v.rental_type === 'long_term' ? null : (v.tourism_classification || null),
          seasonality_coefficients: v.rental_type === 'long_term' ? null : (v.seasonality_coefficients ?? null),
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  const isRented      = values.status === 'rented'
  const isShortTerm   = values.rental_type === 'short_term'
  const isMixed       = values.rental_type === 'mixed'
  const showLongTerm  = isRented && (values.rental_type === 'long_term' || isMixed)
  const showShortTerm = isRented && (isShortTerm || isMixed)

  const cashflow = showLongTerm && values.rent_amount
    ? values.rent_amount - (values.charges_amount ?? 0)
    : null

  const modalSize = showShortTerm ? 'lg' : 'sm'

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier le lot' : 'Ajouter un lot'} size={modalSize}>
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
          <Field
            label="Type de location"
            hint="Mixte : 8 mois en longue durée + 4 mois en saisonnier par exemple."
          >
            <Select
              value={values.rental_type}
              onChange={(e) => set('rental_type', e.target.value as RentalType)}
            >
              <option value="long_term">Longue durée (loyer mensuel classique)</option>
              <option value="short_term">Courte durée (Airbnb / Booking)</option>
              <option value="mixed">Mixte (les deux)</option>
            </Select>
          </Field>
        )}

        {showLongTerm && (
          <>
            <FormGrid>
              <Field label="Loyer mensuel HC (€)">
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

            <Field
              label="Loyer de marché estimé (€/mois)"
              hint="Optionnel — utilisé pour détecter un bien sous-loué."
            >
              <Input
                type="number" step={0.01} min={0}
                value={values.market_rent ?? ''}
                onChange={(e) => setNumber('market_rent', e.target.value)}
                placeholder="800"
              />
            </Field>

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

        {showShortTerm && (
          <ShortTermLotFields
            values={{
              nightly_rate_low:         values.nightly_rate_low,
              nightly_rate_mid:         values.nightly_rate_mid,
              nightly_rate_high:        values.nightly_rate_high,
              occupancy_rate_pct:       values.occupancy_rate_pct,
              cleaning_fee_per_stay:    values.cleaning_fee_per_stay,
              avg_stay_nights:          values.avg_stay_nights,
              platform_airbnb_pct:      values.platform_airbnb_pct,
              platform_booking_pct:     values.platform_booking_pct,
              platform_airbnb_mix_pct:  values.platform_airbnb_mix_pct,
              platform_booking_mix_pct: values.platform_booking_mix_pct,
              platform_direct_mix_pct:  values.platform_direct_mix_pct,
              concierge_fee_pct:        values.concierge_fee_pct,
              cleaning_cost_per_stay:   values.cleaning_cost_per_stay,
              linen_cost_per_stay:      values.linen_cost_per_stay,
              tourism_classification:   values.tourism_classification,
              seasonality_coefficients: values.seasonality_coefficients,
            }}
            setValue={(k, v) => set(k as never, v as never)}
          />
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
