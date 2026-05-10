'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddPositionForm } from '@/components/forms/add-position-form'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  envelopes: Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>[]
}

export function PortefeuilleActions({ envelopes }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter une position</Button>
      <AddPositionForm
        open={open}
        onClose={() => setOpen(false)}
        envelopes={envelopes}
      />
    </>
  )
}
