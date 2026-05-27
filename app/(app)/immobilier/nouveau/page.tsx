'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Save, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid } from '@/components/ui/field'
import { Stepper } from '@/components/ui/stepper'
import { formatCurrency } from '@/lib/utils/format'
import { computeMonthlyPayment } from '@/lib/real-estate/amortization'
import {
  validateLoanRates,
  validateLoanStartVsAcquisition,
} from '@/lib/real-estate/validate-loan-form'
import {
  isRentalWizardUsage,
  wizardStepsFor,
  requiresFiscalRegimeStep,
} from '@/lib/real-estate/validate-wizard'

// ─────────────────────────────────────────────────────────────────
//  Types & état initial
// ─────────────────────────────────────────────────────────────────

type UsageType =
  | 'primary_residence' | 'secondary_residence'
  | 'long_term_rental' | 'short_term_rental' | 'mixed_use'

type FiscalRegime =
  | 'lmnp_reel' | 'lmnp_micro' | 'lmp'
  | 'sci_is'    | 'sci_ir'
  | 'foncier_nu' | 'foncier_micro' | ''

type LoanKind =
  | 'principal' | 'ptz' | 'travaux' | 'pel'
  | 'action_logement' | 'relais' | 'in_fine' | 'autre'

interface WizardDraft {
  // Étape 1
  name:              string
  usage_type:        UsageType
  property_type:     string
  address_line1:     string
  address_city:      string
  address_zip:       string
  surface_m2:        number | undefined
  rooms:             number | undefined
  construction_year: number | undefined
  dpe_class:         string

  // Étape 2
  purchase_price:    number | undefined
  purchase_fees:     number | undefined
  works_amount:      number | undefined
  furniture_amount:  number | undefined
  acquisition_date:  string

  // Étape 3 (facultative)
  hasLoan:           boolean
  loan_kind:         LoanKind
  lender:            string
  loan_principal:    number | undefined
  loan_rate:         number | undefined
  loan_duration:     number | undefined   // mois
  loan_start_date:   string
  insurance_rate:    number | undefined
  insurance_quotite: number | undefined

  // Étape 4
  fiscal_regime:     FiscalRegime
  cca_amount:        number | undefined   // SCI IS uniquement (mig 037)

  // Étape 5
  hasLot:            boolean
  lot_name:          string
  lot_rent:          number | undefined
  lot_charges:       number | undefined
  lot_market_rent:   number | undefined

  // Étape 5 — Courte durée (visible si usage_type = short_term_rental)
  lot_nightly_rate_low:       number | undefined
  lot_occupancy_rate_pct:     number | undefined
  lot_avg_stay_nights:        number | undefined
  lot_tourism_classification: '' | 'non_classe' | 'classe_1_2' | 'classe_3_4_5' | 'chambre_hotes'

  notes:             string
}

const EMPTY_DRAFT: WizardDraft = {
  name:              '',
  usage_type:        'long_term_rental',
  property_type:     'apartment',
  address_line1:     '',
  address_city:      '',
  address_zip:       '',
  surface_m2:        undefined,
  rooms:             undefined,
  construction_year: undefined,
  dpe_class:         '',

  purchase_price:    undefined,
  purchase_fees:     undefined,
  works_amount:      undefined,
  furniture_amount:  undefined,
  acquisition_date:  '',

  hasLoan:           false,
  loan_kind:         'principal',
  lender:            '',
  loan_principal:    undefined,
  loan_rate:         undefined,
  loan_duration:     240,
  loan_start_date:   '',
  insurance_rate:    0.3,
  insurance_quotite: 100,

  fiscal_regime:     '',
  cca_amount:        undefined,

  hasLot:            false,
  lot_name:          '',
  lot_rent:          undefined,
  lot_charges:       0,
  lot_market_rent:   undefined,
  lot_nightly_rate_low:       undefined,
  lot_occupancy_rate_pct:     70,
  lot_avg_stay_nights:        3,
  lot_tourism_classification: '',

  notes:             '',
}

// V12 — STEPS calculé dynamiquement depuis `draft.usage_type` via
// `wizardStepsFor` (cf. lib/real-estate/validate-wizard.ts). 5 étapes
// pour locatif, 4 pour RP/RS (étape 5 « Lots » sautée, étape 4 devient
// « Récapitulatif »).

