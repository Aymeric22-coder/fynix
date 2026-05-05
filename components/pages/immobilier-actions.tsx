'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { AddPropertyForm } from '@/components/forms/add-property-form'

export function ImmobilierActions() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter un bien</Button>
      <AddPropertyForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
