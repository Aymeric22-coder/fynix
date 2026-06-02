/**
 * DismissButton — petit bouton « Masquer » + modal embarqué (V2.2-BIS ST4).
 *
 * Conçu pour être inséré dans un Server Component (AlertsPanel,
 * ActionsDuMois, RealEstateAlertsPanel) sans le forcer à passer en client.
 * Le composant encapsule à la fois le déclencheur visuel et l'état
 * d'ouverture du modal — le parent ne fait que passer signature + preview.
 */
'use client'

import { useState } from 'react'
import { EyeOff } from 'lucide-react'
import { DismissAlertModal } from './dismiss-alert-modal'

interface Props {
  signature: string
  /** Texte de l'alerte ou recommandation, rappelé dans le modal. */
  preview:   string
  /** Influence le titre + la liste des raisons. */
  kind:      'alert' | 'reco'
  /** Optionnel — label accessible / tooltip. Défaut « Masquer ». */
  ariaLabel?: string
}

export function DismissButton({ signature, preview, kind, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={ariaLabel ?? 'Masquer'}
        aria-label={ariaLabel ?? 'Masquer'}
        className="inline-flex items-center gap-1 text-[11px] text-secondary hover:text-primary transition-colors px-1.5 py-0.5 rounded"
      >
        <EyeOff size={11} />
        <span className="hidden sm:inline">masquer</span>
      </button>
      <DismissAlertModal
        open={open}
        onClose={() => setOpen(false)}
        signature={signature}
        kind={kind}
        preview={preview}
      />
    </>
  )
}
