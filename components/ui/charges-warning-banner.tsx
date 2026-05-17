/**
 * Bandeau d'avertissement affiche quand les charges d'un bien immobilier
 * proviennent des valeurs par defaut (estimees a partir du prix d'achat)
 * plutot que de chiffres reels saisis par l'utilisateur.
 *
 * Le bouton "Mettre a jour" pointe vers la page d'edition du bien
 * (typiquement /immobilier/[id]) ou vers une action custom passee en prop.
 *
 * Disparait quand `estimated` passe a `false`.
 */
'use client'

import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface Props {
  /** True : afficher le bandeau. False : ne rien rendre. */
  estimated: boolean
  /** Lien de la CTA "Mettre a jour". Defaut : null = pas de bouton. */
  href?: string
  /** Texte personnalise (sinon message standard). */
  message?: string
  /** Classe utilitaire optionnelle. */
  className?: string
}

const DEFAULT_MESSAGE =
  'Charges estimées — rendement à ±10 %. Renseignez vos charges réelles pour plus de précision.'

export function ChargesWarningBanner({ estimated, href, message, className }: Props) {
  if (!estimated) return null
  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3',
        className ?? '',
      ].join(' ')}
    >
      <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-warning leading-relaxed">
        {message ?? DEFAULT_MESSAGE}
      </div>
      {href && (
        <Link
          href={href}
          className="flex-shrink-0 text-xs text-warning underline hover:no-underline whitespace-nowrap"
        >
          Mettre à jour
        </Link>
      )}
    </div>
  )
}
