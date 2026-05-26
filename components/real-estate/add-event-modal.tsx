'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'
import type { PropertyEvent, PropertyEventKind } from '@/types/database.types'

interface LotOption { id: string; name: string; rent_amount: number | null }

interface Props {
  open:        boolean
  onClose:     () => void
  propertyId:  string
  lots:        LotOption[]
  /** Si fourni : édition d'un événement existant. Sinon : création. */
  existing?:   PropertyEvent | null
  /** Reorganise les kinds : courte duree en premier si true. */
  isShortTerm?: boolean
}

const KIND_OPTIONS_LONG_TERM: Array<{ value: PropertyEventKind; label: string }> = [
  { value: 'rent_unpaid',        label: 'Loyer impayé' },
  { value: 'vacancy',            label: 'Vacance locative' },
  { value: 'rent_revision',      label: 'Révision de loyer' },
  { value: 'exceptional_charge', label: 'Charge exceptionnelle' },
  { value: 'unplanned_works',    label: 'Travaux imprévus' },
  { value: 'insurance_claim',    label: 'Sinistre / remboursement' },
  { value: 'rent_paid_late',     label: 'Loyer payé en retard' },
  { value: 'other',              label: 'Autre' },
]

const KIND_OPTIONS_SHORT_TERM: Array<{ value: PropertyEventKind; label: string }> = [
  { value: 'booking_cancellation', label: 'Annulation de réservation' },
  { value: 'platform_payout',      label: 'Virement plateforme reçu' },
  { value: 'guest_damage',         label: 'Dégradation voyageur' },
  { value: 'platform_dispute',     label: 'Litige plateforme' },
  { value: 'seasonal_closure',     label: 'Fermeture saisonnière' },
]

const TODAY = () => new Date().toISOString().split('T')[0]!

