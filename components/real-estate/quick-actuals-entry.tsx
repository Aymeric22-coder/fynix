'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, CreditCard, Receipt, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, FormGrid } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExistingCharges {
  year:           number
  taxe_fonciere:  number
  insurance:      number
  accountant:     number
  cfe:            number
  condo_fees:     number
  maintenance:    number
  other:          number
}

interface Props {
  open:                    boolean
  onClose:                 () => void
  assetId:                 string
  debtId:                  string | null
  propertyId:              string
  monthlyRentSuggested:    number          // somme des loyers des lots loués
  monthlyPaymentSuggested: number | null   // mensualité du crédit (si calculable)
  existingCharges:         ExistingCharges[]   // toutes les années déjà saisies
}

type Tab = 'rent' | 'loan' | 'charges'

// ─── Helpers ───────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().split('T')[0]!
}

function endOfMonth(year: number, month: number): string {
  // month 1-12
  const d = new Date(Date.UTC(year, month, 0))
  return ymd(d)
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

// ─── Composant ─────────────────────────────────────────────────────────────

export function QuickActualsEntry({
  open, onClose, assetId, debtId, propertyId,
  monthlyRentSuggested, monthlyPaymentSuggested, existingCharges,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('rent')
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // ── État loyers ──
  const now = new Date()
  const [rentMonth, setRentMonth] = useState(now.getMonth() + 1)
  const [rentYear,  setRentYear]  = useState(now.getFullYear())
  const [rentAmount, setRentAmount] = useState(monthlyRentSuggested || 0)

  // ── État mensualité crédit ──
  const [loanMonth, setLoanMonth] = useState(now.getMonth() + 1)
  const [loanYear,  setLoanYear]  = useState(now.getFullYear())
  const [loanAmount, setLoanAmount] = useState(monthlyPaymentSuggested ?? 0)

  // ── État charges annuelles ──
  const lastYear = (existingCharges[0]?.year ?? now.getFullYear() - 1) + 1
  const [chargesYear, setChargesYear] = useState<number>(now.getFullYear())
  const existing = existingCharges.find((c) => c.year === chargesYear)
  const [taxeFonciere, setTaxeFonciere] = useState(existing?.taxe_fonciere ?? 0)
  const [insurance,    setInsurance]    = useState(existing?.insurance     ?? 0)
  const [accountant,   setAccountant]   = useState(existing?.accountant    ?? 0)
  const [cfe,          setCfe]          = useState(existing?.cfe           ?? 0)
  const [condoFees,    setCondoFees]    = useState(existing?.condo_fees    ?? 0)
  const [maintenance,  setMaintenance]  = useState(existing?.maintenance   ?? 0)
  const [other,        setOther]        = useState(existing?.other         ?? 0)

  // Quand l'année change, recharger les valeurs existantes
  function handleYearChange(year: number) {
    setChargesYear(year)
    const e = existingCharges.find((c) => c.year === year)
    setTaxeFonciere(e?.taxe_fonciere ?? 0)
    setInsurance(e?.insurance       ?? 0)
    setAccountant(e?.accountant     ?? 0)
    setCfe(e?.cfe                   ?? 0)
    setCondoFees(e?.condo_fees      ?? 0)
    setMaintenance(e?.maintenance   ?? 0)
    setOther(e?.other               ?? 0)
  }

  // ── Submit handlers ──

  async function submitRent() {
    if (!rentAmount || rentAmount <= 0) return setError('Montant de loyer invalide')
    setLoading(true); setError(null); setSuccess(null)
    try {
      const executedAt = endOfMonth(rentYear, rentMonth)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_type: 'rent_income',
          asset_id:         assetId,
          amount:           rentAmount,
          executed_at:      new Date(executedAt + 'T12:00:00Z').toISOString(),
          value_date:       executedAt,
          label:            `Loyer ${MONTHS[rentMonth - 1]?.toLowerCase()} ${rentYear}`,
          currency:         'EUR',
          data_source:      'manual',
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSuccess(`Loyer ${MONTHS[rentMonth - 1]} ${rentYear} enregistré (${formatCurrency(rentAmount, 'EUR')})`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function submitLoan() {
    if (!debtId) return setError('Aucun crédit associé à ce bien')
    if (!loanAmount || loanAmount <= 0) return setError('Montant invalide')
    setLoading(true); setError(null); setSuccess(null)
    try {
      const executedAt = endOfMonth(loanYear, loanMonth)
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_type: 'loan_payment',
          debt_id:          debtId,
          amount:           -Math.abs(loanAmount),    // sortie de cash
          executed_at:      new Date(executedAt + 'T12:00:00Z').toISOString(),
          value_date:       executedAt,
          label:            `Mensualité ${MONTHS[loanMonth - 1]?.toLowerCase()} ${loanYear}`,
          currency:         'EUR',
          data_source:      'manual',
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setSuccess(`Mensualité ${MONTHS[loanMonth - 1]} ${loanYear} enregistrée (${formatCurrency(loanAmount, 'EUR')})`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function submitCharges() {
    setLoading(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/real-estate/${propertyId}/charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year:           chargesYear,
          taxe_fonciere:  taxeFonciere,
          insurance,
          accountant,
          cfe,
          condo_fees:     condoFees,
          maintenance,
          other,
        }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const total = taxeFonciere + insurance + accountant + cfe + condoFees + maintenance + other
      setSuccess(`Charges ${chargesYear} enregistrées (${formatCurrency(total, 'EUR')})`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string; icon: typeof Banknote; disabled?: boolean }[] = [
    { id: 'rent',    label: 'Loyer perçu',     icon: Banknote },
    { id: 'loan',    label: 'Mensualité',      icon: CreditCard, disabled: !debtId },
    { id: 'charges', label: 'Charges annuelles', icon: Receipt },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Saisir une donnée réelle" subtitle="Suivi de la performance vs simulation" size="md">
      {/* Onglets */}
      <div className="flex gap-1 border-b border-border mb-5 -mt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => { setTab(t.id); setSuccess(null); setError(null) }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
              tab === t.id
                ? 'border-accent text-primary font-medium'
                : 'border-transparent text-secondary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Onglet Loyer */}
      {tab === 'rent' && (
        <div className="space-y-4">
          <p className="text-xs text-secondary">
            Enregistre un loyer reçu pour un mois donné. Le montant est pré-rempli avec la somme des loyers des lots loués.
          </p>
          <FormGrid>
            <Field label="Mois">
              <select
                value={rentMonth}
                onChange={(e) => setRentMonth(Number(e.target.value))}
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm cursor-pointer"
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Année">
              <Input
                type="number" min={2000} max={2100}
                value={rentYear}
                onChange={(e) => setRentYear(Number(e.target.value))}
              />
            </Field>
          </FormGrid>
          <Field label="Montant perçu (€)" hint={`Suggéré : ${formatCurrency(monthlyRentSuggested, 'EUR')} (somme des lots loués)`}>
            <Input
              type="number" step="0.01" min={0}
              value={rentAmount}
              onChange={(e) => setRentAmount(Number(e.target.value))}
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={onClose}>Fermer</Button>
            <Button type="button" loading={loading} onClick={submitRent}>Encaisser</Button>
          </div>
        </div>
      )}

      {/* Onglet Mensualité */}
      {tab === 'loan' && (
        <div className="space-y-4">
          {!debtId ? (
            <p className="text-sm text-secondary">Aucun crédit n&apos;est associé à ce bien.</p>
          ) : (
            <>
              <p className="text-xs text-secondary">
                Enregistre une mensualité versée. Le montant est pré-rempli avec la mensualité théorique.
              </p>
              <FormGrid>
                <Field label="Mois">
                  <select
                    value={loanMonth}
                    onChange={(e) => setLoanMonth(Number(e.target.value))}
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm cursor-pointer"
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Année">
                  <Input
                    type="number" min={2000} max={2100}
                    value={loanYear}
                    onChange={(e) => setLoanYear(Number(e.target.value))}
                  />
                </Field>
              </FormGrid>
              <Field label="Montant payé (€)" hint={monthlyPaymentSuggested ? `Théorique : ${formatCurrency(monthlyPaymentSuggested, 'EUR')}` : undefined}>
                <Input
                  type="number" step="0.01" min={0}
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                />
              </Field>
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <Button variant="secondary" type="button" onClick={onClose}>Fermer</Button>
                <Button type="button" loading={loading} onClick={submitLoan}>Enregistrer</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Onglet Charges */}
      {tab === 'charges' && (
        <div className="space-y-4">
          <p className="text-xs text-secondary">
            Renseigne les charges annuelles effectivement payées. Les valeurs existantes sont pré-remplies.
          </p>
          <Field label="Année">
            <Input
              type="number" min={2000} max={2100}
              value={chargesYear}
              onChange={(e) => handleYearChange(Number(e.target.value))}
            />
          </Field>
          <FormGrid>
            <Field label="Taxe foncière (€)">
              <Input type="number" step="1" min={0} value={taxeFonciere} onChange={(e) => setTaxeFonciere(Number(e.target.value))} />
            </Field>
            <Field label="Assurance PNO (€)">
              <Input type="number" step="1" min={0} value={insurance} onChange={(e) => setInsurance(Number(e.target.value))} />
            </Field>
            <Field label="Expert-comptable (€)">
              <Input type="number" step="1" min={0} value={accountant} onChange={(e) => setAccountant(Number(e.target.value))} />
            </Field>
            <Field label="CFE (€)">
              <Input type="number" step="1" min={0} value={cfe} onChange={(e) => setCfe(Number(e.target.value))} />
            </Field>
            <Field label="Charges copro (€)">
              <Input type="number" step="1" min={0} value={condoFees} onChange={(e) => setCondoFees(Number(e.target.value))} />
            </Field>
            <Field label="Entretien (€)">
              <Input type="number" step="1" min={0} value={maintenance} onChange={(e) => setMaintenance(Number(e.target.value))} />
            </Field>
            <Field label="Autres (€)">
              <Input type="number" step="1" min={0} value={other} onChange={(e) => setOther(Number(e.target.value))} />
            </Field>
          </FormGrid>
          <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
            <span className="text-secondary">Total {chargesYear} : </span>
            <span className="text-primary font-medium financial-value">
              {formatCurrency(taxeFonciere + insurance + accountant + cfe + condoFees + maintenance + other, 'EUR')}
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={onClose}>Fermer</Button>
            <Button type="button" loading={loading} onClick={submitCharges}>
              {existing ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}

      {/* Feedback */}
      {success && (
        <div className="mt-4 flex items-start gap-2 bg-accent/10 border border-accent/20 text-accent rounded-lg px-3 py-2 text-sm">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          {success}
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </Modal>
  )
}
