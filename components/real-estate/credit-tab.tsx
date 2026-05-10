'use client'

/**
 * Onglet "Crédit" de la fiche détail bien.
 *
 * - Si pas de crédit : CTA "Ce bien est-il financé par un emprunt ?" + bouton
 *   pour ouvrir le form (CreditForm avec existing=null)
 * - Sinon : récap mensualité / TAEG / coût total / CRD à date / fin du prêt,
 *   graphique capital vs intérêts par année, tableau amortissement virtualisé
 *   (sous-composant), bouton Modifier pour rouvrir le form
 */

import { useState, useMemo } from 'react'
import { Banknote, Plus, Edit3, AlertTriangle } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { CreditForm, type ExistingCredit } from './credit-form'
import { buildAmortizationSchedule, computeRemainingCapitalAt } from '@/lib/real-estate/amortization'
import type { LoanInput } from '@/lib/real-estate/types'
import { formatCurrency, formatPercent } from '@/lib/utils/format'

interface Props {
  propertyId:    string
  propertyName?: string
  /** Crédit existant lu en DB (null si aucun) */
  credit:        ExistingCredit | null
}

// ─── Sous-composants ──────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: {
  label:  string
  value:  string
  sub?:   string
  accent?: 'primary' | 'success' | 'danger' | 'warning'
}) {
  const valColor =
    accent === 'success' ? 'text-accent'   :
    accent === 'danger'  ? 'text-danger'   :
    accent === 'warning' ? 'text-warning'  :
                           'text-primary'
  return (
    <div className="card p-4">
      <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold financial-value mt-2 ${valColor}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────

export function CreditTab({ propertyId, propertyName, credit }: Props) {
  const [formOpen, setFormOpen] = useState(false)

  // Construit LoanInput pour la lib pure (à partir du credit DB)
  const loan: LoanInput | null = useMemo(() => {
    if (!credit || credit.initial_amount == null || credit.interest_rate == null || credit.duration_months == null) {
      return null
    }
    return {
      principal:           credit.initial_amount,
      annualRatePct:       credit.interest_rate,
      durationYears:       credit.duration_months / 12,
      insuranceRatePct:    credit.insurance_rate ?? 0,
      bankFees:            credit.bank_fees,
      guaranteeFees:       credit.guarantee_fees,
      startDate:           credit.start_date ? new Date(credit.start_date) : undefined,
      deferralType:        credit.deferral_type,
      deferralMonths:      credit.deferral_months,
      insuranceBase:       credit.insurance_base,
      insuranceQuotitePct: credit.insurance_quotite,
    }
  }, [credit])

  const schedule = useMemo(() => loan ? buildAmortizationSchedule(loan) : null, [loan])
  const crdNow   = useMemo(() => loan ? computeRemainingCapitalAt(loan, new Date()) : null, [loan])

  // Données du graphique (capital vs intérêts par année)
  const chartData = useMemo(() => {
    if (!schedule) return []
    return schedule.years.map((y) => ({
      year:     `An ${y.year}`,
      capital:  Math.round(y.principal),
      interets: Math.round(y.interest),
      assurance: Math.round(y.insurance),
    }))
  }, [schedule])

  // Date de fin du prêt
  const endDate = useMemo(() => {
    if (!credit?.start_date || !credit.duration_months) return null
    const d = new Date(credit.start_date)
    d.setMonth(d.getMonth() + credit.duration_months)
    return d
  }, [credit])

  // ── État 1 : pas de crédit ────────────────────────────────────────────
  if (!credit) {
    return (
      <>
        <div className="card p-12 text-center space-y-4">
          <Banknote size={36} className="text-muted mx-auto" />
          <div className="space-y-1">
            <p className="text-sm text-primary font-medium">Aucun crédit associé à ce bien</p>
            <p className="text-xs text-secondary max-w-md mx-auto">
              Si ce bien est financé par un emprunt, ajoutez-le ici. Le tableau d&apos;amortissement,
              la mensualité, le capital restant dû et le cash-flow seront calculés automatiquement.
            </p>
          </div>
          <Button icon={Plus} onClick={() => setFormOpen(true)}>
            Ajouter un crédit
          </Button>
        </div>
        <CreditForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          propertyId={propertyId}
          propertyName={propertyName}
        />
      </>
    )
  }

  // ── État 2 : crédit incomplet (champs manquants) ──────────────────────
  if (!loan || !schedule) {
    return (
      <>
        <div className="card p-6 space-y-4 border border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <p className="text-sm text-warning font-medium">Crédit incomplet</p>
              <p className="text-xs text-secondary">
                Certains champs critiques ne sont pas renseignés (taux, durée ou montant).
                Complétez le formulaire pour obtenir l&apos;amortissement et les KPIs.
              </p>
            </div>
            <Button variant="secondary" icon={Edit3} onClick={() => setFormOpen(true)}>
              Compléter
            </Button>
          </div>
        </div>
        <CreditForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          propertyId={propertyId}
          propertyName={propertyName}
          existing={credit}
        />
      </>
    )
  }

  // ── État 3 : crédit complet ──────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* En-tête + bouton modifier */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-primary">{credit.name}</h2>
          {credit.lender && <p className="text-xs text-secondary mt-0.5">{credit.lender}</p>}
        </div>
        <Button variant="secondary" icon={Edit3} onClick={() => setFormOpen(true)}>
          Modifier
        </Button>
      </div>

      {/* KPIs principaux */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Mensualité totale"
          value={formatCurrency(schedule.totalMonthly, 'EUR')}
          sub="capital + intérêts + ass."
        />
        <KpiCard
          label="Capital restant dû"
          value={crdNow !== null ? formatCurrency(crdNow, 'EUR', { compact: true }) : '—'}
          sub="à aujourd'hui"
          accent="danger"
        />
        <KpiCard
          label="Coût total crédit"
          value={formatCurrency(schedule.totalCost, 'EUR', { compact: true })}
          sub="intérêts + ass. + frais"
        />
        <KpiCard
          label="TAEG approx."
          value={formatPercent(schedule.aprPct)}
          sub={`Nominal ${formatPercent(credit.interest_rate ?? 0)}`}
          accent="success"
        />
        <KpiCard
          label="Frais"
          value={formatCurrency(schedule.totalFees, 'EUR')}
          sub="dossier + garantie"
        />
        <KpiCard
          label="Fin du prêt"
          value={endDate ? endDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—'}
          sub={`${credit.duration_months} mois`}
        />
      </div>

      {/* Graphique : répartition capital / intérêts / assurance par année */}
      <div className="card p-5">
        <p className="text-xs text-secondary uppercase tracking-widest mb-4">
          Répartition annuelle des paiements
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => formatCurrency(v, 'EUR', { compact: true })}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="capital"   name="Capital"   stackId="a" fill="#10b981" />
            <Bar dataKey="interets"  name="Intérêts"  stackId="a" fill="#ef4444" />
            <Bar dataKey="assurance" name="Assurance" stackId="a" fill="#6b7280" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Form modal */}
      <CreditForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        propertyId={propertyId}
        propertyName={propertyName}
        existing={credit}
      />
    </div>
  )
}
