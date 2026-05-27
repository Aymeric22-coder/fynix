/**
 * Modale unifiee « Nouvelle transaction » (TX).
 *
 * Couvre les 3 types de transactions sur une position existante :
 *   - 'buy'      : achat complementaire (ajoute des parts a la position)
 *   - 'sell'     : vente partielle ou totale (reduit les parts)
 *   - 'dividend' : versement de dividende encaisse
 *
 * Hors scope : creation d'une nouvelle position (reste via AddPositionForm).
 *
 * Mapping vers les routes API existantes (aucune modif des routes) :
 *
 *   buy  → PUT /api/portfolio/positions/{id}
 *     body: { quantity: newQty, average_price: newAvgPrice, transaction_date }
 *     Le client calcule un PRU pondere :
 *       newAvgPrice = (oldQty × oldPru + buyQty × prixAchat + fees) / newQty
 *     Le backend reconstruit ensuite le unit_price de la transaction
 *     implicite via computePositionMovement — les frais y sont integres.
 *
 *   sell → PUT /api/portfolio/positions/{id}
 *     body: { quantity: newQty, manual_price: prixVente, transaction_date }
 *     Side-effect documente : le prix de vente est pousse dans
 *     instrument_prices via manual_price, ce qui met a jour le dernier
 *     prix connu de l'instrument. Le backend lit ensuite ce
 *     lastMarketPrice pour calculer realized_pnl = (prixVente − oldPru) × soldQty.
 *
 *   dividend → POST /api/portfolio/dividends
 *     body: { position_id, amount, currency, executed_at }
 */

'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, FormGrid } from '@/components/ui/field'
import { formatCurrency } from '@/lib/utils/format'

export type TransactionType = 'buy' | 'sell' | 'dividend'

export interface TransactionModalPosition {
  id:            string
  ticker:        string
  name:          string
  /** Libelle de l'enveloppe (PEA, CTO, AV...) — vide si detention directe. */
  envelopeLabel: string
  /** Quantite actuelle detenue. Sert au plafond de vente et a la pre-vue. */
  currentQty:    number
  /** PRU actuel — sert au calcul du nouveau PRU pondere pour les achats. */
  averagePrice:  number
  /** Devise de la position. */
  currency:      string
}

export interface AddTransactionModalProps {
  open:               boolean
  onClose:            () => void
  /** Callback de refresh apres succes (typiquement router.refresh cote parent). */
  onSuccess:          () => void
  positions:          TransactionModalPosition[]
  /** Pre-selectionne une position (verrouille le selecteur). */
  defaultPositionId?: string
  defaultType?:       TransactionType
}

const TYPE_OPTIONS: Array<{ id: TransactionType; label: string }> = [
  { id: 'buy',      label: 'Achat' },
  { id: 'sell',     label: 'Vente' },
  { id: 'dividend', label: 'Dividende' },
]

const TODAY = () => new Date().toISOString().slice(0, 10)

