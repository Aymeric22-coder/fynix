/**
 * Bandeau affiché sur la fiche d'un bien quand le wizard de création a
 * échoué partiellement (?warn=credit,lots).
 *
 * Refermable : un clic sur ✕ retire le param `warn` de l'URL via
 * router.replace(pathname) pour qu'un refresh ne ré-affiche pas le bandeau.
 *
 * Style mutualisé : voir components/ui/warning-banner.tsx (WarningBannerShell).
 */
'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { WarningBannerShell } from '@/components/ui/warning-banner'

export type WizardWarningKind = 'credit' | 'lots'

const MESSAGES: Record<WizardWarningKind, string> = {
  credit: "Le crédit n'a pas pu être enregistré lors de la création. Ajoute-le manuellement via l'onglet Crédit.",
  lots:   "Les lots/loyers n'ont pas pu être enregistrés. Ajoute-les manuellement via l'onglet correspondant.",
}

interface Props {
  warnings: WizardWarningKind[]
}

export function WizardWarningBanner({ warnings }: Props) {
  const [visible, setVisible] = useState(true)
  const router   = useRouter()
  const pathname = usePathname()

  if (!visible || warnings.length === 0) return null

  function dismiss() {
    setVisible(false)
    router.replace(pathname)
  }

  const onlyOne = warnings.length === 1 ? warnings[0] : null

  return (
    <WarningBannerShell
      rightSlot={
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer l'avertissement"
          className="text-warning hover:text-primary transition-colors"
        >
          <X size={16} />
        </button>
      }
    >
      {onlyOne ? (
        MESSAGES[onlyOne]
      ) : (
        <ul className="list-disc list-inside space-y-1">
          {warnings.map(w => <li key={w}>{MESSAGES[w]}</li>)}
        </ul>
      )}
    </WarningBannerShell>
  )
}
