/**
 * Tableau des transactions liées à une position (Sprint 3).
 *
 * Reprend exactement les colonnes du tableau read-only précédent
 * (Date / Type / Quantité / Prix unitaire / Frais / Montant / Libellé) et y
 * ajoute une colonne « Actions » avec édition (crayon) et suppression
 * (poubelle) — visibles UNIQUEMENT pour les lignes :
 *   - rattachées à CETTE position (`position_id === positionId`) ;
 *   - d'un type éditable (purchase / sale / dividend).
 *
 * Les autres lignes (rattachées seulement à l'instrument, ou d'un type non
 * géré) restent en lecture seule — cohérent avec le périmètre Sprint 3.
 *
 * L'édition ouvre `EditTransactionModal`. La suppression ouvre une modale de
 * confirmation maison (et non `ConfirmDialog`) afin de pouvoir afficher l'état
 * de chargement ET le message d'erreur serveur si l'opération est refusée
 * (ex. « rendrait la vente du 15/03 invalide »).
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatQuantity, formatDate } from '@/lib/utils/format'
import {
  EditTransactionModal,
  type EditableTransaction,
  type EditableTxType,
} from '@/components/portfolio/edit-transaction-modal'

export interface TxRow {
  id:               string
  transaction_type: string
  amount:           number | null
  quantity:         number | null
  unit_price:       number | null
  fees:             number | null
  executed_at:      string
  label:            string | null
  notes:            string | null
  position_id:      string | null
  currency:         string | null
}

interface Props {
  rows:             TxRow[]
  positionId:       string
  positionCurrency: string
  ticker:           string
  name:             string
}

const EDITABLE = new Set<string>(['purchase', 'sale', 'dividend'])

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Achat',
  sale:     'Vente',
  dividend: 'Dividende',
}

function isEditable(r: TxRow, positionId: string): boolean {
  return r.position_id === positionId && EDITABLE.has(r.transaction_type)
}

export function TransactionsList({
  rows, positionId, positionCurrency, ticker, name,
}: Props) {
  const router = useRouter()
  const [editing, setEditing]   = useState<EditableTransaction | null>(null)
  const [deleting, setDeleting] = useState<TxRow | null>(null)
  const [delLoading, setDelLoading] = useState(false)
  const [delError, setDelError]     = useState<string | null>(null)

  function openEdit(r: TxRow) {
    setEditing({
      id:               r.id,
      transaction_type: r.transaction_type as EditableTxType,
      quantity:         r.quantity,
      unit_price:       r.unit_price,
      fees:             r.fees,
      amount:           r.amount,
      executed_at:      r.executed_at,
      currency:         r.currency,
    })
  }

  function openDelete(r: TxRow) {
    setDelError(null)
    setDeleting(r)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDelLoading(true)
    setDelError(null)
    try {
      const res = await fetch(`/api/transactions/${deleting.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error) {
        setDelError(json.error ?? `Erreur ${res.status}`)
        setDelLoading(false)
        return
      }
      setDelLoading(false)
      setDeleting(null)
      router.refresh()
    } catch (err) {
      setDelError((err as Error).message)
      setDelLoading(false)
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 border-b border-border">
            <tr className="text-xs text-secondary uppercase tracking-wider">
              <th className="text-left  px-4 py-3 font-medium">Date</th>
              <th className="text-left  px-4 py-3 font-medium">Type</th>
              <th className="text-right px-4 py-3 font-medium">Quantité</th>
              <th className="text-right px-4 py-3 font-medium">Prix unitaire</th>
              <th className="text-right px-4 py-3 font-medium">Frais</th>
              <th className="text-right px-4 py-3 font-medium">Montant</th>
              <th className="text-left  px-4 py-3 font-medium">Libellé</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const editable = isEditable(t, positionId)
              return (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-secondary">{formatDate(t.executed_at, 'short')}</td>
                  <td className="px-4 py-3">
                    <Badge variant="muted">{TYPE_LABEL[t.transaction_type] ?? t.transaction_type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right financial-value text-secondary">
                    {t.quantity !== null && t.quantity !== undefined
                      ? formatQuantity(Number(t.quantity), 8)
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right financial-value text-secondary">
                    {t.unit_price !== null && t.unit_price !== undefined
                      ? formatCurrency(Number(t.unit_price), positionCurrency, { decimals: 2 })
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right financial-value text-muted text-xs">
                    {t.fees && Number(t.fees) > 0
                      ? formatCurrency(Number(t.fees), positionCurrency, { decimals: 2 })
                      : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right financial-value font-medium ${Number(t.amount) >= 0 ? 'text-accent' : 'text-danger'}`}>
                    {t.amount !== null && t.amount !== undefined
                      ? formatCurrency(Number(t.amount), positionCurrency, { decimals: 2, sign: true })
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-secondary truncate max-w-xs">
                    {t.label ?? <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {editable ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          aria-label="Modifier la transaction"
                          title="Modifier"
                          className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(t)}
                          aria-label="Supprimer la transaction"
                          title="Supprimer"
                          className="p-1.5 rounded-md text-secondary hover:text-danger hover:bg-danger-muted transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-muted text-xs">—</div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modale d'édition ─────────────────────────────────────────── */}
      <EditTransactionModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSuccess={() => router.refresh()}
        tx={editing}
        positionCurrency={positionCurrency}
        ticker={ticker}
        name={name}
      />

      {/* ── Modale de confirmation de suppression ────────────────────── */}
      <Modal
        open={deleting !== null}
        onClose={() => { if (!delLoading) setDeleting(null) }}
        title="Supprimer la transaction"
        subtitle={`${ticker ? `${ticker} · ` : ''}${name}`}
        size="sm"
      >
        {deleting && (
          <div className="space-y-5">
            <p className="text-sm text-secondary leading-relaxed">
              Cette suppression recalcule le PRU et la quantité de la position.
              Si elle rendait une vente ultérieure invalide, l&apos;opération sera
              refusée.
            </p>

            <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary text-xs uppercase tracking-wider">Type</span>
                <Badge variant="muted">
                  {TYPE_LABEL[deleting.transaction_type] ?? deleting.transaction_type}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary text-xs uppercase tracking-wider">Date</span>
                <span className="text-primary financial-value">{formatDate(deleting.executed_at, 'short')}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-secondary text-xs uppercase tracking-wider">Montant</span>
                <span className={`financial-value font-medium ${Number(deleting.amount) >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {deleting.amount !== null && deleting.amount !== undefined
                    ? formatCurrency(Number(deleting.amount), positionCurrency, { decimals: 2, sign: true })
                    : '—'}
                </span>
              </div>
            </div>

            {delError && (
              <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
                {delError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDeleting(null)}
                disabled={delLoading}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={confirmDelete}
                loading={delLoading}
              >
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
