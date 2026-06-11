/**
 * Modale d'ÉDITION d'une transaction historique (Sprint 3).
 *
 * Distincte de `add-transaction-modal` : ici on modifie une ligne existante du
 * journal via `PUT /api/transactions/{id}`, qui recalcule la cohérence CUMP/PRU
 * de la position (et refuse l'opération si elle casse un invariant — le message
 * serveur est alors affiché tel quel).
 *
 * Le TYPE de transaction n'est PAS modifiable (un achat reste un achat) : pour
 * changer de type, l'utilisateur supprime puis recrée. Le type est affiché en
 * lecture seule dans le titre.
 */

'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { InfoTip } from '@/components/ui/info-tip'

export type EditableTxType = 'purchase' | 'sale' | 'dividend'

export interface EditableTransaction {
  id:               string
  transaction_type: EditableTxType
  quantity:         number | null
  unit_price:       number | null
  fees:             number | null
  amount:           number | null
  executed_at:      string
  currency:         string | null
}

interface Props {
  open:             boolean
  onClose:          () => void
  /** Refresh parent après succès (typiquement router.refresh). */
  onSuccess:        () => void
  /** Transaction à éditer ; `null` ⇒ modale fermée. */
  tx:               EditableTransaction | null
  positionCurrency: string
  ticker:           string
  name:             string
}

const TYPE_LABEL: Record<EditableTxType, string> = {
  purchase: 'Achat',
  sale:     'Vente',
  dividend: 'Dividende',
}

const TODAY = () => new Date().toISOString().slice(0, 10)

export function EditTransactionModal({
  open, onClose, onSuccess, tx, positionCurrency, ticker, name,
}: Props) {
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [fees, setFees]         = useState('')
  const [amount, setAmount]     = useState('')
  const [currency, setCurrency] = useState(positionCurrency)
  const [date, setDate]         = useState(TODAY())
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)

  // Pré-remplissage à chaque ouverture.
  useEffect(() => {
    if (!open || !tx) return
    setQuantity(tx.quantity != null ? String(tx.quantity) : '')
    setUnitPrice(tx.unit_price != null ? String(tx.unit_price) : '')
    setFees(tx.fees != null ? String(tx.fees) : '')
    setAmount(tx.amount != null ? String(Math.abs(tx.amount)) : '')
    setCurrency(tx.currency ?? positionCurrency)
    setDate(tx.executed_at.slice(0, 10))
    setError(null)
    setSuccess(false)
  }, [open, tx, positionCurrency])

  if (!tx) return null
  const type = tx.transaction_type

  function validate(): string | null {
    if (!date) return 'Date requise'
    if (date > TODAY()) return 'La date ne peut pas être future'
    if (type === 'dividend') {
      const a = Number(amount)
      if (!Number.isFinite(a) || a <= 0) return 'Montant invalide (> 0)'
      return null
    }
    const q = Number(quantity)
    const p = Number(unitPrice)
    if (!Number.isFinite(q) || q <= 0) return 'Quantité invalide (> 0)'
    if (!Number.isFinite(p) || p <= 0) return 'Prix unitaire invalide (> 0)'
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const msg = validate()
    if (msg) { setError(msg); return }
    if (!tx) return

    setLoading(true)
    try {
      const body =
        type === 'dividend'
          ? { amount: Number(amount), currency, date }
          : {
              quantity:   Number(quantity),
              unit_price: Number(unitPrice),
              fees:       type === 'purchase' ? (Number(fees) || 0) : 0,
              date,
            }

      const res = await fetch(`/api/transactions/${tx.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? `Erreur ${res.status}`)
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        setLoading(false)
        onSuccess()
        onClose()
      }, 1200)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Modifier · ${TYPE_LABEL[type]}`}
      subtitle={`${ticker ? `${ticker} · ` : ''}${name}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-surface-2 rounded-lg px-4 py-3 text-xs text-secondary leading-relaxed">
          La modification recalcule automatiquement le PRU et la quantité de la
          position. Si elle rendait une vente ultérieure invalide, l&apos;opération
          sera refusée avec un message explicite.
        </div>

        {type !== 'dividend' && (
          <>
            <FormGrid>
              <Field label="Quantité" required hint="Nombre de parts">
                <Input
                  type="number" step="any" min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </Field>
              <Field label="Prix unitaire" required hint={`Devise ${positionCurrency}`}>
                <Input
                  type="number" step="any" min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required
                />
              </Field>
            </FormGrid>

            {type === 'purchase' && (
              <Field
                label={
                  <span className="inline-flex items-center gap-1">
                    Frais
                    <InfoTip text="Intégrés au PRU pondéré (convention CUMP)." />
                  </span>
                }
              >
                <Input
                  type="number" step="any" min={0}
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            )}
          </>
        )}

        {type === 'dividend' && (
          <FormGrid>
            <Field label="Montant" required hint="Brut, dans la devise sélectionnée">
              <Input
                type="number" step="any" min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Devise" required>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)} required>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
                <option value="JPY">JPY</option>
              </Select>
            </Field>
          </FormGrid>
        )}

        <Field label="Date" required hint="Antérieure autorisée (transaction rétroactive).">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={TODAY()}
            required
          />
        </Field>

        {success && (
          <p className="text-sm text-accent bg-accent-muted px-3 py-2 rounded-lg">
            ✓ Transaction mise à jour.
          </p>
        )}
        {error && (
          <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button type="submit" loading={loading} disabled={success}>
            Mettre à jour
          </Button>
        </div>
      </form>
    </Modal>
  )
}
