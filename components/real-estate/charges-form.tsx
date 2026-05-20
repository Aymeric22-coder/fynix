'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'
import { resolveCharges, type RawChargesRow } from '@/lib/real-estate/charges-resolver'

type Mode = 'eur' | 'pct'

interface Props {
  propertyId:    string
  year:          number
  /** Loyer mensuel HC actuel (somme des lots loués) — pour conversion %/€. */
  monthlyRent:   number
  usageType:     'primary_residence' | 'secondary_residence'
               | 'long_term_rental' | 'short_term_rental' | 'mixed_use'
  fiscalRegime:  string | null
  /** État initial depuis la DB. */
  initial:       RawChargesRow | null
}

/**
 * Formulaire complet de saisie des charges annuelles d'un bien.
 * Sections pliables, affichage conditionnel selon usage_type / régime,
 * toggles €/% pour GLI et frais d'agence, total automatique en pied.
 */
export function ChargesForm({
  propertyId, year, monthlyRent, usageType, fiscalRegime, initial,
}: Props) {
  const router = useRouter()
  const annualRent = monthlyRent * 12

  // ─── État du formulaire ─────────────────────────────────────────
  const [values, setValues] = useState<RawChargesRow>(initial ?? {})
  const [gliMode, setGliMode] = useState<Mode>(
    (initial?.insurance_gli_pct ?? 0) > 0 ? 'pct' : 'eur',
  )
  const [agencyMode, setAgencyMode] = useState<Mode>(
    (initial?.management_agency_pct ?? 0) > 0 ? 'pct' : 'eur',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sections pliables
  const [open, setOpen] = useState<Record<string, boolean>>({
    taxes: true, assurances: true, copro: true, gestion: true,
    travaux: true, pro: true, utilities: false, autre: false,
  })

  const set = <K extends keyof RawChargesRow>(k: K, v: RawChargesRow[K]) =>
    setValues(s => ({ ...s, [k]: v }))
  const setNum = (k: keyof RawChargesRow, raw: string) =>
    set(k, (raw === '' ? null : Number(raw)) as RawChargesRow[typeof k])

  // ─── Résolution en temps réel ────────────────────────────────────
  const resolved = useMemo(() => resolveCharges(values, annualRent), [values, annualRent])

  // ─── Conditions d'affichage ──────────────────────────────────────
  const showTaxeHabitation = usageType === 'secondary_residence'
  const showInsuranceMRH   = usageType === 'primary_residence'
  const showPlatformFees   = usageType === 'short_term_rental'
  const cfeApplicable      = fiscalRegime === 'lmnp_micro' || fiscalRegime === 'lmnp_reel'
                          || fiscalRegime === 'lmp' || fiscalRegime === 'sci_is'
                          || fiscalRegime === 'sci_ir'

  // ─── Soumission ─────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Si l'utilisateur est en mode pct → on remet eur à 0, et vice-versa.
      const payload: RawChargesRow & { year: number } = {
        ...values,
        year,
        insurance_gli_eur:     gliMode    === 'eur' ? values.insurance_gli_eur     ?? 0 : 0,
        insurance_gli_pct:     gliMode    === 'pct' ? values.insurance_gli_pct     ?? 0 : 0,
        management_agency_eur: agencyMode === 'eur' ? values.management_agency_eur ?? 0 : 0,
        management_agency_pct: agencyMode === 'pct' ? values.management_agency_pct ?? 0 : 0,
      }
      const res = await fetch(`/api/real-estate/${propertyId}/charges`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // ─── Helpers UI ─────────────────────────────────────────────────
  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="card p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen(s => ({ ...s, [id]: !s[id] }))}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-medium text-primary">{title}</h3>
        {open[id] ? <ChevronDown size={14} className="text-muted" /> : <ChevronRight size={14} className="text-muted" />}
      </button>
      {open[id] && <div className="space-y-3 pt-2 border-t border-border">{children}</div>}
    </div>
  )

  const Money = ({ k, label, hint, placeholder }: {
    k: keyof RawChargesRow; label: string; hint?: string; placeholder?: string
  }) => (
    <Field label={label} hint={hint}>
      <Input
        type="number" min={0} step={0.01}
        value={values[k] == null ? '' : String(values[k])}
        onChange={(e) => setNum(k, e.target.value)}
        placeholder={placeholder ?? '0'}
      />
    </Field>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-medium text-primary">Charges {year}</h2>
        <p className="text-xs text-muted">
          Saisissez les montants annuels. Total mis à jour automatiquement.
        </p>
      </div>

      {/* ─── Taxes locales ──────────────────────────── */}
      <Section id="taxes" title="Taxes locales">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Money k="taxe_fonciere" label="Taxe foncière (€/an)"
            hint="Montant figurant sur votre avis TF" />
          <Money k="teom" label="TEOM (€/an)"
            hint="Si non incluse dans la TF" />
          {showTaxeHabitation && (
            <Money k="taxe_habitation" label="Taxe d'habitation (€/an)"
              hint="Résidence secondaire uniquement" />
          )}
          <Money k="taxe_logements_vacants" label="TLV / THLV (€/an)"
            hint="Si applicable dans votre commune" />
        </div>
      </Section>

      {/* ─── Assurances ─────────────────────────────── */}
      <Section id="assurances" title="Assurances">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Money k="insurance" label="Assurance PNO (€/an)"
            hint="Propriétaire Non Occupant — obligatoire en locatif" />
          {showInsuranceMRH && (
            <Money k="insurance_mrh" label="Multirisque habitation (€/an)"
              hint="Résidence principale" />
          )}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-secondary">Garantie Loyers Impayés (GLI)</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setGliMode('eur')}
                  className={`text-xs px-2 py-0.5 rounded ${gliMode === 'eur' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-primary'}`}>€/an</button>
                <button type="button" onClick={() => setGliMode('pct')}
                  className={`text-xs px-2 py-0.5 rounded ${gliMode === 'pct' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-primary'}`}>% loyers</button>
              </div>
            </div>
            {gliMode === 'eur' ? (
              <Input type="number" min={0} step={0.01}
                value={values.insurance_gli_eur == null ? '' : String(values.insurance_gli_eur)}
                onChange={(e) => setNum('insurance_gli_eur', e.target.value)}
                placeholder="240" />
            ) : (
              <Input type="number" min={0} step={0.1} max={10}
                value={values.insurance_gli_pct == null ? '' : String(values.insurance_gli_pct)}
                onChange={(e) => setNum('insurance_gli_pct', e.target.value)}
                placeholder="3.5" />
            )}
            <p className="text-xs text-muted mt-1">
              {gliMode === 'pct' && annualRent > 0
                ? `≈ ${formatCurrency(resolved.gliResolvedEur, 'EUR')}/an sur loyers ${formatCurrency(annualRent, 'EUR')}/an`
                : 'Typiquement 2,5 à 4 % des loyers annuels. Déductible en régime réel.'}
            </p>
          </div>
        </div>
      </Section>

      {/* ─── Copropriété ────────────────────────────── */}
      <Section id="copro" title="Copropriété">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Money k="condo_fees" label="Charges courantes (€/an)"
            hint="Provisions trimestrielles syndic" />
          <Money k="condo_fees_works" label="Travaux votés (€/an)"
            hint="Appels de fonds AG" />
          <Money k="condo_special_fund" label="Fonds travaux ELAN (€/an)"
            hint="Obligatoire loi ELAN" />
        </div>
      </Section>

      {/* ─── Gestion locative ───────────────────────── */}
      <Section id="gestion" title="Gestion locative">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-secondary">Frais d&apos;agence (gestion locative)</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => setAgencyMode('eur')}
                className={`text-xs px-2 py-0.5 rounded ${agencyMode === 'eur' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-primary'}`}>€/an</button>
              <button type="button" onClick={() => setAgencyMode('pct')}
                className={`text-xs px-2 py-0.5 rounded ${agencyMode === 'pct' ? 'bg-accent/20 text-accent' : 'text-muted hover:text-primary'}`}>% loyers</button>
            </div>
          </div>
          {agencyMode === 'eur' ? (
            <Input type="number" min={0} step={0.01}
              value={values.management_agency_eur == null ? '' : String(values.management_agency_eur)}
              onChange={(e) => setNum('management_agency_eur', e.target.value)}
              placeholder="0" />
          ) : (
            <Input type="number" min={0} step={0.1} max={20}
              value={values.management_agency_pct == null ? '' : String(values.management_agency_pct)}
              onChange={(e) => setNum('management_agency_pct', e.target.value)}
              placeholder="8.0" />
          )}
          <p className="text-xs text-muted mt-1">
            {agencyMode === 'pct' && annualRent > 0
              ? `≈ ${formatCurrency(resolved.agencyFeesResolvedEur, 'EUR')}/an`
              : 'Typiquement 6 à 10 % des loyers HC'}
          </p>
        </div>

        {showPlatformFees && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Money k="management_airbnb_pct" label="Commission Airbnb (%)"
              hint="~15 % par défaut" placeholder="15" />
            <Money k="management_booking_pct" label="Commission Booking (%)"
              hint="~17 % par défaut" placeholder="17" />
            <Money k="management_cleaning" label="Ménage (€/an)" />
            <Money k="management_concierge" label="Conciergerie (€/an)" />
          </div>
        )}
      </Section>

      {/* ─── Travaux & entretien ────────────────────── */}
      <Section id="travaux" title="Travaux & entretien">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Money k="maintenance" label="Entretien courant (€/an)"
            hint="< 500 € unitaires" />
          <Money k="maintenance_major" label="Gros travaux (€/an)"
            hint="Non amortis" />
          <Money k="repairs_provision" label="Provision imprévus (€/an)" />
        </div>
      </Section>

      {/* ─── Charges professionnelles ──────────────── */}
      <Section id="pro" title="Charges professionnelles">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Money k="accountant" label="Expert-comptable (€/an)"
            hint="Déductible en LMNP réel, LMP, SCI IS" />
          {cfeApplicable && (
            <Money k="cfe" label="CFE (€/an)"
              hint="Applicable LMNP / LMP / SCI" />
          )}
          <Money k="legal_fees" label="Frais juridiques (€/an)"
            hint="Procédures, contentieux" />
          <Money k="diagnostics_fees" label="Diagnostics (€/an)"
            hint="DPE, amiante, plomb, etc." />
        </div>
      </Section>

      {/* ─── Abonnements ──────────────────────────── */}
      <Section id="utilities" title="Abonnements (à charge propriétaire)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Money k="utilities_internet" label="Internet (€/an)" />
          <Money k="utilities_electricity" label="Électricité (€/an)" />
          <Money k="utilities_water" label="Eau (€/an)" />
        </div>
      </Section>

      {/* ─── Autre ─────────────────────────────────── */}
      <Section id="autre" title="Autre">
        <Money k="other" label="Autres charges (€/an)" />
      </Section>

      {/* ─── Récapitulatif & soumission ──────────────── */}
      <div className="card border-accent/20 bg-accent/5 p-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-sm text-secondary">Total charges annuelles</p>
          <p className="text-xl font-semibold financial-value text-accent">
            {formatCurrency(resolved.totalAnnualEur, 'EUR')}
            <span className="text-xs text-secondary ml-2">
              ({formatCurrency(resolved.totalAnnualEur / 12, 'EUR')} /mois)
            </span>
          </p>
        </div>
        <p className="text-xs text-muted mt-1">
          Détail : taxes {formatCurrency(resolved.taxesLocalesTotal, 'EUR', { compact: true })}{' '}
          · assurances {formatCurrency(resolved.assurancesTotal, 'EUR', { compact: true })}{' '}
          · copro {formatCurrency(resolved.coproTotal, 'EUR', { compact: true })}{' '}
          · gestion {formatCurrency(resolved.gestionTotal, 'EUR', { compact: true })}{' '}
          · travaux {formatCurrency(resolved.travauxTotal, 'EUR', { compact: true })}{' '}
          · pro {formatCurrency(resolved.professionalTotal, 'EUR', { compact: true })}{' '}
          · abonnements {formatCurrency(resolved.utilitiesTotal, 'EUR', { compact: true })}
        </p>
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex justify-end">
        <Button type="button" loading={saving} icon={Save} onClick={handleSave}>
          Enregistrer les charges
        </Button>
      </div>
    </div>
  )
}