export function AddTransactionModal({
  open, onClose, onSuccess, positions, defaultPositionId, defaultType,
}: AddTransactionModalProps) {
  const [type, setType]                 = useState<TransactionType>(defaultType ?? 'buy')
  const [positionId, setPositionId]     = useState<string>(defaultPositionId ?? (positions[0]?.id ?? ''))
  const [quantity, setQuantity]         = useState<string>('')
  const [unitPrice, setUnitPrice]       = useState<string>('')
  const [fees, setFees]                 = useState<string>('')
  const [amount, setAmount]             = useState<string>('')
  const [currency, setCurrency]         = useState<string>('')
  const [date, setDate]                 = useState<string>(TODAY())
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState(false)

  const positionLocked = !!defaultPositionId

  // Reset champs a chaque ouverture pour eviter de pre-remplir avec un
  // ancien etat. Conserve la pre-selection (type + position) fournie.
  useEffect(() => {
    if (!open) return
    setType(defaultType ?? 'buy')
    setPositionId(defaultPositionId ?? (positions[0]?.id ?? ''))
    setQuantity('')
    setUnitPrice('')
    setFees('')
    setAmount('')
    setDate(TODAY())
    setError(null)
    setSuccess(false)
  }, [open, defaultType, defaultPositionId, positions])

  // Devise par defaut = devise de la position selectionnee (dividende).
  const selectedPosition = positions.find((p) => p.id === positionId) ?? null
  useEffect(() => {
    if (selectedPosition) setCurrency(selectedPosition.currency)
  }, [selectedPosition])

  // ── Validation client ─────────────────────────────────────────────────
  function validate(): string | null {
    if (!selectedPosition) return 'Sélectionne une position'
    if (!date)             return 'Date requise'
    if (date > TODAY())    return 'La date ne peut pas être future'

    if (type === 'dividend') {
      const amt = Number(amount)
      if (!Number.isFinite(amt) || amt <= 0) return 'Montant invalide (> 0)'
      if (!currency)                          return 'Devise requise'
      return null
    }

    const qty   = Number(quantity)
    const price = Number(unitPrice)
    if (!Number.isFinite(qty) || qty <= 0)     return 'Quantité invalide (> 0)'
    if (!Number.isFinite(price) || price <= 0) return 'Prix unitaire invalide (> 0)'
    if (type === 'sell' && qty > selectedPosition.currentQty) {
      return `Vente plafonnée : tu détiens ${selectedPosition.currentQty} part(s)`
    }
    return null
  }

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const msg = validate()
    if (msg) { setError(msg); return }
    if (!selectedPosition) return

    setLoading(true)
    try {
      let res: Response

      if (type === 'dividend') {
        res = await fetch('/api/portfolio/dividends', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            position_id: selectedPosition.id,
            amount:      Number(amount),
            currency,
            executed_at: date,
          }),
        })
      } else if (type === 'buy') {
        const buyQty = Number(quantity)
        const price  = Number(unitPrice)
        const f      = Number(fees) || 0
        const oldQty = selectedPosition.currentQty
        const oldPru = selectedPosition.averagePrice
        const newQty = oldQty + buyQty
        // PRU pondere : (cout existant + cout nouvel achat) / nouvelle quantite.
        // Les frais sont integres au cout d'acquisition (convention CSV / CUMP).
        const newAvgPrice = newQty > 0
          ? (oldQty * oldPru + buyQty * price + f) / newQty
          : 0

        res = await fetch(`/api/portfolio/positions/${selectedPosition.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            quantity:         newQty,
            average_price:    newAvgPrice,
            transaction_date: date,
          }),
        })
      } else {
        // type === 'sell'
        const sellQty = Number(quantity)
        const price   = Number(unitPrice)
        const oldQty  = selectedPosition.currentQty
        const newQty  = oldQty - sellQty
        // manual_price : pousse le prix de vente dans instrument_prices.
        // Side-effect assume : le dernier prix connu de l'instrument est mis
        // a jour. Le backend lit ensuite ce lastMarketPrice pour calculer
        // realized_pnl = (prixVente − oldPru) × soldQty (cf. movements.ts).
        res = await fetch(`/api/portfolio/positions/${selectedPosition.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            quantity:         newQty,
            // average_price inchange volontairement : la convention CUMP/IFRS
            // dit que la PV est realisee mais le PRU residuel ne bouge pas.
            // Si la vente est totale (newQty = 0), la route remet pru=0 elle-meme.
            manual_price:     price,
            transaction_date: date,
            // TODO: frais de courtage vente non modélisés côté API
            // (ni dans le PUT, ni dans la transaction implicite). Si on
            // etend l'API plus tard, reintroduire ici un champ `fees`.
          }),
        })
      }

      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? `Erreur ${res.status}`)
        setLoading(false)
        return
      }

      // Banniere inline 1.5 s puis fermeture + refresh parent
      setSuccess(true)
      setTimeout(() => {
        setLoading(false)
        onSuccess()
        onClose()
      }, 1500)
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────
  const title =
    type === 'buy'      ? 'Nouvelle transaction · Achat'
    : type === 'sell'   ? 'Nouvelle transaction · Vente'
    :                     'Nouvelle transaction · Dividende'

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Selecteur de type — segments. Desactive si defaultType + verrouillage explicite */}
        <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-lg">
          {TYPE_OPTIONS.map((opt) => {
            const active = opt.id === type
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setType(opt.id)}
                className={[
                  'flex-1 px-3 py-1.5 text-sm rounded-md transition-colors',
                  active
                    ? 'bg-surface text-primary shadow'
                    : 'text-secondary hover:text-primary',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Selecteur de position */}
        <Field label="Position" required>
          <Select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            disabled={positionLocked}
            required
          >
            <option value="">— Choisir une position —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ticker ? `${p.ticker} · ` : ''}{p.name}
                {p.envelopeLabel ? ` (${p.envelopeLabel})` : ''}
              </option>
            ))}
          </Select>
        </Field>

        {/* Recap position selectionnee */}
        {selectedPosition && (
          <div className="bg-surface-2 rounded-lg px-4 py-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-secondary">Quantité actuelle</span>
              <span className="financial-value text-primary">{selectedPosition.currentQty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">PRU actuel</span>
              <span className="financial-value text-primary">
                {formatCurrency(selectedPosition.averagePrice, selectedPosition.currency, { decimals: 4 })}
              </span>
            </div>
          </div>
        )}

        {/* Champs dynamiques selon type */}
        {type !== 'dividend' && (
          <>
            <FormGrid>
              <Field
                label="Quantité"
                required
                hint={type === 'sell' && selectedPosition
                  ? `Max ${selectedPosition.currentQty}`
                  : 'Nombre de parts'}
              >
                <Input
                  type="number" step="any" min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="10"
                  required
                />
              </Field>
              <Field
                label="Prix unitaire"
                required
                hint={selectedPosition ? `Devise ${selectedPosition.currency}` : undefined}
              >
                <Input
                  type="number" step="any" min={0}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="150.00"
                  required
                />
              </Field>
            </FormGrid>

            {type === 'buy' && (
              <Field
                label="Frais"
                hint="Inclus dans le PRU pondéré (convention CUMP)"
              >
                <Input
                  type="number" step="any" min={0}
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            )}
            {/* TODO: frais de courtage vente non modélisés côté API
                (le PUT positions/[id] ne les accepte pas, et computePositionMovement
                pose fees=0 sur la transaction implicite). Ajouter un champ ici
                quand l'API sera étendue. */}
          </>
        )}

        {type === 'dividend' && (
          <FormGrid>
            <Field label="Montant" required hint="Brut, dans la devise sélectionnée">
              <Input
                type="number" step="any" min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="12.50"
                autoFocus
                required
              />
            </Field>
            <Field label="Devise" required>
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                required
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
                <option value="JPY">JPY</option>
              </Select>
            </Field>
          </FormGrid>
        )}

        <Field
          label={
            type === 'buy'  ? "Date d'achat"
            : type === 'sell' ? 'Date de vente'
            :                   "Date d'encaissement"
          }
          required
          hint="Vide = aujourd'hui. Antérieure autorisée (transaction rétroactive)."
        >
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={TODAY()}
            required
          />
        </Field>

        {/* Banniere succes / erreur (pas de toast system dans le projet) */}
        {success && (
          <p className="text-sm text-accent bg-accent-muted px-3 py-2 rounded-lg">
            ✓ Transaction enregistrée.
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
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  )
}
