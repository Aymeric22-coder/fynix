/**
 * Badge discret « N positions non valorisées » (V1.4 P0.2).
 *
 * Visible uniquement quand au moins une position du portefeuille n'a pas de
 * valeur de marché (`marketValue === null`). Cliquable → /portefeuille où
 * l'utilisateur peut actualiser ou saisir manuellement les prix.
 *
 * Style : volontairement sobre (chip warning, pas de bandeau XL amber) —
 * conforme à la philosophie V1.4 « bascule technique, pas refonte visuelle ».
 */
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

interface Props {
  count: number
  label: string
}

export function UnvaluedPositionsBadge({ count, label }: Props) {
  if (count <= 0) return null
  return (
    <Link
      href="/portefeuille"
      title={label}
      aria-label={label}
      className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full
                 bg-warning/10 border border-warning/30 text-warning text-[10px] font-medium
                 hover:bg-warning/15 transition-colors"
    >
      <AlertCircle size={10} />
      <span className="financial-value">{count}</span>
    </Link>
  )
}
