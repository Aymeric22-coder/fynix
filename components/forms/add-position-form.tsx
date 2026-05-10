'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus } from 'lucide-react'
import { Modal }  from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea, FormGrid, FormSection } from '@/components/ui/field'
import { AddEnvelopeForm } from '@/components/forms/add-envelope-form'
import { useForm } from '@/hooks/use-form'
import { formatCurrency, ASSET_CLASS_LABELS } from '@/lib/utils/format'
import type { AssetClass, FinancialEnvelope } from '@/types/database.types'

export interface PositionInitialData {
  id:               string
  name:             string
  asset_class:      AssetClass
  ticker:           string
  isin:             string
  envelope_id:      string
  quantity:         number
  average_price:    number
  currency:         'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'BTC' | 'ETH'
  broker:           string
  acquisition_date: string
  notes:            string
}

interface Props {
  open:         boolean
  onClose:      () => void
  envelopes:    Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>[]
  initialData?: PositionInitialData
}

const INITIAL = {
  name:             '',
  asset_class:      'equity' as AssetClass,
  ticker:           '',
  isin:             '',
  envelope_id:      '',
  quantity:         undefined as number | undefined,
  average_price:    undefined as number | undefined,
  currency:         'EUR' as const,
  broker:           '',
  acquisition_date: '',
  notes:            '',
}

const ASSET_CLASSES: AssetClass[] = [
  'equity','etf','fund','crypto','scpi','reit','bond','metal',
  'private_equity','crowdfunding','private_debt','structured',
  'opci','siic','derivative','defi','other',
]

