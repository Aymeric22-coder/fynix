'use client'

/**
 * Formulaire de saisie / édition du crédit d'un bien immobilier.
 * Migration 006 — remplace le `add-debt-form.tsx` standalone.
 *
 * - Reprend 1:1 la UX du form Dette historique (champs + différé)
 * - Ajoute les champs migration 006 : assurance base/quotité, type garantie
 * - Preview live : mensualité capital+intérêts, assurance, mensualité totale,
 *   coût total, TAEG approximatif
 * - POST/PUT vers /api/real-estate/[propertyId]/credit (upsert)
 * - DELETE si l'utilisateur "détache" le crédit
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { buildAmortizationSchedule } from '@/lib/real-estate/amortization'
import type { LoanInput } from '@/lib/real-estate/types'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExistingCredit {
  id?:                  string
  name:                 string
  lender:               string | null
  initial_amount:       number | null
  interest_rate:        number | null
  insurance_rate:       number | null
  duration_months:      number | null
  start_date:           string | null
  deferral_type:        'none' | 'partial' | 'total'
  deferral_months:      number
  bank_fees:            number
  guarantee_fees:       number
  amortization_type:    'constant' | 'linear' | 'in_fine'
  insurance_base:       'capital_initial' | 'capital_remaining'
  insurance_quotite:    number
  guarantee_type:       'hypotheque' | 'caution' | 'ppd' | 'autre'
  notes:                string | null
}

interface Props {
  open:        boolean
  onClose:     () => void
  propertyId:  string
  /** Crédit existant (édition) ; absent = création */
  existing?:   ExistingCredit | null
  /** Nom du bien (pour pré-remplir le libellé du crédit en création) */
  propertyName?: string
}

function makeInitial(name: string) {
  return {
    name,
    lender:             '' as string,
    initial_amount:     null as number | null,
    interest_rate:      null as number | null,
    insurance_rate:     0.30 as number,
    duration_months:    240 as number,
    start_date:         new Date().toISOString().split('T')[0]! as string,
    deferral_type:      'none' as 'none' | 'partial' | 'total',
    deferral_months:    0 as number,
    bank_fees:          0 as number,
    guarantee_fees:     0 as number,
    amortization_type:  'constant' as 'constant' | 'linear' | 'in_fine',
    insurance_base:     'capital_initial' as 'capital_initial' | 'capital_remaining',
    insurance_quotite:  100 as number,
    guarantee_type:     'caution' as 'hypotheque' | 'caution' | 'ppd' | 'autre',
    notes:              '' as string,
  }
}

// ─── Composant ─────────────────────────────────────────────────────────────