const FISCAL_REGIME_DESCRIPTIONS: Record<Exclude<FiscalRegime, ''>, { label: string; help: string }> = {
  foncier_micro: { label: 'Micro-foncier',
    help: 'Location nue. Abattement forfaitaire de 30 %. Plafond 15 000 €/an. Simple, sans déduction de charges.' },
  foncier_nu: { label: 'Foncier réel',
    help: 'Location nue avec déduction de toutes les charges réelles (intérêts, taxe foncière, travaux). Permet du déficit foncier.' },
  lmnp_micro: { label: 'LMNP micro-BIC',
    help: 'Location meublée. Abattement 50 % (71 % en tourisme classé). Plafond 77 700 €/an (188 700 € classé).' },
  lmnp_reel: { label: 'LMNP réel',
    help: 'Location meublée avec déduction de toutes les charges + amortissements du bien et du mobilier. Souvent le plus optimal fiscalement.' },
  lmp: { label: 'LMP',
    help: 'Loueur meublé professionnel : recettes > 23 000 €/an ET > revenus pro du foyer. Cotisations SSI, déficit imputable sans plafond.' },
  sci_is: { label: 'SCI à l\'IS',
    help: 'Société soumise à l\'impôt sur les sociétés (15 % jusqu\'à 42 500 €, 25 % au-delà). Amortissements possibles, déficit reportable indéfiniment.' },
  sci_ir: { label: 'SCI à l\'IR',
    help: 'Société transparente fiscalement : les revenus sont imposés à l\'IR de chaque associé, comme du foncier réel.' },
}

// ─────────────────────────────────────────────────────────────────
//  SessionStorage
// ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fynix_property_wizard_draft_v1'

function loadDraft(): WizardDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_DRAFT
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) }
  } catch {
    return EMPTY_DRAFT
  }
}

function saveDraft(d: WizardDraft) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d)) } catch { /* quota */ }
}

