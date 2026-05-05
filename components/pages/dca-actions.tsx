'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { AddDcaPlanForm }  from '@/components/forms/add-dca-plan-form'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  envelopes: FinancialEnvelope[]
}

export function DcaActions({ envelopes }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>Nouveau plan DCA</Button>
      <AddDcaPlanForm open={open} onClose={() => setOpen(false)} envelopes={envelopes} />
    </>
  )
}
