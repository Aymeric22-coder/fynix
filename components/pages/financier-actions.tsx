'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }                from '@/components/ui/button'
import { AddFinancialAssetForm } from '@/components/forms/add-financial-asset-form'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  envelopes: FinancialEnvelope[]
}

export function FinancierActions({ envelopes }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Ajouter un actif</Button>
      <AddFinancialAssetForm open={open} onClose={() => setOpen(false)} envelopes={envelopes} />
    </>
  )
}
