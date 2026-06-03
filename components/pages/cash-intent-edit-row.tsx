/**
 * `CashIntentEditRow` — Client Component (Cash V1.2, Volet E).
 * Wrapper carte cliquable → modal d'édition. Bouton edit + delete avec
 * visibilité mobile (cf. fix V1.1 sur `cash-edit-row`).
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { AddCashIntentForm } from '@/components/forms/add-cash-intent-form'
import type { CashIntent } from '@/lib/cash/intents'

interface CashAccountMeta { id: string; name: string }

interface Props {
  intent:        CashIntent
  cashAccounts:  CashAccountMeta[]
  children:      React.ReactNode
}

export function CashIntentEditRow({ intent, cashAccounts, children }: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [isDeleting, startDelete] = useTransition()

  const onDelete = () => {
    if (!confirm('Supprimer cette intention ?')) return
    startDelete(async () => {
      const res = await fetch(`/api/cash/intents/${intent.id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
    })
  }

  return (
    <>
      <div className="card p-4 flex items-center gap-4 group">
        {children}
        <button
          onClick={() => setOpen(true)}
          className="opacity-40 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 rounded hover:bg-surface-2 text-muted hover:text-primary flex-shrink-0"
          title="Modifier"
          aria-label="Modifier l'intention"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="opacity-40 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1.5 rounded hover:bg-danger-muted text-muted hover:text-danger flex-shrink-0 disabled:opacity-30"
          title="Supprimer"
          aria-label="Supprimer l'intention"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <AddCashIntentForm
        open={open}
        onClose={() => setOpen(false)}
        cashAccounts={cashAccounts}
        initialData={{
          id:              intent.id,
          montant:         intent.montant,
          motif:           intent.motif,
          motif_libre:     intent.motif_libre ?? '',
          cash_account_id: intent.cash_account_id,
          target_date:     intent.target_date ?? '',
        }}
      />
    </>
  )
}
