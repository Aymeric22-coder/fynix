'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, AlertTriangle, CheckCircle2, Banknote, Receipt, CreditCard,
  TrendingUp, Pencil, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format'
import {
  computeTracking,
  type BaseAnnualData,
  type TrackingPeriod,
} from '@/lib/real-estate/tracking'
import type { PropertyEvent } from '@/types/database.types'
import { PROPERTY_EVENT_LABELS } from '@/types/database.types'
import { AddEventModal } from './add-event-modal'

interface LotOption { id: string; name: string; rent_amount: number | null }

interface Props {
  propertyId:  string
  year:        number
  lots:        LotOption[]
  /** Loyer mensuel total (somme des lots loués) — pour la base. */
  monthlyRent: number
  /** Charges annuelles totales — pour la base. */
  annualCharges: number
  /** Mensualité totale crédit (capital + intérêts + assurance). */
  monthlyLoanPayment: number
  /** Événements de l'année, chargés côté serveur. */
  events:      PropertyEvent[]
}

const SEV_TONES = {
  critical: 'border-danger/40 bg-danger/5 text-danger',
  warning:  'border-warning/40 bg-warning/5 text-warning',
  info:     'border-accent/40 bg-accent/5 text-accent',
}

export function RealTrackingPanel({
  propertyId, year, lots, monthlyRent, annualCharges, monthlyLoanPayment, events,
}: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PropertyEvent | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const base: BaseAnnualData = useMemo(() => {
    const rentY    = monthlyRent * 12
    const loanY    = monthlyLoanPayment * 12
    return {
      expectedAnnualRent:        rentY,
      expectedAnnualCharges:     annualCharges,
      expectedAnnualLoanPayment: loanY,
      expectedAnnualCashFlow:    rentY - annualCharges - loanY,
    }
  }, [monthlyRent, annualCharges, monthlyLoanPayment])

  const period: TrackingPeriod = useMemo(() => {
    const now = new Date()
    const isCurrent = now.getUTCFullYear() === year
    return {
      startDate: new Date(`${year}-01-01T00:00:00Z`),
      endDate:   isCurrent
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        : new Date(`${year}-12-31T00:00:00Z`),
    }
  }, [year])

  const tracking = useMemo(
    () => computeTracking(base, events, lots, period),
    [base, events, lots, period],
  )

  async function deleteEvent(id: string) {
    if (!confirm('Supprimer cet événement ?')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/real-estate/${propertyId}/events/${id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleResolved(e: PropertyEvent) {
    setBusyId(e.id)
    try {
      await fetch(`/api/real-estate/${propertyId}/events/${e.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_resolved: !e.is_resolved,
          resolved_date: !e.is_resolved ? new Date().toISOString().split('T')[0]! : null,
        }),
      })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">

      {/* ─── KPIs ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Banknote}
          label="Loyers réels à date"
          value={formatCurrency(tracking.realizedRent, 'EUR')}
          sub={`Attendu : ${formatCurrency(tracking.expectedRentToDate, 'EUR')}`}
          delta={tracking.realizedRent - tracking.expectedRentToDate}
        />
        <Kpi
          icon={Receipt}
          label="Charges à date"
          value={'−' + formatCurrency(tracking.expectedChargesToDate + tracking.exceptionalCharges, 'EUR')}
          sub={tracking.exceptionalCharges > 0
            ? `dont ${formatCurrency(tracking.exceptionalCharges, 'EUR')} excep.`
            : 'conforme prévision'}
          delta={-tracking.exceptionalCharges}
        />
        <Kpi
          icon={CreditCard}
          label="Mensualités à date"
          value={'−' + formatCurrency(tracking.loanPaymentToDate, 'EUR')}
          sub="calculé auto"
        />
        <Kpi
          icon={TrendingUp}
          label="Cash-flow réel à date"
          value={formatCurrency(tracking.realCashFlowToDate, 'EUR')}
          sub={`Attendu : ${formatCurrency(tracking.expectedCashFlowToDate, 'EUR')}`}
          delta={tracking.cashFlowDeltaVsExpected}
          accent
        />
      </div>

      {/* ─── Alertes ─────────────────────────────────────────────── */}
      {tracking.alerts.length > 0 && (
        <div className="space-y-2">
          {tracking.alerts.map((a, i) => (
            <div key={i} className={`card p-3 flex items-start gap-3 ${SEV_TONES[a.severity]}`}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p className="text-sm">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── Projection fin d'année ─────────────────────────────── */}
      <div className="card p-4">
        <p className="text-xs text-secondary uppercase tracking-widest">Projection fin {year}</p>
        <div className="flex items-baseline justify-between mt-2 flex-wrap gap-2">
          <p className={`text-xl font-semibold financial-value ${tracking.projectedAnnualCashFlow >= 0 ? 'text-accent' : 'text-danger'}`}>
            {formatCurrency(tracking.projectedAnnualCashFlow, 'EUR')}
          </p>
          <p className="text-xs text-secondary">
            Théorique annuel : {formatCurrency(base.expectedAnnualCashFlow, 'EUR')}
            {' · '}
            Écart : <span className={tracking.projectedAnnualCashFlowPct >= 0 ? 'text-accent' : 'text-danger'}>
              {formatPercent(tracking.projectedAnnualCashFlowPct, { sign: true })}
            </span>
          </p>
        </div>
      </div>

      {/* ─── Journal d'événements ───────────────────────────────── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-primary">Journal des événements {year}</h3>
          <Button variant="secondary" size="sm" icon={Plus}
            onClick={() => { setEditing(null); setModalOpen(true) }}>
            Ajouter un événement
          </Button>
        </div>

        {tracking.events.length === 0 ? (
          <p className="text-sm text-secondary text-center py-6">
            Aucun événement enregistré pour {year}.
            <br />
            <span className="text-xs text-muted">
              Les calculs ci-dessus utilisent uniquement les données de base (loyers + charges + crédit).
            </span>
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tracking.events.map((ev) => {
              const rawEvent = events.find(e => e.id === ev.eventId)!
              return (
                <li key={ev.eventId} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-primary font-medium">
                        {PROPERTY_EVENT_LABELS[ev.kind]}
                      </span>
                      {ev.lotName && (
                        <span className="text-xs text-secondary">· {ev.lotName}</span>
                      )}
                      {ev.isResolved
                        ? <span className="text-xs text-accent flex items-center gap-1"><CheckCircle2 size={11} />Résolu</span>
                        : ['rent_unpaid', 'insurance_claim', 'exceptional_charge', 'unplanned_works'].includes(ev.kind) &&
                          <span className="text-xs text-warning">Non résolu</span>
                      }
                    </div>
                    <p className="text-xs text-secondary mt-0.5">
                      {formatDate(ev.date, 'medium')}
                      {ev.label && ` · ${ev.label}`}
                      {ev.amount !== 0 && (
                        <span className={ev.amount < 0 ? 'text-danger ml-2' : 'text-accent ml-2'}>
                          {formatCurrency(ev.amount, 'EUR', { sign: true })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {['rent_unpaid', 'insurance_claim', 'exceptional_charge', 'unplanned_works'].includes(ev.kind) && (
                      <button type="button"
                        onClick={() => toggleResolved(rawEvent)}
                        disabled={busyId === ev.eventId}
                        className="text-xs px-2 py-1 rounded text-secondary hover:text-primary hover:bg-surface-2"
                        title={ev.isResolved ? 'Marquer non résolu' : 'Marquer résolu'}
                      >
                        {ev.isResolved ? '↺' : '✓'}
                      </button>
                    )}
                    <button type="button"
                      onClick={() => { setEditing(rawEvent); setModalOpen(true) }}
                      className="p-1.5 rounded text-muted hover:text-primary hover:bg-surface-2"
                      title="Modifier"
                    ><Pencil size={13} /></button>
                    <button type="button"
                      onClick={() => deleteEvent(ev.eventId)}
                      disabled={busyId === ev.eventId}
                      className="p-1.5 rounded text-muted hover:text-danger hover:bg-surface-2"
                      title="Supprimer"
                    ><Trash2 size={13} /></button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ─── Données de base ─────────────────────────────────────── */}
      <div className="card p-5 bg-surface-2/50">
        <p className="text-xs text-secondary uppercase tracking-widest mb-3">
          Données de base (mises à jour automatiquement)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-secondary">Loyers mensuels</p>
            <p className="text-primary font-medium mt-0.5">
              {formatCurrency(monthlyRent, 'EUR')}/mois
              <span className="text-xs text-muted ml-1">({lots.length} lot{lots.length > 1 ? 's' : ''})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary">Charges annuelles</p>
            <p className="text-primary font-medium mt-0.5">
              {formatCurrency(annualCharges, 'EUR')}/an
              <span className="text-xs text-muted ml-1">({formatCurrency(annualCharges / 12, 'EUR')}/mois)</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-secondary">Mensualité crédit</p>
            <p className="text-primary font-medium mt-0.5">
              {formatCurrency(monthlyLoanPayment, 'EUR')}/mois
              <span className="text-xs text-muted ml-1">calculée auto</span>
            </p>
          </div>
        </div>
        <p className="text-xs text-muted mt-3 pt-3 border-t border-border">
          → Pour modifier les loyers ou les charges, allez dans les onglets « Synthèse » (lots) et « Charges ».
        </p>
      </div>

      {/* ─── Modale ajout/édition ───────────────────────────────── */}
      <AddEventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        propertyId={propertyId}
        lots={lots}
        existing={editing}
      />
    </div>
  )
}

// ─── Helper KPI card ──────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, delta, accent }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  label: string
  value: string
  sub?: string
  delta?: number
  accent?: boolean
}) {
  const deltaColor = delta == null
    ? 'text-muted'
    : delta < 0 ? 'text-danger' : 'text-accent'
  return (
    <div className={`card p-4 space-y-1.5 ${accent ? 'border-accent/30' : ''}`}>
      <div className="flex items-center gap-2 text-secondary">
        <Icon size={12} />
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-xl font-semibold financial-value text-primary">{value}</p>
      {sub && <p className={`text-xs ${deltaColor}`}>{sub}</p>}
    </div>
  )
}