function clearDraft() {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────
//  Composant
// ─────────────────────────────────────────────────────────────────

export default function NouveauBienPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep]       = useState(1)
  const [draft, setDraft]     = useState<WizardDraft>(EMPTY_DRAFT)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Charge le brouillon (session ou query depuis le simulateur)
  useEffect(() => {
    // Si on arrive depuis le simulateur, on essaye d'hydrater depuis sessionStorage
    // sous une clé dédiée (fynix_simulator_draft).
    if (searchParams.get('from') === 'simulator' && typeof window !== 'undefined') {
      const fromSim = sessionStorage.getItem('fynix_simulator_draft_v1')
      if (fromSim) {
        try { setDraft({ ...EMPTY_DRAFT, ...JSON.parse(fromSim) }); return } catch { /* ignore */ }
      }
    }
    setDraft(loadDraft())
  }, [searchParams])

  // Persiste à chaque modif
  useEffect(() => { saveDraft(draft) }, [draft])

  const set = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
  }
  const setNum = <K extends keyof WizardDraft>(key: K, raw: string) => {
    setDraft(d => ({ ...d, [key]: (raw === '' ? undefined : Number(raw)) as WizardDraft[K] }))
  }

  // Validation par étape
  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!draft.name) return 'Le nom du bien est requis'
      if (!draft.address_city) return 'La ville est requise'
      if (!draft.surface_m2 || draft.surface_m2 <= 0) return 'La surface est requise'
    }
    if (s === 2) {
      if (!draft.purchase_price || draft.purchase_price <= 0) return 'Le prix d\'achat est requis'
      if (draft.purchase_fees == null) return 'Les frais de notaire sont requis (utilisez le bouton de calcul automatique au besoin)'
      if (!draft.acquisition_date) return 'La date d\'acquisition est requise'
    }
    if (s === 3 && draft.hasLoan) {
      if (!draft.loan_principal || draft.loan_principal <= 0) return 'Le montant emprunté est requis'
      // V10.1 — ROB-102 : bornes taux (helper partagé avec credit-form)
      const ratesErr = validateLoanRates(draft.loan_rate, draft.insurance_rate)
      if (ratesErr) return ratesErr
      if (!draft.loan_duration || draft.loan_duration <= 0) return 'La durée du prêt est requise'
      if (!draft.loan_start_date) return 'La date de début du prêt est requise'
      // V10.1 — ROB-101 : loan_start ≥ acquisition (égalité OK)
      const datesErr = validateLoanStartVsAcquisition(draft.loan_start_date, draft.acquisition_date)
      if (datesErr) return datesErr
    }
    // V12 — étape 4 : régime fiscal exigé UNIQUEMENT pour les biens locatifs.
    // RP/RS sautent la validation (l'étape est rendue comme récap).
    if (s === 4 && requiresFiscalRegimeStep(draft.usage_type)) {
      if (!draft.fiscal_regime) return 'Le régime fiscal est requis'
    }
    return null
  }

  // V12 — STEPS dynamique (5 pour locatif, 4 pour RP/RS).
  const STEPS       = wizardStepsFor(draft.usage_type)
  const TOTAL_STEPS = STEPS.length

  // V12 — Si l'utilisateur passe locatif → RP en mid-flow alors qu'il était
  // à l'étape 5, on doit ramener à l'étape max disponible (4).
  useEffect(() => {
    if (step > TOTAL_STEPS) setStep(TOTAL_STEPS)
  }, [step, TOTAL_STEPS])

  function goNext() {
    const err = validateStep(step)
    if (err) { setError(err); return }
    setError(null)
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }

  function goPrev() {
    setError(null)
    setStep(s => Math.max(1, s - 1))
  }

  // Soumission finale
  async function submit() {
    // Re-valide les étapes obligatoires (l'étape 4 ne vaut que pour locatif —
    // `validateStep` gère déjà la branche RP/RS via `requiresFiscalRegimeStep`).
    for (const s of [1, 2, 4]) {
      const err = validateStep(s)
      if (err) { setStep(s); setError(err); return }
    }
    if (draft.hasLoan) {
      const err = validateStep(3); if (err) { setStep(3); setError(err); return }
    }

    setLoading(true)
    setError(null)

    try {
      // 1. Créer le bien
      const propRes = await fetch('/api/real-estate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:              draft.name,
          property_type:     draft.property_type,
          usage_type:        draft.usage_type,
          address_line1:     draft.address_line1 || null,
          address_city:      draft.address_city  || null,
          address_zip:       draft.address_zip   || null,
          surface_m2:        draft.surface_m2    ?? null,
          construction_year: draft.construction_year ?? null,
          dpe_class:         draft.dpe_class     || null,
          purchase_price:    draft.purchase_price ?? null,
          purchase_fees:     draft.purchase_fees  ?? 0,
          works_amount:      draft.works_amount   ?? 0,
          // V12 — RP/RS : pas de régime fiscal locatif (forcé à null même
          // si un draft fantôme reste après changement d'usage_type).
          fiscal_regime:     requiresFiscalRegimeStep(draft.usage_type)
                               ? (draft.fiscal_regime || null)
                               : null,
          // Mig 037 — CCA SCI IS uniquement (sinon 0, default DB).
          cca_amount:        draft.fiscal_regime === 'sci_is'
                               ? Math.max(0, draft.cca_amount ?? 0)
                               : 0,
          is_multi_lot:      false,
          acquisition_date:  draft.acquisition_date || null,
          notes:             draft.notes || null,
        }),
      })
      const propJson = await propRes.json()
      // L'API enveloppe ses retours via ok(): { data: {asset, property}, error: null }
      const propertyId = propJson?.data?.property?.id as string | undefined
      if (propJson?.error || !propertyId) {
        setError(propJson?.error ?? 'Erreur lors de la création du bien')
        setLoading(false); return
      }

      // Le bien est créé. Les étapes 2 et 3 sont best-effort : si l'une
      // échoue, on n'efface PAS le brouillon en silence — on redirige vers
      // la fiche avec un ?warn=... qui détaille ce qui a raté, pour que
      // l'utilisateur puisse compléter manuellement.
      const warnings: string[] = []

      // 2. Créer le crédit si saisi
      if (draft.hasLoan && draft.loan_principal && draft.loan_rate != null && draft.loan_duration) {
        try {
          const creditRes = await fetch(`/api/real-estate/${propertyId}/credit`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name:              `Crédit ${draft.name}`,
              lender:            draft.lender || null,
              loan_kind:         draft.loan_kind,
              initial_amount:    draft.loan_principal,
              interest_rate:     draft.loan_rate,
              insurance_rate:    draft.insurance_rate ?? 0,
              duration_months:   draft.loan_duration,
              start_date:        draft.loan_start_date,
              insurance_quotite: draft.insurance_quotite ?? 100,
            }),
          })
          const creditJson = await creditRes.json().catch(() => null)
          if (!creditRes.ok || creditJson?.error) warnings.push('credit')
        } catch {
          warnings.push('credit')
        }
      }

      // 3. Créer le lot par défaut si saisi
      // V12 — Garde-fou : aucun POST /lots pour un bien non-locatif (RP/RS),
      // même si `hasLot` est resté à true après un changement d'usage_type.
      const isShortTermWizard = draft.usage_type === 'short_term_rental'
      const hasLotData = isRentalWizardUsage(draft.usage_type) && draft.hasLot && (
        (isShortTermWizard && draft.lot_nightly_rate_low != null)
        || (!isShortTermWizard && draft.lot_rent != null)
      )
      if (hasLotData) {
        const baseLotPayload = {
          name:           draft.lot_name || draft.name,
          lot_type:       draft.property_type === 'house' ? 'house' : 'apartment',
          surface_m2:     draft.surface_m2 ?? null,
          status:         'rented',
        }
        const shortTermPayload = isShortTermWizard ? {
          rental_type:              'short_term',
          rent_amount:              null,
          charges_amount:           0,
          market_rent:              null,
          nightly_rate_low:         draft.lot_nightly_rate_low,
          occupancy_rate_pct:       draft.lot_occupancy_rate_pct ?? 70,
          avg_stay_nights:          draft.lot_avg_stay_nights ?? 3,
          platform_airbnb_pct:      15,
          platform_booking_pct:     15,
          platform_airbnb_mix_pct:  100,
          platform_booking_mix_pct: 0,
          platform_direct_mix_pct:  0,
          tourism_classification:   draft.lot_tourism_classification || null,
        } : {
          rental_type:    'long_term',
          rent_amount:    draft.lot_rent,
          charges_amount: draft.lot_charges ?? 0,
          market_rent:    draft.lot_market_rent ?? null,
        }
        try {
          const lotRes = await fetch(`/api/real-estate/${propertyId}/lots`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...baseLotPayload, ...shortTermPayload }),
          })
          const lotJson = await lotRes.json().catch(() => null)
          if (!lotRes.ok || lotJson?.error) warnings.push('lots')
        } catch {
          warnings.push('lots')
        }
      }

      clearDraft()
      const target = warnings.length > 0
        ? `/immobilier/${propertyId}?warn=${warnings.join(',')}`
        : `/immobilier/${propertyId}`
      router.push(target)
    } catch {
      setError('Erreur réseau. Réessayez.')
      setLoading(false)
    }
  }

  // ─── Helpers UI ─────────────────────────────────────────────────

  function autoNotaryFees() {
    if (!draft.purchase_price) return
    const isNew = draft.construction_year && draft.construction_year > new Date().getFullYear() - 5
    const pct = isNew ? 0.025 : 0.075
    set('purchase_fees', Math.round(draft.purchase_price * pct))
  }

  const totalCost =
    (draft.purchase_price ?? 0) +
    (draft.purchase_fees  ?? 0) +
    (draft.works_amount   ?? 0) +
    (draft.furniture_amount ?? 0)

  const loanPreview =
    draft.hasLoan && draft.loan_principal && draft.loan_rate != null && draft.loan_duration
      ? computeMonthlyPayment(draft.loan_principal, draft.loan_rate, draft.loan_duration / 12)
      : null

  // V12 — `isRentalUsage` consomme le helper partagé `isRentalWizardUsage`.
  const isRentalUsage = isRentalWizardUsage(draft.usage_type)

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/immobilier" className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors w-fit">
        <ArrowLeft size={14} />
        Retour à l&apos;immobilier
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-primary">Ajouter un bien immobilier</h1>
        <p className="text-sm text-secondary mt-1">
          {step}/{TOTAL_STEPS} — vous pouvez revenir à n&apos;importe quelle étape précédente.
        </p>
      </div>

      <div className="card p-4">
        <Stepper steps={[...STEPS]} current={step} onJump={(i) => { if (i < step) setStep(i) }} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (step < TOTAL_STEPS) goNext(); else submit() }} className="space-y-6">

        {/* ──────── Étape 1 — Identification ──────── */}
        {step === 1 && (
          <div className="card p-6 space-y-5">
            <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Identification</h2>

            <Field label="Nom du bien" required>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)}
                placeholder="ex : Appartement T3 Rennes" required />
            </Field>

            <Field label="Type d'usage" required
              hint="Détermine les calculs affichés (loyers/rentabilité pour un locatif vs coût de possession pour une RP).">
              <Select value={draft.usage_type}
                onChange={(e) => set('usage_type', e.target.value as UsageType)} required>
                <option value="long_term_rental">Investissement locatif — longue durée</option>
                <option value="short_term_rental">Investissement locatif — courte durée (saisonnier)</option>
                <option value="mixed_use">Usage mixte (occupé + loué)</option>
                <option value="primary_residence">Résidence principale</option>
                <option value="secondary_residence">Résidence secondaire</option>
              </Select>
            </Field>

            <FormGrid>
              <Field label="Type de bien" required>
                <Select value={draft.property_type} onChange={(e) => set('property_type', e.target.value)}>
                  <option value="apartment">Appartement</option>
                  <option value="house">Maison</option>
                  <option value="building">Immeuble de rapport</option>
                  <option value="garage">Garage / Parking</option>
                  <option value="commercial">Local commercial</option>
                  <option value="land">Terrain</option>
                  <option value="other">Autre</option>
                </Select>
              </Field>
              <Field label="Surface (m²)" required>
                <Input type="number" min={1} step={0.1}
                  value={draft.surface_m2 ?? ''}
                  onChange={(e) => setNum('surface_m2', e.target.value)}
                  placeholder="65" required />
              </Field>
            </FormGrid>

            <Field label="Adresse">
              <Input value={draft.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                placeholder="12 rue de la Paix" />
            </Field>
            <FormGrid>
              <Field label="Code postal">
                <Input value={draft.address_zip}
                  onChange={(e) => set('address_zip', e.target.value)} placeholder="75001" />
              </Field>
              <Field label="Ville" required>
                <Input value={draft.address_city}
                  onChange={(e) => set('address_city', e.target.value)} placeholder="Paris" required />
              </Field>
            </FormGrid>

            <FormGrid cols={3}>
              <Field label="Nb pièces">
                <Input type="number" min={0}
                  value={draft.rooms ?? ''}
                  onChange={(e) => setNum('rooms', e.target.value)}
                  placeholder="3" />
              </Field>
              <Field label="Année construction">
                <Input type="number" min={1800} max={2030}
                  value={draft.construction_year ?? ''}
                  onChange={(e) => setNum('construction_year', e.target.value)}
                  placeholder="1990" />
              </Field>
              <Field label="DPE">
                <Select value={draft.dpe_class} onChange={(e) => set('dpe_class', e.target.value)}>
                  <option value="">—</option>
                  {['A','B','C','D','E','F','G'].map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </FormGrid>
          </div>
        )}

        {/* ──────── Étape 2 — Acquisition ──────── */}
        {step === 2 && (
          <div className="card p-6 space-y-5">
            <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Acquisition & financement</h2>

            <FormGrid>
              <Field label="Prix net vendeur (€)" required>
                <Input type="number" min={0}
                  value={draft.purchase_price ?? ''}
                  onChange={(e) => setNum('purchase_price', e.target.value)}
                  placeholder="200 000" required />
              </Field>
              <Field label="Date d'acquisition" required>
                <Input type="date" value={draft.acquisition_date}
                  onChange={(e) => set('acquisition_date', e.target.value)} required />
              </Field>
            </FormGrid>

            <Field label="Frais de notaire (€)" required>
              <div className="flex items-center gap-2">
                <Input type="number" min={0}
                  value={draft.purchase_fees ?? ''}
                  onChange={(e) => setNum('purchase_fees', e.target.value)}
                  placeholder="16 000" required className="flex-1" />
                <Button type="button" variant="secondary" size="sm" onClick={autoNotaryFees}>
                  Calculer auto
                </Button>
              </div>
            </Field>

            <FormGrid>
              <Field label="Travaux (€)">
                <Input type="number" min={0}
                  value={draft.works_amount ?? ''}
                  onChange={(e) => setNum('works_amount', e.target.value)}
                  placeholder="0" />
              </Field>
              {isRentalUsage && (
                <Field label="Mobilier — LMNP (€)" hint="Amortissable séparément">
                  <Input type="number" min={0}
                    value={draft.furniture_amount ?? ''}
                    onChange={(e) => setNum('furniture_amount', e.target.value)}
                    placeholder="0" />
                </Field>
              )}
            </FormGrid>

            {totalCost > 0 && (
              <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
                <span className="text-secondary">Prix de revient total : </span>
                <span className="text-primary font-medium financial-value">
                  {formatCurrency(totalCost, 'EUR')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ──────── Étape 3 — Crédit (facultative) ──────── */}
        {step === 3 && (
          <div className="card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Crédit immobilier</h2>
              {!draft.hasLoan && (
                <Button type="button" variant="secondary" size="sm" onClick={() => set('hasLoan', true)}>
                  + Saisir un crédit
                </Button>
              )}
            </div>

            {!draft.hasLoan ? (
              <p className="text-sm text-secondary">
                Vous pouvez passer cette étape et renseigner votre crédit plus tard depuis la fiche du bien.
              </p>
            ) : (
              <div className="space-y-5">
                <FormGrid>
                  <Field label="Type de prêt" required>
                    <Select value={draft.loan_kind}
                      onChange={(e) => set('loan_kind', e.target.value as LoanKind)} required>
                      <option value="principal">Prêt principal</option>
                      <option value="ptz">PTZ (Prêt à Taux Zéro)</option>
                      <option value="travaux">Prêt travaux</option>
                      <option value="pel">PEL / CEL</option>
                      <option value="action_logement">Action Logement</option>
                      <option value="relais">Prêt relais</option>
                      <option value="in_fine">Prêt in fine</option>
                      <option value="autre">Autre</option>
                    </Select>
                  </Field>
                  <Field label="Organisme prêteur">
                    <Input value={draft.lender}
                      onChange={(e) => set('lender', e.target.value)}
                      placeholder="Crédit Agricole" />
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label="Montant emprunté (€)" required>
                    <Input type="number" min={0}
                      value={draft.loan_principal ?? ''}
                      onChange={(e) => setNum('loan_principal', e.target.value)}
                      placeholder="180 000" required />
                  </Field>
                  <Field label="Date de début" required>
                    <Input type="date" value={draft.loan_start_date}
                      onChange={(e) => set('loan_start_date', e.target.value)} required />
                  </Field>
                </FormGrid>
                <FormGrid cols={3}>
                  <Field label="Taux nominal (%)" required>
                    <Input type="number" step={0.01} min={0} max={20}
                      value={draft.loan_rate ?? ''}
                      onChange={(e) => setNum('loan_rate', e.target.value)}
                      placeholder="3.50" required />
                  </Field>
                  <Field label="Durée (mois)" required>
                    <Input type="number" min={1} max={480}
                      value={draft.loan_duration ?? ''}
                      onChange={(e) => setNum('loan_duration', e.target.value)}
                      placeholder="240" required />
                  </Field>
                  <Field label="Assurance (%)">
                    <Input type="number" step={0.01} min={0} max={3}
                      value={draft.insurance_rate ?? ''}
                      onChange={(e) => setNum('insurance_rate', e.target.value)}
                      placeholder="0.30" />
                  </Field>
                </FormGrid>
                {loanPreview && (
                  <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
                    <span className="text-secondary">Mensualité estimée (hors assurance) : </span>
                    <span className="text-primary font-medium financial-value">
                      {formatCurrency(loanPreview, 'EUR')} / mois
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ──────── Étape 4 — Régime fiscal (locatif uniquement) ──────── */}
        {step === 4 && isRentalUsage && (
          <div className="card p-6 space-y-5">
            <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Régime fiscal</h2>
            <Field label="Quel est votre régime fiscal pour ce bien ?" required>
              <Select value={draft.fiscal_regime}
                onChange={(e) => set('fiscal_regime', e.target.value as FiscalRegime)} required>
                <option value="" disabled>— Choisir un régime —</option>
                <option value="foncier_micro">Micro-foncier (location nue, &lt; 15 000 €/an)</option>
                <option value="foncier_nu">Foncier réel (location nue)</option>
                <option value="lmnp_micro">LMNP micro-BIC (meublé)</option>
                <option value="lmnp_reel">LMNP réel (meublé avec amortissements)</option>
                <option value="lmp">LMP (loueur professionnel)</option>
                <option value="sci_is">SCI à l&apos;IS</option>
                <option value="sci_ir">SCI à l&apos;IR</option>
              </Select>
            </Field>
            {draft.fiscal_regime !== '' && (
              <div className="border border-accent/20 bg-accent/5 rounded-lg p-3 text-xs text-secondary">
                <p className="font-medium text-primary mb-1">
                  {FISCAL_REGIME_DESCRIPTIONS[draft.fiscal_regime].label}
                </p>
                {FISCAL_REGIME_DESCRIPTIONS[draft.fiscal_regime].help}
              </div>
            )}

            {/* Mig 037 — Solde CCA (apports de l'associé) uniquement pour SCI à l'IS.
                Sert ensuite à l'option "remboursement CCA" du bloc Distribution
                (fiscalement neutre, plafonné au cash de l'année). */}
            {draft.fiscal_regime === 'sci_is' && (
              <Field
                label="Compte courant d'associé (CCA, €)"
                hint="Apports déjà versés par l'associé à la SCI. Leur remboursement est fiscalement neutre — laissez à 0 si aucun apport."
              >
                <Input type="number" min={0} step={100}
                  value={draft.cca_amount ?? ''}
                  onChange={(e) => setNum('cca_amount', e.target.value)}
                  placeholder="0" />
              </Field>
            )}
          </div>
        )}

        {/* ──────── V12 — Étape 4 RP/RS : Récapitulatif (remplace Régime + Lots) ──────── */}
        {step === 4 && !isRentalUsage && (
          <div className="card p-6 space-y-5">
            <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Récapitulatif</h2>
            <p className="text-sm text-secondary">
              {draft.usage_type === 'primary_residence'
                ? 'Résidence principale — pas de régime fiscal locatif ni de lot à saisir. Vérifiez les informations puis enregistrez.'
                : 'Résidence secondaire — pas de régime fiscal locatif ni de lot à saisir. Vérifiez les informations puis enregistrez.'}
            </p>
            <div className="border-t border-border pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Nom</p>
                <p className="text-primary font-medium mt-0.5">{draft.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Adresse</p>
                <p className="text-primary mt-0.5">
                  {[draft.address_zip, draft.address_city].filter(Boolean).join(' ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Prix d&apos;acquisition</p>
                <p className="text-primary financial-value mt-0.5">
                  {draft.purchase_price ? formatCurrency(draft.purchase_price, 'EUR') : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Crédit</p>
                <p className="text-primary mt-0.5">
                  {draft.hasLoan && draft.loan_principal
                    ? `${formatCurrency(draft.loan_principal, 'EUR')} sur ${draft.loan_duration ?? 0} mois`
                    : 'Achat comptant'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ──────── Étape 5 — Lots & loyers ──────── */}
        {step === 5 && (
          <div className="card p-6 space-y-5">
            <h2 className="text-sm font-medium text-secondary uppercase tracking-widest">Lots & loyers</h2>

            {!isRentalUsage ? (
              <p className="text-sm text-secondary">
                Aucun loyer à saisir pour une résidence principale ou secondaire (vous pourrez en ajouter plus tard
                si vous décidez de louer ponctuellement).
              </p>
            ) : !draft.hasLot ? (
              <div className="space-y-3">
                <p className="text-sm text-secondary">
                  {draft.usage_type === 'short_term_rental'
                    ? 'Vous pouvez ajouter votre premier lot saisonnier maintenant, ou le faire plus tard depuis la fiche du bien.'
                    : 'Vous pouvez ajouter un lot avec son loyer maintenant, ou le faire plus tard depuis la fiche du bien.'}
                </p>
                <Button type="button" variant="secondary" size="sm"
                  onClick={() => { set('hasLot', true); set('lot_name', draft.name) }}>
                  + {draft.usage_type === 'short_term_rental' ? 'Ajouter un lot saisonnier' : 'Ajouter un lot loué'}
                </Button>
              </div>
            ) : draft.usage_type === 'short_term_rental' ? (
              <div className="space-y-4">
                <Field label="Nom du lot" required>
                  <Input value={draft.lot_name}
                    onChange={(e) => set('lot_name', e.target.value)}
                    placeholder="ex : Appartement entier, Studio …" />
                </Field>
                <FormGrid>
                  <Field label="Tarif nuit basse saison (€)" required>
                    <Input type="number" min={0} step={1}
                      value={draft.lot_nightly_rate_low ?? ''}
                      onChange={(e) => setNum('lot_nightly_rate_low', e.target.value)}
                      placeholder="80" />
                  </Field>
                  <Field label="Taux d'occupation annuel (%)">
                    <Input type="number" min={0} max={100} step={1}
                      value={draft.lot_occupancy_rate_pct ?? ''}
                      onChange={(e) => setNum('lot_occupancy_rate_pct', e.target.value)}
                      placeholder="70" />
                  </Field>
                </FormGrid>
                <FormGrid>
                  <Field label="Durée moyenne séjour (nuits)">
                    <Input type="number" min={1} step={0.5}
                      value={draft.lot_avg_stay_nights ?? ''}
                      onChange={(e) => setNum('lot_avg_stay_nights', e.target.value)}
                      placeholder="3" />
                  </Field>
                  <Field label="Classement Atout France"
                    hint="Pilote l'abattement micro-BIC LF 2025">
                    <Select
                      value={draft.lot_tourism_classification}
                      onChange={(e) => set('lot_tourism_classification', e.target.value as WizardDraft['lot_tourism_classification'])}
                    >
                      <option value="">— À sélectionner —</option>
                      <option value="non_classe">Non classé (30 % / 15 000 €)</option>
                      <option value="classe_1_2">Classé 1-2 étoiles (50 % / 77 700 €)</option>
                      <option value="classe_3_4_5">Classé 3-4-5 étoiles (50 % / 77 700 €)</option>
                      <option value="chambre_hotes">Chambre d&apos;hôtes (71 % / 188 700 €)</option>
                    </Select>
                  </Field>
                </FormGrid>
                <p className="text-xs text-muted">
                  Par défaut : 100 % via Airbnb, commission 15 %. Vous pourrez affiner les
                  plateformes, frais ménage, conciergerie et saisonnalité depuis la fiche du bien.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Nom du lot" required>
                  <Input value={draft.lot_name}
                    onChange={(e) => set('lot_name', e.target.value)}
                    placeholder="ex : Appartement, T2 RDC, …" />
                </Field>
                <FormGrid>
                  <Field label="Loyer mensuel HC (€)" required>
                    <Input type="number" min={0}
                      value={draft.lot_rent ?? ''}
                      onChange={(e) => setNum('lot_rent', e.target.value)}
                      placeholder="750" />
                  </Field>
                  <Field label="Charges locataire (€/mois)">
                    <Input type="number" min={0}
                      value={draft.lot_charges ?? ''}
                      onChange={(e) => setNum('lot_charges', e.target.value)}
                      placeholder="80" />
                  </Field>
                </FormGrid>
                <Field label="Loyer de marché (€/mois)"
                  hint="Optionnel — sert à détecter un bien sous-loué.">
                  <Input type="number" min={0}
                    value={draft.lot_market_rent ?? ''}
                    onChange={(e) => setNum('lot_market_rent', e.target.value)}
                    placeholder="800" />
                </Field>
              </div>
            )}

            <Field label="Notes (optionnel)">
              <Textarea value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Observations, contexte d'acquisition…" rows={2} />
            </Field>
          </div>
        )}

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-4 py-3 rounded-lg">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pb-8">
          <Button type="button" variant="secondary"
            onClick={() => { clearDraft(); setDraft(EMPTY_DRAFT); setStep(1); setError(null) }}
            icon={RotateCcw}>
            Réinitialiser
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button type="button" variant="secondary" onClick={goPrev}>
                <ArrowLeft size={14} />
                Précédent
              </Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button type="submit">
                Suivant
                <ArrowRight size={14} />
              </Button>
            ) : (
              <Button type="submit" loading={loading} icon={Save}>
                Enregistrer le bien
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
