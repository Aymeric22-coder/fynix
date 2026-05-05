'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }      from '@/components/ui/button'
import { AddCashForm } from '@/components/forms/add-cash-form'

export function CashActions() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter un compte</Button>
      <AddCashForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
