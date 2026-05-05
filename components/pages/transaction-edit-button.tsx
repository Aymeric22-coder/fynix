'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { AddTransactionForm } from '@/components/forms/add-transaction-form'

interface TxData {
  id:               string
  transaction_type: string
  label:            string | null
  amount:           number
  quantity:         number | null
  unit_price:       number | null
  executed_at:      string
  notes:            string | null
}

interface Props {
  tx: TxData
}

export function TransactionEditButton({ tx }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded hover:bg-surface text-muted hover:text-primary transition-colors flex-shrink-0"
        title="Modifier"
      >
        <Pencil size={13} />
      </button>
      <AddTransactionForm
        open={open}
        onClose={() => setOpen(false)}
        initialData={tx}
      />
    </>
  )
}