export function AddPositionForm({ open, onClose, envelopes, initialData }: Props) {
  const router = useRouter()
  const isEdit = !!initialData

  const [livePrice, setLivePrice]     = useState<{ price: number; currency: string } | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)
  const [envelopeModal, setEnvelopeModal] = useState(false)
  // Liste locale d'envelopes : on ajoute la nouvelle créée à la volée
  const [localEnvelopes, setLocalEnvelopes] = useState(envelopes)
  // Sync si la prop change (router.refresh côté parent)
  useEffect(() => { setLocalEnvelopes(envelopes) }, [envelopes])

  const { values, set, setNumber, loading, error, handleSubmit, reset } = useForm({
    initialValues: initialData
      ? {
          name:             initialData.name,
          asset_class:      initialData.asset_class,
          ticker:           initialData.ticker,
          isin:             initialData.isin,
          envelope_id:      initialData.envelope_id,
          quantity:         initialData.quantity as number | undefined,
          average_price:    initialData.average_price as number | undefined,
          currency:         initialData.currency,
          broker:           initialData.broker,
          acquisition_date: initialData.acquisition_date,
          notes:            initialData.notes,
        }
      : INITIAL,
    async onSubmit(v) {
      if (!v.name)                        return { error: 'Le nom de l\'instrument est requis' }
      if (!v.quantity || v.quantity <= 0) return { error: 'Quantité invalide' }
      if (v.average_price === undefined || v.average_price < 0)
        return { error: 'PRU invalide' }

      const url    = isEdit ? `/api/portfolio/positions/${initialData!.id}` : '/api/portfolio/positions'
      const method = isEdit ? 'PUT' : 'POST'

      // En mode edit, on ne ré-envoie pas l'instrument (immuable côté UI pour l'instant).
      // Pour changer d'instrument il faut supprimer + recréer la position.
      const body = isEdit
        ? {
            envelope_id:      v.envelope_id || null,
            quantity:         v.quantity,
            average_price:    v.average_price,
            currency:         v.currency,
            broker:           v.broker || null,
            acquisition_date: v.acquisition_date || null,
            notes:            v.notes || null,
          }
        : {
            instrument: {
              name:        v.name,
              asset_class: v.asset_class,
              ticker:      v.ticker.trim() || undefined,
              isin:        v.isin.trim()   || undefined,
              currency:    v.currency,
            },
            envelope_id:      v.envelope_id || undefined,
            quantity:         v.quantity,
            average_price:    v.average_price,
            currency:         v.currency,
            broker:           v.broker || undefined,
            acquisition_date: v.acquisition_date || undefined,
            notes:            v.notes || undefined,
          }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) return { error: json.error }
      return {}
    },
    onSuccess() { reset(); setLivePrice(null); onClose(); router.refresh() },
  })

  // Lookup live du prix via Yahoo Finance quand le ticker change
  useEffect(() => {
    if (isEdit) return  // pas de lookup en mode édition (ticker non modifiable)
    const ticker = values.ticker.trim().toUpperCase()
    if (!ticker || ticker.length < 2) {
      setLivePrice(null)
      return
    }
    const handle = setTimeout(async () => {
      setPriceLoading(true)
      try {
        const res  = await fetch(`/api/prices/${encodeURIComponent(ticker)}`)
        const json = await res.json()
        if (json.data?.price) {
          setLivePrice({ price: json.data.price, currency: json.data.currency ?? 'USD' })
        } else {
          setLivePrice(null)
        }
      } catch {
        setLivePrice(null)
      } finally {
        setPriceLoading(false)
      }
    }, 700)
    return () => clearTimeout(handle)
  }, [values.ticker, isEdit])

  const investedTotal = values.quantity && values.average_price
    ? values.quantity * values.average_price
    : null

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier la position' : 'Ajouter une position'} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {!isEdit && (
          <FormSection title="Instrument">
            <Field label="Nom" required hint="ex: Apple Inc., iShares Core MSCI World, Bitcoin">
              <Input
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Apple Inc."
                required
              />
            </Field>
            <FormGrid>
              <Field label="Classe d'actif" required>
                <Select value={values.asset_class} onChange={(e) => set('asset_class', e.target.value as AssetClass)}>
                  {ASSET_CLASSES.map((c) => (
                    <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Devise">
                <Select value={values.currency} onChange={(e) => set('currency', e.target.value as 'EUR')}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                  <option value="JPY">JPY</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                </Select>
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="Ticker" hint="ex: AAPL, IWDA, BTC-EUR">
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
                <Input
                  value={values.isin}
                  onChange={(e) => set('isin', e.target.value.toUpperCase())}
                  placeholder="US0378331005"
                />
              </Field>
            </FormGrid>

            {values.ticker && (
              <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
                {priceLoading
                  ? <>
                      <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-secondary">Recherche du prix…</span>
                    </>
                  : livePrice
                    ? <>
                        <span className="text-secondary">Prix actuel ({livePrice.currency}) :</span>
                        <span className="text-accent font-medium financial-value">{formatCurrency(livePrice.price, livePrice.currency)}</span>
                      </>
                    : <span className="text-muted">Prix non trouvé — vérifie le ticker</span>
                }
              </div>
            )}
          </FormSection>
        )}

        {isEdit && (
          <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
            <span className="text-secondary">Instrument : </span>
            <span className="text-primary font-medium">{values.name}</span>
            {values.ticker && <span className="text-muted ml-2">({values.ticker})</span>}
            <p className="text-xs text-muted mt-1">Pour changer d&apos;instrument, supprime cette position et recrée-la.</p>
          </div>
        )}

        <FormSection title="Position">
          <FormGrid>
            <Field label="Quantité" required hint="Décimales autorisées (crypto)">
              <Input
                type="number" step="any" min={0}
                value={values.quantity ?? ''}
                onChange={(e) => setNumber('quantity', e.target.value)}
                placeholder="10"
                required
              />
            </Field>
            <Field label="PRU" required hint="Prix de revient unitaire (devise position)">
              <Input
                type="number" step="any" min={0}
                value={values.average_price ?? ''}
                onChange={(e) => setNumber('average_price', e.target.value)}
                placeholder="150.00"
                required
              />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Enveloppe">
              <div className="space-y-1.5">
                <Select value={values.envelope_id} onChange={(e) => set('envelope_id', e.target.value)}>
                  <option value="">— Détention directe —</option>
                  {localEnvelopes.map((env) => (
                    <option key={env.id} value={env.id}>{env.name}</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setEnvelopeModal(true)}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  <Plus size={11} /> Nouvelle enveloppe (PEA, AV, CTO…)
                </button>
              </div>
            </Field>
            <Field label="Courtier">
              <Input
                value={values.broker}
                onChange={(e) => set('broker', e.target.value)}
                placeholder="Trade Republic, Boursorama…"
              />
            </Field>
          </FormGrid>
          <Field label="Date d'acquisition">
            <Input
              type="date"
              value={values.acquisition_date}
              onChange={(e) => set('acquisition_date', e.target.value)}
            />
          </Field>

          {investedTotal !== null && (
            <div className="bg-surface-2 rounded-lg px-4 py-3 text-sm">
              <span className="text-secondary">Capital investi : </span>
              <span className="text-primary font-medium financial-value">
                {formatCurrency(investedTotal, values.currency)}
              </span>
            </div>
          )}
        </FormSection>

        <Field label="Notes">
          <Textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Stratégie, contexte d'achat…"
          />
        </Field>

        {error && <p className="text-sm text-danger bg-danger-muted px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button type="submit" loading={loading}>{isEdit ? 'Enregistrer' : 'Ajouter la position'}</Button>
        </div>
      </form>

      <AddEnvelopeForm
        open={envelopeModal}
        onClose={() => setEnvelopeModal(false)}
        onCreated={(env) => {
          // Ajoute localement et auto-sélectionne la nouvelle enveloppe
          setLocalEnvelopes((prev) => [...prev, {
            id:            env.id,
            name:          env.name,
            envelope_type: env.envelope_type,
            broker:        env.broker,
          } as Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>])
          set('envelope_id', env.id)
        }}
      />
    </Modal>
  )
}
