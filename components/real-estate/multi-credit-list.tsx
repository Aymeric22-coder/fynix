'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import { LOAN_KIND_LABELS, type LoanKind } from '@/types/database.types'

export interface MultiCreditRow {
  id:               string
  loan_kind:        LoanKind
  lender:           string | null
  initial_amount:   number
  interest_rate:    number | null
  insurance_rate:   number | null
  duration_months:  number | null
  start_date:       string | null
  /**
   * V3.2 — mensualité totale (capital + intérêts + assurance moyenne),
   * pré-calculée côté serveur via `buildAmortizationSchedule(loan).totalMonthly`.
   * Garantie : `sum(rows.monthly) === aggregateLoans(loans).totalMonthly`.
   * 0 si crédit incomplet (champs critiques manquants).
   */
  monthly:          number
  /**
   * V3.2 — capital restant dû à date, pré-calculé via
   * `computeRemainingCapitalAt(loan, today)` côté serveur.
   * Fallback sur `initial_amount` si crédit incomplet.
   */
  crd:              number
}

interface Props {
  /** ID du bien — utilisé pour DELETE /api/real-estate/{id}/credit?loan_kind=... */
  propertyId:            string
  credits:               MultiCreditRow[]
  /** Mensualité totale agrégée (calculée côté serveur via aggregateLoans). */
  totalMonthly:          number
  /** CRD agrégé. */
  totalRemainingCapital: number
}

/**
 * Liste les crédits actifs d'un bien.
 * V3.2 — chaque ligne a un bouton corbeille pour supprimer ce crédit
 * uniquement (le PUT/DELETE de l'API est filtré par loan_kind).
 * L'édition d'un crédit se fait via le formulaire dédié de l'onglet « Crédit ».
 */
export function MultiCreditList({
  propertyId, credits, totalMonthly, totalRemainingCapital,
}: Props) {
  if (credits.length === 0) {
    return (
      <div className="card p-6 text-sm text-secondary">
        Aucun crédit actif sur ce bien.
      </div>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-2">
        <h3 className="text-sm font-medium text-primary">
          Crédits actifs ({credits.length})
        </h3>
      </div>

      <ul className="divide-y divide-border">
        {credits.map((c) => (
          <li key={c.id} className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary">
                {LOAN_KIND_LABELS[c.loan_kind] ?? c.loan_kind}
                {c.lender && <span className="text-secondary"> · {c.lender}</span>}
              </p>
              <p className="text-xs text-secondary mt-0.5">
                {formatCurrency(c.initial_amount, 'EUR', { compact: true })}
                {c.interest_rate != null && (
                  <> · {formatPercent(c.interest_rate)}</>
                )}
                {c.duration_months && (
                  <> · {Math.round(c.duration_months / 12)} ans</>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm financial-value text-primary">
                {formatCurrency(c.monthly, 'EUR')}<span className="text-xs text-secondary"> /mois</span>
              </p>
              <p className="text-xs text-secondary">
                CRD : {formatCurrency(c.crd, 'EUR', { compact: true })}
              </p>
            </div>
            <DeleteCreditButton
              propertyId={propertyId}
              loanKind={c.loan_kind}
              label={LOAN_KIND_LABELS[c.loan_kind] ?? c.loan_kind}
              lender={c.lender}
            />
          </li>
        ))}
      </ul>

      {credits.length > 1 && (
        <div className="px-5 py-3 border-t border-border bg-surface-2 flex items-center justify-between">
          <div>
            <p className="text-xs text-secondary uppercase tracking-widest">Total mensualités</p>
            <p className="text-sm font-semibold financial-value text-primary mt-0.5">
              {formatCurrency(totalMonthly, 'EUR')}<span className="text-xs text-secondary"> /mois</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-secondary uppercase tracking-widest">CRD total</p>
            <p className="text-sm font-semibold financial-value text-danger mt-0.5">
              {formatCurrency(totalRemainingCapital, 'EUR', { compact: true })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Bouton corbeille par ligne + modale de confirmation.
// Pattern repris de DeletePropertyButton : pas d'auto-focus sur le bouton
// destructif, erreur affichée in-modal, modale reste ouverte en cas d'échec.
// ─────────────────────────────────────────────────────────────────────

interface DeleteBtnProps {
  propertyId: string
  loanKind:   LoanKind
  label:      string         // ex. "PTZ (Prêt à Taux Zéro)"
  lender:     string | null
}

function DeleteCreditButton({ propertyId, loanKind, label, lender }: DeleteBtnProps) {
  const router = useRouter()
  const [open,  setOpen]  = useState(false)
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/real-estate/${propertyId}/credit?loan_kind=${encodeURIComponent(loanKind)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? `HTTP ${res.status}`)
        return
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 rounded hover:bg-surface-2 text-muted hover:text-danger transition-colors flex-shrink-0"
        title={`Supprimer ${label}`}
        aria-label={`Supprimer ${label}`}
      >
        <Trash2 size={14} />
      </button>

      <Modal
        open={open}
        onClose={() => { if (!busy) { setOpen(false); setError(null) } }}
        title="Supprimer ce crédit ?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-primary">
                Cette action est <span className="font-medium text-danger">irréversible</span>.
              </p>
              <p className="text-secondary mt-1">
                Le crédit <span className="text-primary font-medium">«&nbsp;{label}{lender ? ` · ${lender}` : ''}&nbsp;»</span> sera
                définitivement supprimé. Les autres crédits actifs du bien
                ne sont pas touchés.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            {/* Focus initial sur Annuler — pas sur le bouton destructif */}
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setOpen(false); setError(null) }}
              autoFocus
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              onClick={handleConfirm}
            >
              Supprimer définitivement
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
