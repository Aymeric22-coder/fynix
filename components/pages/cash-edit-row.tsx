'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { AddCashForm } from '@/components/forms/add-cash-form'

interface AccountData {
  id:            string
  name:          string
  account_type:  string
  bank_name:     string | null
  balance:       number
  interest_rate: number
  balance_date:  string | null
}

interface Props {
  account:  AccountData
  children: React.ReactNode
}

export function CashEditRow({ account, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="card p-5 flex items-center gap-5 group">
        {children}
        <button
          onClick={() => setOpen(true)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-surface-2 text-muted hover:text-primary flex-shrink-0"
          title="Modifier"
        >
          <Pencil size={14} />
        </button>
      </div>
      <AddCashForm
        open={open}
        onClose={() => setOpen(false)}
        initialData={{
          id:            account.id,
          name:          account.name,
          account_type:  account.account_type,
          bank_name:     account.bank_name     ?? '',
          balance:       account.balance,
          interest_rate: account.interest_rate,
          balance_date:  account.balance_date  ?? new Date().toISOString().slice(0, 10),
        }}
      />
    </>
  )
}
