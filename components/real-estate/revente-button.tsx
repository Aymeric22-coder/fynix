/**
 * Bouton « Simuler la revente » + modal associé.
 *
 * Conçu pour être inséré DANS une carte cliquable (<Link>) sans
 * déclencher la navigation au clic — chaque handler appelle
 * stopPropagation + preventDefault.
 *
 * Reçoit déjà toutes les données nécessaires pour le calcul (le
 * serveur les a en main) — pas de requête supplémentaire côté client.
 */
'use client'

import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { SimulationReventeModal, type SimulationReventeBien } from './simulation-revente-modal'

interface Props {
  bien: SimulationReventeBien
  // Pour l'impact FIRE (optionnel — passé depuis le serveur si dispo)
  patrimoineActuel?: number
  epargneMensuelle?: number
  revenuMensuelNet?: number
  ageActuel?:        number
  /** Variante visuelle. */
  variant?: 'card-footer' | 'inline'
  /** Label du bouton (override). */
  label?: string
}

export function ReventeButton({
  bien, patrimoineActuel, epargneMensuelle, revenuMensuelNet, ageActuel,
  variant = 'card-footer', label = 'Simuler la revente',
}: Props) {
  const [open, setOpen] = useState(false)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
  }

  const baseCls = 'inline-flex items-center gap-1.5 rounded-md text-xs font-medium border transition-colors'
  const variantCls = variant === 'card-footer'
    ? 'px-2.5 py-1.5 border-border bg-surface-2 text-secondary hover:text-primary hover:border-accent/40'
    : 'px-3 py-2 border-border bg-transparent text-primary hover:border-accent/40 hover:bg-accent/5'

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${baseCls} ${variantCls}`}
        aria-label={label}
      >
        <TrendingUp size={12} />
        {label}
      </button>
      <SimulationReventeModal
        bien={bien}
        open={open}
        onClose={() => setOpen(false)}
        patrimoineActuel={patrimoineActuel}
        epargneMensuelle={epargneMensuelle}
        revenuMensuelNet={revenuMensuelNet}
        ageActuel={ageActuel}
      />
    </>
  )
}
