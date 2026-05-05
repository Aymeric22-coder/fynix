'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { AddFinancialAssetForm } from '@/components/forms/add-financial-asset-form'
import type { FinancialEnvelope } from '@/types/database.types'

interface FaData {
  id:               string
  name:             string
  ticker:           string | null
  isin:             string | null
  envelope_id:      string | null
  quantity:         number
  average_price:    number
  acquisition_date: string | null
  notes:            string | null
  /** asset_type vient de la join assets!asset_id ou directement selon le contexte */
  asset_type?:      string | null
  asset:            { asset_type: string; status: string } | { asset_type: string; status: string }[] | null
}

interface Props {
  fa:        FaData
  envelopes: FinancialEnvelope[]
  children:  React.ReactNode
}

export function FinancialAssetEditRow({ fa, envelopes, children }: Props) {
  const [open, setOpen] = useState(false)

  // asset_type peut venir directement ou depuis la jointure asset
  const faAsset  = Array.isArray(fa.asset) ? (fa.asset[0] ?? null) : fa.asset
  const assetType = fa.asset_type ?? faAsset?.asset_type ?? 'other'

  return (
    <>
      <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface-2 transition-colors group">
        {children}
        <button
          onClick={() => setOpen(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface text-muted hover:text-primary flex-shrink-0"
          title="Modifier"
        >
          <Pencil size={13} />
        </button>
      </div>
      <AddFinancialAssetForm
        open={open}
        onClose={() => setOpen(false)}
        envelopes={envelopes}
        initialData={{
          id:               fa.id,
          name:             fa.name,
          asset_type:       assetType,
          ticker:           fa.ticker           ?? '',
          isin:             fa.isin             ?? '',
          envelope_id:      fa.envelope_id      ?? '',
          quantity:         fa.quantity,
          average_price:    fa.average_price,
          acquisition_date: fa.acquisition_date ?? '',
          notes:            fa.notes            ?? '',
        }}
      />
    </>
  )
}
