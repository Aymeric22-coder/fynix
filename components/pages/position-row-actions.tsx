'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { AddPositionForm, type PositionInitialData } from '@/components/forms/add-position-form'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  data:      PositionInitialData
  envelopes: Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>[]
}

export function PositionRowActions({ data, envelopes }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen]   = useState(false)
  const [confirm, setConfirm]     = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const res = await fetch(`/api/portfolio/positions/${data.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Suppression impossible')
      return
    }
    setConfirm(false)
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {confirm ? (
        <>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded bg-danger-muted text-danger hover:bg-danger hover:text-white transition-colors disabled:opacity-50"
            title="Confirmer la suppression"
          >
            {deleting ? '…' : 'Supprimer'}
          </button>
          <button
            type="button"
            onClick={() => { setConfirm(false); setError(null) }}
            disabled={deleting}
            className="text-xs px-2 py-1 rounded text-secondary hover:text-primary hover:bg-surface-2"
          >
            Annuler
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="p-1.5 rounded hover:bg-surface-2 text-muted hover:text-primary transition-colors"
            title="Modifier"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="p-1.5 rounded hover:bg-danger-muted text-muted hover:text-danger transition-colors"
            title="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        </>
      )}

      {error && (
        <span className="text-xs text-danger ml-2">{error}</span>
      )}

      <AddPositionForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        envelopes={envelopes}
        initialData={data}
      />
    </div>
  )
}
