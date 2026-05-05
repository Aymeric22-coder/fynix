'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, SkipForward } from 'lucide-react'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { formatCurrency, formatDate } from '@/lib/utils/format'

interface Occurrence {
  id:             string
  scheduled_date: string
  planned_amount: number
  status:         string
}

interface Props {
  occurrence: Occurrence
  ticker:     string
  currency:   string
}

export function ValidateOccurrence({ occurrence, ticker, currency }: Props) {
  const [open,       setOpen]       = useState(false)
  const [action,     setAction]     = useState<'validate' | 'skip'>('validate')
  const [actualAmount, setActual]   = useState<string>(String(occurrence.planned_amount))
  const [actualPrice,  setPrice]    = useState<string>('')
  const [note,         setNote]     = useState<string>('')
  const [loading,      setLoading]  = useState(false)
  const [error,        setError]    = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    const body =
      action === 'skip'
        ? { action: 'skip', deviation_note: note || undefined }
        : {
            action: 'validate',
            actual_amount: Number(actualAmount) || undefined,
            actual_price:  Number(actualPrice)  || undefined,
            deviation_note: note || undefined,
          }

    const res = await fetch(`/api/dca/occurrences/${occurrence.id}/validate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    setLoading(false)

    if (json.error) { setError(json.error); return }
    setOpen(false)
    router.refresh()
  }

  const deviation = Number(actualAmount) - occurrence.planned_amount

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Valider
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`DCA ${ticker}`} subtitle={formatDate(occurrence.scheduled_date, 'long')} size="sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Toggle valider / ignorer */}
          <div className="flex bg-surface-2 rounded-lg p-1 gap-1">
            {(['validate', 'skip'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  action === a ? 'bg-surface text-primary shadow-card' : 'text-secondary hover:text-primary'
                }`}
              >
                {a === 'validate'
                  ? <><CheckCircle2 size={13} />Valider</>
                  : <><SkipForward  size={13} />Ignorer</>
                }
              </button>
            ))}
          </div>

          {action === 'validate' && (
            <>
              <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
                <span className="text-secondary">Montant planifié : </span>
                <span className="text-primary font-medium financial-value">
                  {formatCurrency(occurrence.planned_amount, currency)}
                </span>
              </div>

              <Field label="Montant réellement investi (€)" hint="Laisser vide si identique au plan">
                <Input
                  type="number" step="any" min={0}
                  value={actualAmount}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder={String(occurrence.planned_amount)}
                />
              </Field>

              <Field label="Prix d'exécution (€/unité)" hint="Permet de calculer la quantité achetée">
                <Input
                  type="number" step="any" min={0}
                  value={actualPrice}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="ex : 148.32"
                />
              </Field>

              {/* Quantité estimée */}
              {Number(actualAmount) > 0 && Number(actualPrice) > 0 && (
                <div className="bg-accent-muted border border-accent/20 rounded-lg px-4 py-3 text-sm">
                  <span className="text-secondary">Quantité achetée : </span>
                  <span className="text-accent font-medium financial-value">
                    {(Number(actualAmount) / Number(actualPrice)).toFixed(6)} {ticker}
                  </span>
                </div>
              )}

              {/* Écart */}
              {deviation !== 0 && Number(actualAmount) > 0 && (
                <p className={`text-xs ${Math.abs(deviation) < 1 ? 'text-secondary' : deviation > 0 ? 'text-accent' : 'text-warning'}`}>
                  Écart : {deviation > 0 ? '+' : ''}{formatCurrency(deviation, currency)}
                </p>
              )}
            </>
          )}

          <Field label={action === 'skip' ? 'Raison (optionnel)' : 'Note (optionnel)'}>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={action === 'skip' ? 'ex : Liquidités insuffisantes' : 'Commentaire sur cet ordre'}
              rows={2}
            />
          </Field>

          {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              type="submit"
              loading={loading}
              variant={action === 'skip' ? 'ghost' : 'primary'}
            >
              {action === 'validate' ? 'Confirmer l\'achat' : 'Ignorer cette occurrence'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
