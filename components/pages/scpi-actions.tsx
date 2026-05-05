'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }      from '@/components/ui/button'
import { AddScpiForm } from '@/components/forms/add-scpi-form'

export function ScpiActions() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter une SCPI</Button>
      <AddScpiForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
