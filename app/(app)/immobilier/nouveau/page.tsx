'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button }    from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { useForm }   from '@/hooks/use-form'

const INITIAL = {
  name:              '',
  property_type:     'apartment',
  address_line1:     '',
  address_city:      '',
  address_zip:       '',
  purchase_price:    undefined as number | undefined,
  purchase_fees:     undefined as number | undefined,
  works_amount:      undefined as number | undefined,
  surface_m2:        undefined as number | undefined,
  construction_year: undefined as number | undefined,
  dpe_class:         '',
  fiscal_regime:     '',
  is_multi_lot:      false,
  acquisition_date:  '',
  notes:             '',
}

export default function NouveauBienPage() {
  const router = useRouter()

  const { values, set, setNumber, loading, error, handleSubmit } = useForm({
    initialValues: INITIAL,
    async onSubmit(v) {
      const res = await fetch('/api/real-estate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:              v.name,
          property_type:     v.property_type,
          address_line1:     v.address_line1   || null,
          address_city:      v.address_city    || null,
          address_zip:       v.address_zip     || null,
          purchase_price:    v.purchase_price   ?? null,
          purchase_fees:     v.purchase_fees    ?? 0,
          works_amount:      v.works_amount     ?? 0,
          surface_m2:        v.surface_m2       ?? null,
          construction_year: v.construction_year ?? null,
          dpe_class:         v.dpe_class        || null,
          fiscal_regime:     v.fiscal_regime    || null,
          is_multi_lot:      v.is_multi_lot,
          acquisition_date:  v.acquisition_date || null,
          notes:             v.notes            || null,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { router.push('/immobilier') },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Navigation */}
      <Link
        href="/immobilier"
        className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit"
      >
        <ArrowLeft size={14} />
        Retour à l'immobilier
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-primary">Ajouter un bien immobilier</h1>
        <p className="text-sm text-secondary mt-1">
          Renseignez les informations de votre bien pour démarrer le suivi.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identification */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Identification</h2>
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
              <Input
                type="date"
                value={values.acquisition_date}
                onChange={(e) => set('acquisition_date', e.target.value)}
              />
            </Field>
          </FormGrid>
        </div>

        {/* Adresse */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Adresse</h2>
          <Field label="Adresse">
            <Input
              value={values.address_line1}
              onChange={(e) => set('address_line1', e.target.value)}
              placeholder="12 rue de la Paix"
            />
          </Field>
          <FormGrid>
            <Field label="Code postal">
              <Input
                value={values.address_zip}
                onChange={(e) => set('address_zip', e.target.value)}
                placeholder="75001"
              />
            </Field>
            <Field label="Ville">
              <Input
                value={values.address_city}
                onChange={(e) => set('address_city', e.target.value)}
                placeholder="Paris"
              />
            </Field>
          </FormGrid>
        </div>

        {/* Prix & investissement */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Prix & investissement</h2>
          <FormGrid cols={3}>
            <Field label="Prix net vendeur (€)" hint="Hors frais">
              <Input
                type="number" min={0}
                value={values.purchase_price ?? ''}
                onChange={(e) => setNumber('purchase_price', e.target.value)}
                placeholder="200 000"
              />
            </Field>
            <Field label="Frais de notaire (€)">
              <Input
                type="number" min={0}
                value={values.purchase_fees ?? ''}
                onChange={(e) => setNumber('purchase_fees', e.target.value)}
                placeholder="16 000"
              />
            </Field>
            <Field label="Travaux (€)">
              <Input
                type="number" min={0}
                value={values.works_amount ?? ''}
                onChange={(e) => setNumber('works_amount', e.target.value)}
                placeholder="0"
              />
            </Field>
          </FormGrid>

          {/* Coût total d'acquisition */}
          {(values.purchase_price || values.purchase_fees || values.works_amount) && (
            <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
              <span className="text-secondary">Coût total d'acquisition : </span>
              <span className="text-primary font-medium financial-value">
                {(
                  (values.purchase_price ?? 0) +
                  (values.purchase_fees  ?? 0) +
                  (values.works_amount   ?? 0)
                ).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €
              </span>
            </div>
          )}
        </div>

        {/* Caractéristiques */}
        <div className="card p-6 space-y-5">
          <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Caractéristiques</h2>
          <FormGrid cols={3}>
            <Field label="Surface (m²)">
              <Input
                type="number" min={0} step={0.1}
                value={values.surface_m2 ?? ''}
                onChange={(e) => setNumber('surface_m2', e.target.value)}
                placeholder="65"
              />
            </Field>
            <Field label="Année construction">
              <Input
                type="number" min={1800} max={2030}
                value={values.construction_year ?? ''}
                onChange={(e) => setNumber('construction_year', e.target.value)}
                placeholder="1990"
              />
            </Field>
            <Field label="DPE">
              <Select value={values.dpe_class} onChange={(e) => set('dpe_class', e.target.value)}>
                <option value="">—</option>
                {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
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
              <Select
                value={String(values.is_multi_lot)}
                onChange={(e) => set('is_multi_lot', e.target.value === 'true')}
              >
                <option value="false">Non</option>
                <option value="true">Oui — immeuble de rapport</option>
              </Select>
            </Field>
          </FormGrid>
        </div>

        {/* Notes */}
        <div className="card p-6">
          <Field label="Notes">
            <Textarea
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Observations, contexte d'acquisition…"
              rows={3}
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-4 py-3 rounded-lg">{error}</p>
        )}

        <div className="flex justify-end gap-3 pb-8">
          <Button variant="secondary" type="button" onClick={() => router.push('/immobilier')}>
            Annuler
          </Button>
          <Button type="submit" loading={loading}>
            Enregistrer le bien
          </Button>
        </div>
      </form>
    </div>
  )
}
