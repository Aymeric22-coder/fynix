'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Modal }   from '@/components/ui/modal'
import { Button }  from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { useForm } from '@/hooks/use-form'
import { formatCurrency } from '@/lib/utils/format'
import type { FinancialEnvelope } from '@/types/database.types'

interface InitialData {
  id:               string
  name:             string
  asset_type:       string
  ticker:           string
  isin:             string
  envelope_id:      string
  quantity:         number
  average_price:    number
  acquisition_date: string
  notes:            string
}

interface Props {
  open:         boolean
  onClose:      () => void
  envelopes:    FinancialEnvelope[]
  initialData?: InitialData
}

const INITIAL = {
  name:             '',
  asset_type:       'stock' as string,
  ticker:           '',
  isin:             '',
  envelope_id:      '',
  quantity:         undefined as number | undefined,
  average_price:    undefined as number | undefined,
  acquisition_date: '',
  notes:            '',
}

export function AddFinancialAssetForm({ open, onClose, envelopes, initialData }: Props) {
  const router = useRouter()
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)

  const isEdit = !!initialData

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          name:             initialData.name,
          asset_type:       initialData.asset_type,
          ticker:           initialData.ticker,
          isin:             initialData.isin,
          envelope_id:      initialData.envelope_id,
          quantity:         initialData.quantity as number | undefined,
          average_price:    initialData.average_price as number | undefined,
          acquisition_date: initialData.acquisition_date,
          notes:            initialData.notes,
        }
      : INITIAL,
    async onSubmit(v) {
      if (!v.name || !v.asset_type || !v.quantity || !v.average_price)
        return { error: 'Nom, type, quantité et PRU sont requis' }

      const url    = isEdit ? `/api/financial/assets/${initialData!.id}` : '/api/financial/assets'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             v.name,
          asset_type:       v.asset_type,
          ticker:           v.ticker    || undefined,
          isin:             v.isin      || undefined,
          envelope_id:      v.envelope_id || undefined,
          quantity:         v.quantity,
          average_price:    v.average_price,
          acquisition_date: v.acquisition_date || undefined,
          notes:            v.notes || null,
          currency:         'EUR',
        }),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); setLivePrice(null); onClose(); router.refresh() },
  })

  // Recherche prix live quand ticker change
  useEffect(() => {
    const ticker = values.ticker.trim().toUpperCase()
    if (!ticker || ticker.length < 2) { setLivePrice(null); return }

    const timeout = setTimeout(async () => {
      setPriceLoading(true)
      try {
        const res = await fetch(`/api/prices/${encodeURIComponent(ticker)}`)
        const json = await res.json()
        setLivePrice(json.data?.price ?? null)
      } catch { setLivePrice(null) }
      finally { setPriceLoading(false) }
    }, 800)

    return () => clearTimeout(timeout)
  }, [values.ticker])

  const estimatedValue = values.quantity && values.average_price
    ? values.quantity * values.average_price
    : null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Modifier l'actif financier" : "Ajouter un actif financier"} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormSection>
          <Field label="Nom de l'actif" required>
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} placeholder="ex : Apple Inc." required />
          </Field>
          <FormGrid>
            <Field label="Type" required>
              <Select value={values.asset_type} onChange={(e) => set('asset_type', e.target.value)}>
                <option value="stock">Action</option>
                <option value="etf">ETF</option>
                <option value="crypto">Crypto</option>
                <option value="gold">Or</option>
                <option value="other">Autre</option>
              </Select>
            </Field>
            <Field label="Enveloppe fiscale">
              <Select value={values.envelope_id} onChange={(e) => set('envelope_id', e.target.value)}>
                <option value="">— Aucune —</option>
                {envelopes.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Identification marché">
          <FormGrid>
            <Field label="Ticker" hint="ex: AAPL, BTC-EUR, GLD">
              <div className="relative">
                <Input
                  value={values.ticker}
                  onChange={(e) => set('ticker', e.target.value.toUpperCase())}
                  placeholder="AAPL"
                  className="pr-8"
                />
                <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              </div>
            </Field>
            <Field label="ISIN" hint="ex: US0378331005">
              <Input value={values.isin} onChange={(e) => set('isin', e.target.value.toUpperCase())} placeholder="US0378331005" />
            </Field>
          </FormGrid>

          {/* Prix live */}
          {values.ticker && (
            <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
              {priceLoading
                ? <><span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span className="text-secondary">Recherche du prix…</span></>
                : livePrice !== null
                  ? <><span className="text-secondary">Prix actuel :</span><span className="text-accent font-medium financial-value">{formatCurrency(livePrice)}</span></>
                  : <span className="text-muted">Prix non trouvé — vérifiez le ticker</span>
              }
            </div>
          )}
        </FormSection>

        <FormSection title="Position">
          <FormGrid>
            <Field label="Quantité" required hint="Décimales autorisées pour crypto">
              <Input type="number" step="any" min={0} value={values.quantity ?? ''} onChange={(e) => setNumber('quantity', e.target.value)} placeholder="10" required />
            </Field>
            <Field label="PRU (€)" required hint="Prix de revient unitaire moyen">
              <Input type="number" step="any" min={0} value={values.average_price ?? ''} onChange={(e) => setNumber('average_price', e.target.value)} placeholder="150.00" required />
            </Field>
          </FormGrid>
          <Field label="Date d'acquisition">
            <Input type="date" value={values.acquisition_date} onChange={(e) => set('acquisition_date', e.target.value)} />
          </Field>

          {estimatedValue !== null && (
            <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
              <span className="text-secondary">Valeur investie totale : </span>
              <span className="text-primary font-medium financial-value">{formatCurrency(estimatedValue, 'EUR')}</span>
            </div>
          )}
        </FormSection>

        <Field label="Notes">
          <Textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Contexte, stratégie d'investissement…" />
        </Field>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : "Ajouter l'actif"}</Button>
        </div>
      </form>
    </Modal>
  )
}
