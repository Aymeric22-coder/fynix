'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { AddScpiForm } from '@/components/forms/add-scpi-form'

interface ScpiData {
  id:                  string
  name:                string
  scpi_name:           string
  holding_mode:        string
  envelope_name:       string | null
  nb_shares:           number
  subscription_price:  number | null
  current_share_price: number | null
  withdrawal_price:    number | null
  distribution_rate:   number | null
  acquisition_date:    string | null
}

interface Props {
  scpi: ScpiData
}

export function ScpiEditButton({ scpi }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded hover:bg-surface-2 text-muted hover:text-primary transition-colors"
        title="Modifier"
      >
        <Pencil size={14} />
      </button>
      <AddScpiForm
        open={open}
        onClose={() => setOpen(false)}
        initialData={scpi}
      />
    </>
  )
}
