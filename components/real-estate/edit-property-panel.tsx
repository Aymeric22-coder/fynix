'use client'

/**
 * Panneau d'edition d'un bien immobilier existant.
 *
 * 3 sections editables (PATCH partiel /api/real-estate/[id]) :
 *  - Identification (asset.name + property.address + property_type, surface, etc.)
 *  - Acquisition & financement (prix, frais, travaux, mobilier, date)
 *  - Regime fiscal (avec warning sur l'impact des recalculs)
 *
 * Sous-ressources (Lots, Credit, Charges, Dispositif fiscal) : cartes simples
 * qui redirigent vers les onglets correspondants de la fiche, qui ont deja
 * leurs propres formulaires d'edition.
 *
 * Chaque section :
 *  - bouton "Enregistrer" en bas de section, fait un PATCH partiel
 *  - toast inline "✓ Modifications enregistrees" (auto-hide 2 s)
 *  - warning informatif sur les champs critiques (prix, regime)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, AlertTriangle, Check, ExternalLink, Banknote, Home, Receipt, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'
import type { FiscalRegime, PropertyUsageType } from '@/types/database.types'
import { USAGE_TYPE_LABELS } from '@/types/database.types'

const FISCAL_REGIME_LABELS: Record<FiscalRegime, string> = {
  foncier_micro: 'Foncier micro',
  foncier_nu:    'Foncier réel (nu)',
  lmnp_micro:    'LMNP micro-BIC',
  lmnp_reel:     'LMNP réel',
  lmp:           'LMP',
  sci_ir:        'SCI IR',
  sci_is:        'SCI IS',
}

interface InitialData {
  // Asset
  name:              string
  // Property
  property_type:     string
  usage_type:        PropertyUsageType
  address_line1:     string | null
  address_city:      string | null
  address_zip:       string | null
  surface_m2:        number | null
  construction_year: number | null
  dpe_class:         string | null
  // Acquisition
  purchase_price:    number | null
  purchase_fees:     number | null
  works_amount:      number | null
  furniture_amount:  number | null
  acquisition_date:  string | null
  // Fiscal
  fiscal_regime:     FiscalRegime | null
  lmnp_micro_abattement_pct: number | null
  cca_amount:        number | null
  // Counts (for sub-resource cards)
  nbLots:            number
  nbCredits:         number
  hasIncentive:      boolean
}

interface Props {
  propertyId: string
  initial:    InitialData
}

export function EditPropertyPanel({ propertyId, initial }: Props) {
  return (
    <div className="space-y-6">
      <IdentificationSection propertyId={propertyId} initial={initial} />
      <AcquisitionSection    propertyId={propertyId} initial={initial} />
      <FiscalSection         propertyId={propertyId} initial={initial} />
      <SubResourcesCard      propertyId={propertyId} initial={initial} />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
//  Section 1 — Identification
// ───────────────────────────────────────────────────────────────────

function IdentificationSection({ propertyId, initial }: Props) {
  const router = useRouter()
  const [v, setV] = useState({
    name:              initial.name,
    property_type:     initial.property_type,
    usage_type:        initial.usage_type,
    address_line1:     initial.address_line1 ?? '',
    address_city:      initial.address_city ?? '',
    address_zip:       initial.address_zip ?? '',
    surface_m2:        initial.surface_m2  ?? undefined as number | undefined,
    construction_year: initial.construction_year ?? undefined as number | undefined,
    dpe_class:         initial.dpe_class ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/real-estate/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:              v.name,
          property_type:     v.property_type,
          usage_type:        v.usage_type,
          address_line1:     v.address_line1 || null,
          address_city:      v.address_city  || null,
          address_zip:       v.address_zip   || null,
          surface_m2:        v.surface_m2    ?? null,
          construction_year: v.construction_year ?? null,
          dpe_class:         v.dpe_class     || null,
        }),
      })
      const json = await res.json()
      if (json?.error) { setError(json.error); return }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="card p-5 space-y-4">
      <SectionHeader title="Identification" subtitle="Nom, adresse, type et caractéristiques" />

      <Field label="Nom du bien" required>
        <Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} required />
      </Field>

      <FormGrid>
        <Field label="Type">
          <Select value={v.property_type} onChange={e => setV({ ...v, property_type: e.target.value })}>
            <option value="apartment">Appartement</option>
            <option value="house">Maison</option>
            <option value="building">Immeuble</option>
            <option value="land">Terrain</option>
            <option value="commercial">Local commercial</option>
            <option value="other">Autre</option>
          </Select>
        </Field>
        <Field label="Usage">
          <Select value={v.usage_type}
            onChange={e => setV({ ...v, usage_type: e.target.value as PropertyUsageType })}>
            {Object.entries(USAGE_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </Select>
        </Field>
      </FormGrid>

      <Field label="Adresse">
        <Input value={v.address_line1}
          onChange={e => setV({ ...v, address_line1: e.target.value })}
          placeholder="12 rue Léon-Blum" />
      </Field>
      <FormGrid>
        <Field label="Code postal">
          <Input value={v.address_zip}
            onChange={e => setV({ ...v, address_zip: e.target.value })}
            placeholder="75011" />
        </Field>
        <Field label="Ville">
          <Input value={v.address_city}
            onChange={e => setV({ ...v, address_city: e.target.value })}
            placeholder="Paris" />
        </Field>
      </FormGrid>

      <FormGrid>
        <Field label="Surface (m²)">
          <Input type="number" min={0} step={0.1}
            value={v.surface_m2 ?? ''}
            onChange={e => setV({ ...v, surface_m2: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Année construction">
          <Input type="number" min={1700} max={2100}
            value={v.construction_year ?? ''}
            onChange={e => setV({ ...v, construction_year: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="DPE">
          <Select value={v.dpe_class} onChange={e => setV({ ...v, dpe_class: e.target.value })}>
            <option value="">—</option>
            {['A','B','C','D','E','F','G'].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </FormGrid>

      <SectionFooter saving={saving} saved={saved} error={error} />
    </form>
  )
}

// ───────────────────────────────────────────────────────────────────
//  Section 2 — Acquisition & financement
// ───────────────────────────────────────────────────────────────────

function AcquisitionSection({ propertyId, initial }: Props) {
  const router = useRouter()
  const [v, setV] = useState({
    purchase_price:   initial.purchase_price   ?? undefined as number | undefined,
    purchase_fees:    initial.purchase_fees    ?? undefined as number | undefined,
    works_amount:     initial.works_amount     ?? undefined as number | undefined,
    furniture_amount: initial.furniture_amount ?? undefined as number | undefined,
    acquisition_date: initial.acquisition_date ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priceChanged = v.purchase_price != null
                    && initial.purchase_price != null
                    && v.purchase_price !== initial.purchase_price

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/real-estate/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_price:   v.purchase_price   ?? null,
          purchase_fees:    v.purchase_fees    ?? 0,
          works_amount:     v.works_amount     ?? 0,
          furniture_amount: v.furniture_amount ?? 0,
          acquisition_date: v.acquisition_date || null,
        }),
      })
      const json = await res.json()
      if (json?.error) { setError(json.error); return }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  const totalCost =
    (v.purchase_price ?? 0) + (v.purchase_fees ?? 0)
    + (v.works_amount ?? 0) + (v.furniture_amount ?? 0)

  return (
    <form onSubmit={save} className="card p-5 space-y-4">
      <SectionHeader title="Acquisition & financement"
        subtitle="Prix, frais de notaire, travaux, mobilier" />

      <FormGrid>
        <Field label="Prix net vendeur (€)">
          <Input type="number" min={0} step={1}
            value={v.purchase_price ?? ''}
            onChange={e => setV({ ...v, purchase_price: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="200000" />
        </Field>
        <Field label="Frais de notaire (€)">
          <Input type="number" min={0} step={1}
            value={v.purchase_fees ?? ''}
            onChange={e => setV({ ...v, purchase_fees: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="15000" />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label="Travaux (€)">
          <Input type="number" min={0} step={1}
            value={v.works_amount ?? ''}
            onChange={e => setV({ ...v, works_amount: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="0" />
        </Field>
        <Field label="Mobilier amortissable (€)" hint="LMNP / LMP uniquement">
          <Input type="number" min={0} step={1}
            value={v.furniture_amount ?? ''}
            onChange={e => setV({ ...v, furniture_amount: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="0" />
        </Field>
      </FormGrid>
      <Field label="Date d'acquisition">
        <Input type="date" value={v.acquisition_date}
          onChange={e => setV({ ...v, acquisition_date: e.target.value })} />
      </Field>

      <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
        <span className="text-secondary">Prix de revient total</span>
        <span className="financial-value text-primary font-medium">{formatCurrency(totalCost, 'EUR')}</span>
      </div>

      {priceChanged && (
        <Warning>
          Modifier le prix d&apos;achat recalculera tous les rendements (brut, net, net-net)
          et le levier financier. Les données historiques (transactions, dividendes,
          valorisations) ne sont pas affectées.
        </Warning>
      )}

      <SectionFooter saving={saving} saved={saved} error={error} />
    </form>
  )
}

// ───────────────────────────────────────────────────────────────────
//  Section 3 — Regime fiscal
// ───────────────────────────────────────────────────────────────────

function FiscalSection({ propertyId, initial }: Props) {
  const router = useRouter()
  const [v, setV] = useState({
    fiscal_regime:             (initial.fiscal_regime ?? '') as FiscalRegime | '',
    lmnp_micro_abattement_pct: initial.lmnp_micro_abattement_pct ?? 50,
    cca_amount:                initial.cca_amount ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const regimeChanged = v.fiscal_regime !== (initial.fiscal_regime ?? '')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!v.fiscal_regime) { setError('Le régime fiscal est requis'); return }
    if (v.fiscal_regime === 'sci_is' && (v.cca_amount < 0 || !Number.isFinite(v.cca_amount))) {
      setError('Le solde de CCA doit être un nombre ≥ 0'); return
    }
    setSaving(true); setError(null); setSaved(false)
    try {
      const payload: Record<string, unknown> = { fiscal_regime: v.fiscal_regime }
      if (v.fiscal_regime === 'lmnp_micro') {
        payload.lmnp_micro_abattement_pct = v.lmnp_micro_abattement_pct
      }
      if (v.fiscal_regime === 'sci_is') {
        payload.cca_amount = v.cca_amount
      }
      const res = await fetch(`/api/real-estate/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json?.error) { setError(json.error); return }
      setSaved(true); setTimeout(() => setSaved(false), 2500)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="card p-5 space-y-4">
      <SectionHeader title="Régime fiscal"
        subtitle="Pilote tous les calculs de rentabilité nette et de cash-flow" />

      <Field label="Régime fiscal" required>
        <Select value={v.fiscal_regime}
          onChange={e => setV({ ...v, fiscal_regime: e.target.value as FiscalRegime | '' })}
          required>
          <option value="">— À sélectionner —</option>
          {Object.entries(FISCAL_REGIME_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </Select>
      </Field>

      {v.fiscal_regime === 'lmnp_micro' && (
        <Field label="Abattement micro-BIC (%)" hint="50 % (classique/classé) ou 30 % (tourisme non classé) — LF 2025">
          <Select
            value={String(v.lmnp_micro_abattement_pct)}
            onChange={e => setV({ ...v, lmnp_micro_abattement_pct: Number(e.target.value) })}
          >
            <option value="50">50 % (classique / tourisme classé)</option>
            <option value="71">71 % (chambres d&apos;hôtes — historique)</option>
          </Select>
        </Field>
      )}

      {v.fiscal_regime === 'sci_is' && (
        <Field
          label="Compte courant d'associé (CCA, €)"
          hint="Apports déjà versés par l'associé à la SCI. Leur remboursement est fiscalement neutre."
        >
          <Input
            type="number" min={0} step={100}
            value={v.cca_amount}
            onChange={e => setV({
              ...v,
              cca_amount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
            })}
            placeholder="0"
          />
        </Field>
      )}

      {regimeChanged && (
        <Warning>
          Changer de régime fiscal modifie tous les calculs de rentabilité nette et
          de cash-flow. Cette modification s&apos;applique aux projections — les bilans
          d&apos;années passées conservent leur calcul historique.
        </Warning>
      )}

      <SectionFooter saving={saving} saved={saved} error={error} />
    </form>
  )
}

// ───────────────────────────────────────────────────────────────────
//  Sous-ressources — Cartes vers onglets existants
// ───────────────────────────────────────────────────────────────────

function SubResourcesCard({ propertyId, initial }: Props) {
  return (
    <div className="card p-5 space-y-4">
      <SectionHeader title="Autres éléments éditables"
        subtitle="Crédits, lots, charges et dispositifs fiscaux ont leur propre onglet" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SubResourceLink
          href={`/immobilier/${propertyId}?tab=credit`}
          icon={Banknote}
          label="Crédits"
          count={initial.nbCredits}
          desc="Modifier, ajouter ou supprimer un crédit"
        />
        <SubResourceLink
          href={`/immobilier/${propertyId}?tab=synthese`}
          icon={Home}
          label="Lots & loyers"
          count={initial.nbLots}
          desc="Modifier un lot, ajouter, supprimer"
        />
        <SubResourceLink
          href={`/immobilier/${propertyId}?tab=charges`}
          icon={Receipt}
          label="Charges annuelles"
          desc="Édition inline dans l'onglet Charges"
        />
        <SubResourceLink
          href={`/immobilier/${propertyId}?tab=dispositif`}
          icon={Sparkles}
          label="Dispositif fiscal"
          desc={initial.hasIncentive ? 'Modifier le dispositif' : 'Ajouter un dispositif Pinel / Denormandie / etc.'}
        />
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
//  Helpers UI
// ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-primary">{title}</h3>
      {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
    </div>
  )
}

function SectionFooter({ saving, saved, error }: {
  saving: boolean
  saved:  boolean
  error:  string | null
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
      <div className="text-xs">
        {saved && (
          <span className="text-accent inline-flex items-center gap-1">
            <Check size={12} /> Modifications enregistrées
          </span>
        )}
        {error && <span className="text-danger">⚠ {error}</span>}
      </div>
      <Button type="submit" loading={saving} icon={Save} size="sm">
        Enregistrer
      </Button>
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-warning/40 bg-warning/5 rounded-lg p-3 flex gap-2 text-xs">
      <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
      <p className="text-secondary">{children}</p>
    </div>
  )
}

function SubResourceLink({ href, icon: Icon, label, count, desc }: {
  href:  string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon:  any
  label: string
  count?: number
  desc:  string
}) {
  return (
    <Link href={href}
      className="border border-border rounded-lg p-3 hover:border-accent/40 hover:bg-surface-2 transition-colors group">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-muted group-hover:text-accent transition-colors" />
          <span className="text-sm text-primary font-medium">{label}</span>
          {count != null && (
            <span className="text-xs text-muted">({count})</span>
          )}
        </div>
        <ExternalLink size={12} className="text-muted group-hover:text-accent transition-colors" />
      </div>
      <p className="text-xs text-muted">{desc}</p>
    </Link>
  )
}
