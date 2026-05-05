'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }               from '@/components/ui/button'
import { AddTransactionForm }   from '@/components/forms/add-transaction-form'

export function TransactionActions() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Enregistrer</Button>
      <AddTransactionForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
