'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import type { IncentiveRow } from './incentive-tab'

/**
 * V13 — Monuments Historiques et Malraux restent ÉLIGIBLES en droit
 * (régimes ouverts), mais leur calcul de réduction n'est pas encore
 * branché dans le moteur (`buildIncentiveReductionPerYear` n'a pas de
 * case dédiée). Sélectionner l'une de ces options ne produirait aucun
 * effet sur la projection — option fantôme.
 *
 * Donc on garde les options dans la liste (cohérence avec les biens
 * existants déjà sauvegardés en MH/Malraux : l'affichage compact
 * read-only et l'edit du record persistent), mais on les marque
 * `disabled` avec un suffixe explicite pour empêcher toute nouvelle
 * sélection. La forme « (non pris en charge pour l'instant) » dit ce
 * que c'est : une fonctionnalité à venir, pas un dispositif fermé.
 */
const KIND_OPTIONS: Array<{ value: string; label: string; disabled?: boolean }> = [
  { value: 'pinel',                  label: 'Pinel (LF 2024)' },
  { value: 'pinel_plus',             label: 'Pinel+ (taux pleins)' },
  { value: 'denormandie',            label: 'Denormandie (ancien avec travaux)' },
  { value: 'loc_avantages',          label: "Loc'Avantages (convention ANAH)" },
  { value: 'monuments_historiques',  label: 'Monuments Historiques (non pris en charge pour l\'instant)', disabled: true },
  { value: 'malraux',                label: 'Malraux (non pris en charge pour l\'instant)',               disabled: true },
]

interface Props {
  propertyId: string
  existing:   IncentiveRow | null
  onDone?:    () => void
}

/**
 * Formulaire d'ajout / édition / suppression d'un dispositif fiscal
 * attaché à un bien. Affiche dynamiquement les champs requis selon `kind`.
 */
