'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }       from '@/components/ui/button'
import { AddDebtForm }  from '@/components/forms/add-debt-form'

export function DettesActions() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter un crédit</Button>
      <AddDebtForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
