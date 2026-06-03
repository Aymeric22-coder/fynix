/**
 * `CashIntentActions` — Client Component (Cash V1.2, Volet E).
 * Bouton « Ajouter une intention » qui ouvre la modale CRUD.
 */
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddCashIntentForm } from '@/components/forms/add-cash-intent-form'

interface CashAccountMeta { id: string; name: string }

export function CashIntentActions({ cashAccounts }: { cashAccounts: CashAccountMeta[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} variant="secondary" onClick={() => setOpen(true)}>
        Ajouter une intention
      </Button>
      <AddCashIntentForm
        open={open}
        onClose={() => setOpen(false)}
        cashAccounts={cashAccounts}
      />
    </>
  )
}