export function AddEventModal({ open, onClose, propertyId, lots, existing, isShortTerm }: Props) {
  const router = useRouter()
  // Ordre des kinds : courte duree d'abord si le bien est short-term, sinon long_term
  const KIND_OPTIONS = isShortTerm
    ? [...KIND_OPTIONS_SHORT_TERM, ...KIND_OPTIONS_LONG_TERM]
    : [...KIND_OPTIONS_LONG_TERM, ...KIND_OPTIONS_SHORT_TERM]
  const defaultKind: PropertyEventKind = isShortTerm ? 'booking_cancellation' : 'rent_unpaid'
  const [kind, setKind]         = useState<PropertyEventKind>(existing?.kind ?? defaultKind)
  const [eventDate, setEventDate] = useState(existing?.event_date ?? TODAY())
  const [lotId, setLotId]       = useState<string | null>(existing?.lot_id ?? (lots[0]?.id ?? null))
  const [amount, setAmount]     = useState<number | ''>(existing?.amount_eur ?? '')
  const [periodStart, setPeriodStart] = useState(existing?.period_start ?? '')
  const [periodEnd, setPeriodEnd]     = useState(existing?.period_end ?? '')
  const [isResolved, setIsResolved]   = useState(existing?.is_resolved ?? false)
  const [resolvedDate, setResolvedDate] = useState(existing?.resolved_date ?? '')
  const [resolutionNote, setResolutionNote] = useState(existing?.resolution_note ?? '')
  const [label, setLabel]       = useState(existing?.label ?? '')
  const [notes, setNotes]       = useState(existing?.notes ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // Pré-remplir le montant à partir du loyer du lot pour les types pertinents
  const selectedLot = lots.find(l => l.id === lotId)
  useEffect(() => {
    if (existing) return
    if ((kind === 'rent_unpaid' || kind === 'rent_paid_late' || kind === 'rent_revision') && selectedLot?.rent_amount && amount === '') {
      setAmount(kind === 'rent_unpaid' ? -selectedLot.rent_amount : selectedLot.rent_amount)
    }
  }, [kind, lotId])  // eslint-disable-line react-hooks/exhaustive-deps

  // Calcul du montant vacance (auto, info)
  const vacancyPreview = (() => {
    if (kind !== 'vacancy' || !selectedLot?.rent_amount || !periodStart || !periodEnd) return null
    const ps = new Date(periodStart)
    const pe = new Date(periodEnd)
    if (pe < ps) return null
    const days = Math.round((pe.getTime() - ps.getTime()) / (1000 * 60 * 60 * 24))
    const dailyRent = (selectedLot.rent_amount * 12) / 365
    return dailyRent * days
  })()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // V10.1 — ROB-103 (client) : interdire période inversée avant l'appel API.
    // Le serveur valide aussi (défense en profondeur) — cf. events/route.ts POST.
    if (periodStart && periodEnd && periodEnd < periodStart) {
      setError('La date de fin doit être ≥ date de début.')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        kind, event_date: eventDate, lot_id: lotId,
        amount_eur: amount === '' ? null : amount,
        period_start: periodStart || null,
        period_end:   periodEnd   || null,
        is_resolved: isResolved,
        resolved_date: isResolved ? (resolvedDate || null) : null,
        resolution_note: isResolved ? (resolutionNote || null) : null,
        label: label || null,
        notes: notes || null,
      }

      const url = existing
        ? `/api/real-estate/${propertyId}/events/${existing.id}`
        : `/api/real-estate/${propertyId}/events`
      const method = existing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      onClose()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const showLot = ['rent_unpaid', 'vacancy', 'rent_revision', 'rent_paid_late'].includes(kind)
  const showPeriod = ['vacancy', 'booking_cancellation', 'platform_payout', 'seasonal_closure'].includes(kind)
  const showResolution = ['rent_unpaid', 'rent_paid_late', 'insurance_claim', 'exceptional_charge', 'unplanned_works', 'guest_damage', 'platform_dispute'].includes(kind)
  const hideAmount = kind === 'vacancy' || kind === 'seasonal_closure'

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose() }}
      title={existing ? "Modifier l'événement" : 'Ajouter un événement'}
      size="md"
    >
      <form onSubmit={handleSave} className="space-y-4">

        <Field label="Type d'événement" required>
          <Select value={kind} onChange={(e) => setKind(e.target.value as PropertyEventKind)} required>
            {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>

        <FormGrid>
          <Field label="Date" required>
            <Input type="date" value={eventDate}
              onChange={(e) => setEventDate(e.target.value)} required />
          </Field>
          {showLot && lots.length > 0 && (
            <Field label="Lot concerné">
              <Select value={lotId ?? ''} onChange={(e) => setLotId(e.target.value || null)}>
                {lots.length > 1 && <option value="">— Tous les lots —</option>}
                {lots.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </FormGrid>

        {showPeriod && (
          <FormGrid>
            <Field
              label={
                kind === 'booking_cancellation' ? 'Début du séjour annulé' :
                kind === 'platform_payout'      ? 'Période couverte — début' :
                kind === 'seasonal_closure'     ? 'Début de fermeture' :
                'Début vacance'
              }
              required
            >
              <Input type="date" value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)} required />
            </Field>
            <Field
              label={
                kind === 'booking_cancellation' ? 'Fin du séjour annulé' :
                kind === 'platform_payout'      ? 'Période couverte — fin' :
                kind === 'seasonal_closure'     ? 'Fin de fermeture' :
                'Fin vacance'
              }
              hint={kind === 'vacancy' ? 'Laisser vide si en cours' : undefined}
            >
              <Input type="date" value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </FormGrid>
        )}

        {!hideAmount && (
          <Field
            label={
              kind === 'rent_revision'        ? 'Nouveau loyer mensuel (€)' :
              kind === 'insurance_claim'      ? 'Montant signé (€) — négatif=sinistre / positif=remboursement' :
              kind === 'booking_cancellation' ? 'Manque à gagner (€)' :
              kind === 'platform_payout'      ? 'Montant reçu (€)' :
              kind === 'guest_damage'         ? 'Coût réparation (€) — net après remboursement' :
              kind === 'platform_dispute'     ? 'Remboursement forcé (€) — montant débité' :
              kind === 'other'                ? 'Montant signé (€)' :
              'Montant (€)'
            }
            hint={
              kind === 'rent_unpaid'           ? 'Négatif (montant non perçu).' :
              kind === 'rent_revision'         ? 'Le loyer du lot sera mis à jour automatiquement.' :
              kind === 'exceptional_charge' || kind === 'unplanned_works' ? 'Négatif (sortie de cash).' :
              kind === 'booking_cancellation'  ? 'Négatif (perte). Indiquez le CA prévu non perçu après éventuel dédommagement.' :
              kind === 'platform_payout'       ? 'Positif (encaissement). Utile pour pointer les virements réels.' :
              kind === 'guest_damage'          ? 'Négatif (sortie de cash après prise en charge plateforme / assurance).' :
              kind === 'platform_dispute'      ? 'Négatif (remboursement imposé par la plateforme).' :
              undefined
            }
          >
            <Input
              type="number" step={0.01}
              value={amount === '' ? '' : String(amount)}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
            />
          </Field>
        )}

        {vacancyPreview !== null && (
          <div className="bg-surface-2 rounded-md p-3 text-sm">
            <span className="text-secondary">Perte estimée : </span>
            <span className="text-danger financial-value">
              −{formatCurrency(vacancyPreview, 'EUR')}
            </span>
          </div>
        )}

        <Field
          label="Libellé"
          hint={
            kind === 'booking_cancellation' ? 'Ex : « Airbnb — Famille Dupont », « Booking — Sem. 32 »' :
            kind === 'platform_payout'      ? 'Ex : « Airbnb — Juil. 2026 », « Booking — Q3 »' :
            kind === 'guest_damage'         ? 'Ex : « TV cassée », « Tâche canapé »' :
            kind === 'platform_dispute'     ? 'Ex : « Litige nettoyage — Airbnb »' :
            kind === 'seasonal_closure'     ? 'Ex : « Travaux toiture », « Usage perso » ' :
            'Court descriptif (ex: « Chaudière HS », « Mars 2025 »)'
          }
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="ex : Airbnb — Famille Dupont" />
        </Field>

        <Field label="Notes (optionnel)">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Contexte, suivi…" rows={2} />
        </Field>

        {showResolution && (
          <div className="card p-3 space-y-3 bg-surface-2/50">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isResolved}
                onChange={(e) => setIsResolved(e.target.checked)} />
              <span className="text-primary">Événement résolu</span>
            </label>
            {isResolved && (
              <>
                <Field label="Date de résolution">
                  <Input type="date" value={resolvedDate}
                    onChange={(e) => setResolvedDate(e.target.value)} />
                </Field>
                <Field label="Note de résolution">
                  <Input value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="ex : GLI déclenchée, remboursement reçu" />
                </Field>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" loading={saving} icon={Save}>
            {existing ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
