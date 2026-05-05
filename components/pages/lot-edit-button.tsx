'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { AddLotForm } from '@/components/forms/add-lot-form'

interface LotData {
  id:             string
  name:           string
  lot_type:       string | null
  surface_m2:     number | null
  status:         string
  rent_amount:    number | null
  charges_amount: number | null
  tenant_name:    string | null
  lease_start:    string | null
  lease_end:      string | null
}

interface Props {
  lot:        LotData
  propertyId: string
}

export function LotEditButton({ lot, propertyId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded hover:bg-surface text-muted hover:text-primary transition-colors flex-shrink-0"
        title="Modifier le lot"
      >
        <Pencil size={13} />
      </button>
      <AddLotForm
        open={open}
        onClose={() => setOpen(false)}
        propertyId={propertyId}
        initialData={lot}
      />
    </>
  )
}
