/**
 * Bouton « Nouvelle transaction » + modale, dedie a la PAGE DETAIL
 * d'une position (cas mono-position avec verrouillage du selecteur).
 *
 * Difference avec PortefeuilleActions : ici on connait la position
 * (defaultPositionId), et on peut pre-selectionner le type via un query
 * param `?type=sell|buy|dividend` (lit cote serveur, passe en prop).
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AddTransactionModal,
  type TransactionModalPosition,
  type TransactionType,
} from '@/components/portfolio/add-transaction-modal'

interface Props {
  position:    TransactionModalPosition
  /** Pre-selection du type via query param (?type=sell|dividend|buy). */
  defaultType?: TransactionType
}

export function PositionTransactionActions({ position, defaultType }: Props) {
  const router = useRouter()
  // Si un defaultType est fourni via l'URL, on ouvre automatiquement
  // la modale a l'arrivee sur la page (deep-link).
  const [open, setOpen] = useState(!!defaultType)

  return (
    <>
      <Button
        variant="secondary"
        icon={Receipt}
        onClick={() => setOpen(true)}
      >
        Nouvelle transaction
      </Button>
      <AddTransactionModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => router.refresh()}
        positions={[position]}
        defaultPositionId={position.id}
        defaultType={defaultType}
      />
    </>
  )
}