export function IncentiveForm({ propertyId, existing, onDone }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(!existing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // État du formulaire
  const [kind, setKind] = useState(existing?.kind ?? 'pinel_plus')
  const [durationYears,  setDurationYears]  = useState<number | ''>(existing?.duration_years ?? 9)
  const [zone, setZone] = useState(existing?.zone ?? 'A')
  const [startYear, setStartYear] = useState<number | ''>(
    existing?.start_year ?? new Date().getUTCFullYear(),
  )
  const [worksAmount, setWorksAmount] = useState<number | ''>(existing?.works_amount ?? '')
  const [classification, setClassification] = useState(existing?.classification ?? 'inscrit')
  const [occupancy, setOccupancy] = useState(existing?.occupancy ?? 'rented')
  const [conservationEndYear, setConservationEndYear] = useState<number | ''>(
    existing?.conservation_end_year ?? '',
  )
  const [conventionType, setConventionType] = useState(existing?.convention_type ?? 'loc2')
  const [conventionStart, setConventionStart] = useState(existing?.convention_start ?? '')
  const [conventionEnd, setConventionEnd] = useState(existing?.convention_end ?? '')
  const [marketRentAnnual, setMarketRentAnnual] = useState<number | ''>(
    existing?.market_rent_annual ?? '',
  )

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { kind }
      if (kind === 'pinel' || kind === 'pinel_plus' || kind === 'denormandie') {
        body.duration_years = durationYears === '' ? null : durationYears
        body.zone           = zone || null
        body.start_year     = startYear === '' ? null : startYear
        body.is_pinel_plus  = kind === 'pinel_plus'
        if (kind === 'denormandie') body.works_amount = worksAmount === '' ? null : worksAmount
      } else if (kind === 'loc_avantages') {
        body.convention_type    = conventionType
        body.convention_start   = conventionStart || null
        body.convention_end     = conventionEnd || null
        body.market_rent_annual = marketRentAnnual === '' ? null : marketRentAnnual
      } else if (kind === 'monuments_historiques' || kind === 'malraux') {
        body.classification        = classification
        body.occupancy             = occupancy
        body.works_amount          = worksAmount === '' ? null : worksAmount
        body.conservation_end_year = conservationEndYear === '' ? null : conservationEndYear
        body.start_year            = startYear === '' ? null : startYear
      }

      const res = await fetch(`/api/real-estate/${propertyId}/incentive`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      setEditing(false)
      router.refresh()
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce dispositif fiscal ?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/real-estate/${propertyId}/incentive`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      router.refresh()
      onDone?.()
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    // Affichage compact en lecture seule + bouton "Modifier" / "Supprimer"
    return (
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="text-primary font-medium">
            {KIND_OPTIONS.find(o => o.value === existing?.kind)?.label ?? existing?.kind}
          </p>
          <p className="text-xs text-secondary mt-0.5">
            Dispositif fiscal actif sur ce bien.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} icon={Trash2}>
            Supprimer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="card p-5 space-y-4">
      <h3 className="text-sm font-medium text-primary">
        {existing ? 'Modifier le dispositif fiscal' : 'Ajouter un dispositif fiscal'}
      </h3>

      <Field label="Type de dispositif" required>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} required>
          {KIND_OPTIONS.map(o => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {/* Pinel / Pinel+ / Denormandie */}
      {(kind === 'pinel' || kind === 'pinel_plus' || kind === 'denormandie') && (
        <>
          <FormGrid cols={3}>
            <Field label="Durée (ans)" required>
              <Select
                value={String(durationYears)}
                onChange={(e) => setDurationYears(Number(e.target.value))} required
              >
                <option value="6">6 ans</option>
                <option value="9">9 ans</option>
                <option value="12">12 ans</option>
              </Select>
            </Field>
            <Field label="Zone" required>
              <Select value={zone} onChange={(e) => setZone(e.target.value)} required>
                <option value="A_bis">A bis</option>
                <option value="A">A</option>
                <option value="B1">B1</option>
              </Select>
            </Field>
            <Field label="Année 1ère location" required>
              <Input
                type="number" min={2014} max={2030}
                value={startYear === '' ? '' : startYear}
                onChange={(e) => setStartYear(e.target.value === '' ? '' : Number(e.target.value))}
                required
              />
            </Field>
          </FormGrid>
          {kind === 'denormandie' && (
            <Field label="Montant travaux (€)" hint="Minimum 25 % du coût total (acquisition + travaux)" required>
              <Input
                type="number" min={0}
                value={worksAmount === '' ? '' : worksAmount}
                onChange={(e) => setWorksAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="55 000" required
              />
            </Field>
          )}
        </>
      )}

      {/* Loc'Avantages */}
      {kind === 'loc_avantages' && (
        <>
          <Field label="Convention ANAH" required>
            <Select value={conventionType} onChange={(e) => setConventionType(e.target.value)} required>
              <option value="loc1">Loc1 (décote ≥ 15 % → réduction 15 %)</option>
              <option value="loc2">Loc2 (décote ≥ 30 % → réduction 35 %)</option>
              <option value="loc3">Loc3 (décote ≥ 45 % → réduction 65 %)</option>
            </Select>
          </Field>
          <FormGrid>
            <Field label="Début convention" required>
              <Input type="date" value={conventionStart}
                onChange={(e) => setConventionStart(e.target.value)} required />
            </Field>
            <Field label="Fin convention" required>
              <Input type="date" value={conventionEnd}
                onChange={(e) => setConventionEnd(e.target.value)} required />
            </Field>
          </FormGrid>
          <Field label="Loyer de marché annuel (€)" hint="Pour calculer la décote réelle" required>
            <Input type="number" min={0}
              value={marketRentAnnual === '' ? '' : marketRentAnnual}
              onChange={(e) => setMarketRentAnnual(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="13 200" required />
          </Field>
        </>
      )}

      {/* Monuments Historiques / Malraux */}
      {(kind === 'monuments_historiques' || kind === 'malraux') && (
        <>
          <FormGrid>
            <Field label="Classification" required>
              <Select value={classification}
                onChange={(e) => setClassification(e.target.value)} required>
                <option value="classe">Classé MH</option>
                <option value="inscrit">Inscrit ISMH</option>
                <option value="agree">Agréé Ministère Culture</option>
              </Select>
            </Field>
            <Field label="Occupation" required>
              <Select value={occupancy} onChange={(e) => setOccupancy(e.target.value)} required>
                <option value="owner_occupied">Occupant</option>
                <option value="rented">Bailleur</option>
                <option value="mixed">Mixte</option>
              </Select>
            </Field>
          </FormGrid>
          <FormGrid cols={3}>
            <Field label="Montant travaux (€)" required>
              <Input type="number" min={0}
                value={worksAmount === '' ? '' : worksAmount}
                onChange={(e) => setWorksAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="180 000" required />
            </Field>
            <Field label="Année acquisition" required>
              <Input type="number" min={1900} max={2030}
                value={startYear === '' ? '' : startYear}
                onChange={(e) => setStartYear(e.target.value === '' ? '' : Number(e.target.value))}
                required />
            </Field>
            <Field label="Fin engagement 15 ans" required>
              <Input type="number" min={2020} max={2050}
                value={conservationEndYear === '' ? '' : conservationEndYear}
                onChange={(e) => setConservationEndYear(e.target.value === '' ? '' : Number(e.target.value))}
                required />
            </Field>
          </FormGrid>
        </>
      )}

      {error && (
        <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        {existing && (
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            Annuler
          </Button>
        )}
        <Button type="submit" loading={saving} icon={Save}>
          {existing ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </div>
    </form>
  )
}
