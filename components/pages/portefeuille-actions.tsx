'use client'

import { useState } from 'react'
import { Plus, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddPositionForm } from '@/components/forms/add-position-form'
import { PortfolioImportCSVModal } from '@/components/portfolio/import-csv-modal'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  envelopes: Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>[]
}

export function PortefeuilleActions({ envelopes }: Props) {
  const [openAdd, setOpenAdd] = useState(false)
  const [openImport, setOpenImport] = useState(false)
  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" icon={FileUp} onClick={() => setOpenImport(true)}>
          Importer CSV
        </Button>
        <Button icon={Plus} onClick={() => setOpenAdd(true)}>Ajouter une position</Button>
      </div>
      <AddPositionForm
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        envelopes={envelopes}
      />
      <PortfolioImportCSVModal
        open={openImport}
        onClose={() => setOpenImport(false)}
      />
    </>
  )
}
