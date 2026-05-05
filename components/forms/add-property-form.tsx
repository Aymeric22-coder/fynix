'use client'

import { useRouter } from 'next/navigation'
import { Modal }     from '@/components/ui/modal'
import { Button }    from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { useForm }   from '@/hooks/use-form'

interface Props { open: boolean; onClose: () => void }

const INITIAL = {
  name:             '',
  property_type:    'apartment',
  address_line1:    '',
  address_city:     '',
  address_zip:      '',
  purchase_price:   undefined as number | undefined,
  purchase_fees:    undefined as number | undefined,
  works_amount:     undefined as number | undefined,
  surface_m2:       undefined as number | undefined,
  construction_year:undefined as number | undefined,
  dpe_class:        '',
  fiscal_regime:    '',
  is_multi_lot:     false,
  acquisition_date: '',
  notes:            '',
}

export function AddPropertyForm({ open, onClose }: Props) {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      const res = await fetch('/api/real-estate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             v.name,
          property_type:    v.property_type,
          address_line1:    v.address_line1  || null,
          address_city:     v.address_city   || null,
          address_zip:      v.address_zip    || null,
          purchase_price:   v.purchase_price  ?? null,
          purchase_fees:    v.purchase_fees   ?? 0,
          works_amount:     v.works_amount    ?? 0,
          surface_m2:       v.surface_m2      ?? null,
          construction_year:v.construction_year ?? null,
          dpe_class:        v.dpe_class       || null,
          fiscal_regime:    v.fiscal_regime   || null,
          is_multi_lot:     v.is_multi_lot,
          acquisition_date: v.acquisition_date || null,
          notes:            v.notes           || null,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() {
      reset(); onClose()
      router.refresh()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un bien immobilier" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identification */}
        <FormSection>
          <Field label="Nom du bien" required>
            <Input
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="ex : Appartement Lyon 3ème"
              required
            />
          </Field>
          <FormGrid>
            <Field label="Type de bien" required>
              <Select value={values.property_type} onChange={(e) => set('property_type', e.target.value)}>
                <option value="apartment">Appartement</option>
                <option value="house">Maison</option>
                <option value="garage">Garage / Parking</option>
                <option value="building">Immeuble</option>
                <option value="commercial">Local commercial</option>
                <option value="land">Terrain</option>
                <option value="other">Autre</option>
              </Select>
            </Field>
            <Field label="Date d'acquisition">
              <Input type="date" value={values.acquisition_date} onChange={(e) => set('acquisition_date', e.target.value)} />
            </Field>
          </FormGrid>
        </FormSection>

        {/* Adresse */}
        <FormSection title="Adresse">
          <Field label="Adresse">
            <Input value={values.address_line1} onChange={(e) => set('address_line1', e.target.value)} placeholder="12 rue de la Paix" />
          </Field>
          <FormGrid>
            <Field label="Code postal">
              <Input value={values.address_zip} onChange={(e) => set('address_zip', e.target.value)} placeholder="75001" />
            </Field>
            <Field label="Ville">
              <Input value={values.address_city} onChange={(e) => set('address_city', e.target.value)} placeholder="Paris" />
            </Field>
          </FormGrid>
        </FormSection>

        {/* Prix */}
        <FormSection title="Prix & investissement">
          <FormGrid cols={3}>
            <Field label="Prix net vendeur (€)" hint="Hors frais">
              <Input type="number" min={0} value={values.purchase_price ?? ''} onChange={(e) => setNumber('purchase_price', e.target.value)} placeholder="200 000" />
            </Field>
            <Field label="Frais de notaire (€)">
              <Input type="number" min={0} value={values.purchase_fees ?? ''} onChange={(e) => setNumber('purchase_fees', e.target.value)} placeholder="16 000" />
            </Field>
            <Field label="Travaux (€)">
              <Input type="number" min={0} value={values.works_amount ?? ''} onChange={(e) => setNumber('works_amount', e.target.value)} placeholder="0" />
            </Field>
          </FormGrid>
        </FormSection>

        {/* Caractéristiques */}
        <FormSection title="Caractéristiques">
          <FormGrid cols={3}>
            <Field label="Surface (m²)">
              <Input type="number" min={0} step={0.1} value={values.surface_m2 ?? ''} onChange={(e) => setNumber('surface_m2', e.target.value)} placeholder="65" />
            </Field>
            <Field label="Année construction">
              <Input type="number" min={1800} max={2030} value={values.construction_year ?? ''} onChange={(e) => setNumber('construction_year', e.target.value)} placeholder="1990" />
            </Field>
            <Field label="DPE">
              <Select value={values.dpe_class} onChange={(e) => set('dpe_class', e.target.value)}>
                <option value="">—</option>
                {['A','B','C','D','E','F','G'].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Régime fiscal">
              <Select value={values.fiscal_regime} onChange={(e) => set('fiscal_regime', e.target.value)}>
                <option value="">Non défini</option>
                <option value="lmnp_reel">LMNP Réel</option>
                <option value="lmnp_micro">LMNP Micro-BIC</option>
                <option value="lmp">LMP</option>
                <option value="sci_is">SCI IS</option>
                <option value="sci_ir">SCI IR</option>
                <option value="foncier_nu">Foncier nu</option>
                <option value="foncier_micro">Micro-foncier</option>
              </Select>
            </Field>
            <Field label="Immeuble multi-lots">
              <Select value={String(values.is_multi_lot)} onChange={(e) => set('is_multi_lot', e.target.value === 'true')}>
                <option value="false">Non</option>
                <option value="true">Oui — immeuble de rapport</option>
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        <Field label="Notes">
          <Textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Observations, contexte d'acquisition…" />
        </Field>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>Ajouter le bien</Button>
        </div>
      </form>
    </Modal>
  )
}
