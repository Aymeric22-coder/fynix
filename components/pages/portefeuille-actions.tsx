'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileUp, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddPositionForm } from '@/components/forms/add-position-form'
import { PortfolioImportCSVModal } from '@/components/portfolio/import-csv-modal'
import {
  AddTransactionModal,
  type TransactionModalPosition,
} from '@/components/portfolio/add-transaction-modal'
import type { FinancialEnvelope } from '@/types/database.types'

interface Props {
  envelopes: Pick<FinancialEnvelope, 'id' | 'name' | 'envelope_type' | 'broker'>[]
  /**
   * Liste des positions actives serialisees cote serveur pour alimenter
   * la modale « Nouvelle transaction ». Vide ou absente → le bouton est
   * masque (cas portefeuille vide).
   */
  transactionPositions?: TransactionModalPosition[]
}

/** Texte d'aide affiché en tooltip sous le bouton « Importer CSV ». */
const IMPORT_BROKER_HINT = 'Compatible Boursorama, Degiro, Trade Republic, Fortuneo, Lynx/IBKR, Linxea et autres brokers FR/EU.'

export function PortefeuilleActions({ envelopes, transactionPositions }: Props) {
  const router = useRouter()
  const [openAdd, setOpenAdd] = useState(false)
  const [openImport, setOpenImport] = useState(false)
  const [openTx, setOpenTx] = useState(false)

  const hasPositions = !!transactionPositions && transactionPositions.length > 0

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hasPositions && (
            <Button
              variant="secondary"
              icon={Receipt}
              onClick={() => setOpenTx(true)}
            >
              Nouvelle transaction
            </Button>
          )}
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
      {hasPositions && (
        <AddTransactionModal
          open={openTx}
          onClose={() => setOpenTx(false)}
          onSuccess={() => router.refresh()}
          positions={transactionPositions!}
        />
      )}
    </>
  )
}
