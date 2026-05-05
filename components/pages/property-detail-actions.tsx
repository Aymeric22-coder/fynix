'use client'

import { useState } from 'react'
import { Plus }           from 'lucide-react'
import { Button }         from '@/components/ui/button'
import { AddLotForm }     from '@/components/forms/add-lot-form'
import { AddValuationForm } from '@/components/forms/add-valuation-form'

interface Props {
  propertyId: string
  surfaceM2?: number | null
}

export function PropertyLotActions({ propertyId }: Pick<Props, 'propertyId'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>
        Ajouter un lot
      </Button>
      <AddLotForm open={open} onClose={() => setOpen(false)} propertyId={propertyId} />
    </>
  )
}

export function PropertyValuationActions({ propertyId, surfaceM2 }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setOpen(true)}>
        Nouvelle estimation
      </Button>
      <AddValuationForm
        open={open}
        onClose={() => setOpen(false)}
        propertyId={propertyId}
        surfaceM2={surfaceM2}
      />
    </>
  )
}