export function CreditForm({ open, onClose, propertyId, existing, propertyName }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const initialValues = existing
    ? {
        name:              existing.name,
        lender:            existing.lender ?? '',
        initial_amount:    existing.initial_amount,
        interest_rate:     existing.interest_rate,
        insurance_rate:    existing.insurance_rate ?? 0,
        duration_months:   existing.duration_months ?? 240,
        start_date:        existing.start_date ?? new Date().toISOString().split('T')[0]!,
        deferral_type:     existing.deferral_type,
        deferral_months:   existing.deferral_months,
        bank_fees:         existing.bank_fees,
        guarantee_fees:    existing.guarantee_fees,
        amortization_type: existing.amortization_type,
        insurance_base:    existing.insurance_base,
        insurance_quotite: existing.insurance_quotite,
        guarantee_type:    existing.guarantee_type,
        notes:             existing.notes ?? '',
      }
    : makeInitial(propertyName ? `Crédit ${propertyName}` : 'Crédit')

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues,
    async onSubmit(v) {
      // Validation minimale
      if (!v.initial_amount || v.initial_amount <= 0) return { error: 'Montant emprunté requis' }
      if (v.interest_rate == null || v.interest_rate < 0) return { error: 'Taux nominal requis' }
      if (!v.duration_months || v.duration_months <= 0) return { error: 'Durée requise' }
      if (v.deferral_type !== 'none' && v.deferral_months >= v.duration_months) {
        return { error: 'Durée différé doit être < durée totale' }
      }

      const res = await fetch(`/api/real-estate/${propertyId}/credit`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:              v.name,
          lender:            v.lender || null,
          initial_amount:    v.initial_amount,
          interest_rate:     v.interest_rate,
          insurance_rate:    v.insurance_rate ?? 0,
          duration_months:   v.duration_months,
          start_date:        v.start_date,
          deferral_type:     v.deferral_type,
          deferral_months:   v.deferral_months,
          bank_fees:         v.bank_fees,
          guarantee_fees:    v.guarantee_fees,
          amortization_type: v.amortization_type,
          insurance_base:    v.insurance_base,
          insurance_quotite: v.insurance_quotite,
          guarantee_type:    v.guarantee_type,
          notes:             v.notes || null,
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); onClose(); router.refresh() },
  })

  // Preview live
  const preview = useMemo(() => {
    if (
      !values.initial_amount || values.initial_amount <= 0 ||
      values.interest_rate == null ||
      !values.duration_months
    ) return null

    const loan: LoanInput = {
      principal:           values.initial_amount,
      annualRatePct:       values.interest_rate,
      durationYears:       values.duration_months / 12,
      insuranceRatePct:    values.insurance_rate ?? 0,
      bankFees:            values.bank_fees,
      guaranteeFees:       values.guarantee_fees,
      deferralType:        values.deferral_type,
      deferralMonths:      values.deferral_months,
      insuranceBase:       values.insurance_base,
      insuranceQuotitePct: values.insurance_quotite,
    }

    try {
      return buildAmortizationSchedule(loan)
    } catch {
      return null
    }
  }, [values])

  // ── Suppression du crédit ──
  async function handleDelete() {
    if (!existing?.id) return
    setDeleting(true)
    const res = await fetch(`/api/real-estate/${propertyId}/credit`, { method: 'DELETE' })
    setDeleting(false)
    const json = await res.json()
    if (json.error) {
      alert(json.error)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Modifier le crédit' : 'Ajouter un crédit'}
      subtitle="Toutes les valeurs sont recalculées dynamiquement"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Identité du crédit */}
        <FormSection>
          <FormGrid>
            <Field label="Libellé" required>
              <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ex : Crédit acquisition" required />
            </Field>
            <Field label="Organisme prêteur">
              <Input value={values.lender ?? ''} onChange={(e) => set('lender', e.target.value)} placeholder="Crédit Agricole" />
            </Field>
          </FormGrid>
        </FormSection>

        {/* Paramètres financiers */}
        <FormSection title="Paramètres financiers">
          <FormGrid>
            <Field label="Montant emprunté (€)" required>
              <Input
                type="number" min={0}
                value={values.initial_amount ?? ''}
                onChange={(e) => setNumber('initial_amount', e.target.value)}
                placeholder="200 000" required
              />
            </Field>
            <Field label="Date de début" required>
              <Input
                type="date" value={values.start_date ?? ''}
                onChange={(e) => set('start_date', e.target.value)} required
              />
            </Field>
          </FormGrid>
          <FormGrid cols={3}>
            <Field label="Taux nominal (%)" required hint="Taux annuel hors assurance">
              <Input
                type="number" step={0.01} min={0}
                value={values.interest_rate ?? ''}
                onChange={(e) => setNumber('interest_rate', e.target.value)}
                placeholder="3.50" required
              />
            </Field>
            <Field label="Durée (mois)" required>
              <Input
                type="number" min={1} max={480}
                value={values.duration_months ?? ''}
                onChange={(e) => setNumber('duration_months', e.target.value)}
                placeholder="240" required
              />
            </Field>
            <Field label="Amortissement">
              <Select value={values.amortization_type} onChange={(e) => set('amortization_type', e.target.value as ExistingCredit['amortization_type'])}>
                <option value="constant">Échéances constantes</option>
                <option value="linear" disabled>Linéaire (à venir)</option>
                <option value="in_fine" disabled>In fine (à venir)</option>
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        {/* Assurance emprunteur */}
        <FormSection title="Assurance emprunteur">
          <FormGrid cols={3}>
            <Field label="Taux annuel (%)" hint="0 si pas d'assurance">
              <Input
                type="number" step={0.01} min={0}
                value={values.insurance_rate ?? ''}
                onChange={(e) => setNumber('insurance_rate', e.target.value)}
                placeholder="0.30"
              />
            </Field>
            <Field label="Quotité (%)" hint="100 = mono / 200 = couple 100/100">
              <Input
                type="number" step={1} min={0} max={200}
                value={values.insurance_quotite}
                onChange={(e) => setNumber('insurance_quotite', e.target.value)}
              />
            </Field>
            <Field label="Base de calcul">
              <Select value={values.insurance_base} onChange={(e) => set('insurance_base', e.target.value as ExistingCredit['insurance_base'])}>
                <option value="capital_initial">Capital initial (fixe)</option>
                <option value="capital_remaining">Capital restant dû (dégressive)</option>
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        {/* Différé */}
        <FormSection title="Différé">
          <FormGrid>
            <Field label="Type">
              <Select value={values.deferral_type} onChange={(e) => set('deferral_type', e.target.value as ExistingCredit['deferral_type'])}>
                <option value="none">Aucun</option>
                <option value="partial">Partiel (intérêts seulement)</option>
                <option value="total">Total (aucun paiement)</option>
              </Select>
            </Field>
            <Field label="Durée différé (mois)">
              <Input
                type="number" min={0} max={60}
                value={values.deferral_months}
                onChange={(e) => setNumber('deferral_months', e.target.value)}
                disabled={values.deferral_type === 'none'}
              />
            </Field>
          </FormGrid>
        </FormSection>

        {/* Frais & garantie */}
        <FormSection title="Frais & garantie">
          <FormGrid cols={3}>
            <Field label="Frais de dossier (€)">
              <Input
                type="number" min={0}
                value={values.bank_fees}
                onChange={(e) => setNumber('bank_fees', e.target.value)}
                placeholder="800"
              />
            </Field>
            <Field label="Frais de garantie (€)">
              <Input
                type="number" min={0}
                value={values.guarantee_fees}
                onChange={(e) => setNumber('guarantee_fees', e.target.value)}
                placeholder="1 500"
              />
            </Field>
            <Field label="Type de garantie">
              <Select value={values.guarantee_type} onChange={(e) => set('guarantee_type', e.target.value as ExistingCredit['guarantee_type'])}>
                <option value="caution">Caution organisme</option>
                <option value="hypotheque">Hypothèque</option>
                <option value="ppd">Privilège de prêteur (PPD)</option>
                <option value="autre">Autre</option>
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        <Field label="Notes">
          <Textarea value={values.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Conditions particulières…" rows={2} />
        </Field>

        {/* Preview live */}
        {preview && (
          <div className="bg-accent-muted border border-accent/20 rounded-lg p-4 space-y-2">
            <p className="text-xs text-secondary uppercase tracking-widest font-medium mb-2">Estimation live</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Mensualité</p>
                <p className="financial-value text-primary font-semibold">{formatCurrency(preview.totalMonthly, 'EUR')}</p>
                <p className="text-xs text-muted">capital + intérêts + assurance</p>
              </div>
              <div>
                <p className="text-xs text-muted">Coût total crédit</p>
                <p className="financial-value text-primary font-semibold">{formatCurrency(preview.totalCost, 'EUR', { compact: true })}</p>
                <p className="text-xs text-muted">intérêts + assurance + frais</p>
              </div>
              <div>
                <p className="text-xs text-muted">TAEG approx.</p>
                <p className="financial-value text-accent font-semibold">{formatPercent(preview.aprPct)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Frais</p>
                <p className="financial-value text-primary font-semibold">{formatCurrency(preview.totalFees, 'EUR')}</p>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-between items-center gap-3 pt-2 border-t border-border">
          <div>
            {existing?.id && (
              !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-danger hover:text-danger/80 px-2 py-1.5"
                >
                  <Trash2 size={12} />
                  Détacher le crédit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-secondary">Confirmer ?</span>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-secondary hover:text-primary px-2 py-1">Non</button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs bg-danger text-white rounded px-2 py-1 hover:bg-danger/90"
                  >
                    {deleting ? 'Suppression…' : 'Oui, supprimer'}
                  </button>
                </div>
              )
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
            <Button type="submit" loading={loading}>{existing ? 'Enregistrer' : 'Créer le crédit'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
