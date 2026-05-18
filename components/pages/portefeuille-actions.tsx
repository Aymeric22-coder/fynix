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

/** Texte d'aide affiché en tooltip sous le bouton « Importer CSV ». */
const IMPORT_BROKER_HINT = 'Compatible Boursorama, Degiro, Trade Republic, Fortuneo, Lynx/IBKR, Linxea et autres brokers FR/EU.'

export function PortefeuilleActions({ envelopes }: Props) {
  const [openAdd, setOpenAdd] = useState(false)
  const [openImport, setOpenImport] = useState(false)
  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={FileUp}
            onClick={() => setOpenImport(true)}
            title={IMPORT_BROKER_HINT}
          >
            Importer CSV
          </Button>
          <Button icon={Plus} onClick={() => setOpenAdd(true)}>Ajouter une position</Button>
        </div>
        <p className="text-[10px] text-muted hidden sm:block">
          {IMPORT_BROKER_HINT}
        </p>
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
