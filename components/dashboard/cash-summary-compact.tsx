/**
 * CashSummaryCompact — résumé cash en 1 ligne aérée (V2.1-BIS).
 *
 * La plus simple des 3 lignes compactes du Dashboard : un seul montant
 * agrégé, pas de breakdown par type de compte. Le détail complet
 * (livrets / compte courant / par banque) vit sur la page `/cash`.
 *
 * Format : « 🐷 Cash (N comptes) · 18,3 k€ · [Voir le détail →] »
 *
 * Retourne `null` si l'utilisateur n'a aucun cash (`accountsCount === 0`
 * ou `totalEur === 0`) pour ne pas afficher une carte vide.
 *
 * Conventionnel : utilise `PiggyBank` (lucide-react) en cohérence avec
 * `ImmoSummaryCompact` (Home) et `PortefeuilleSummaryCompact` (Briefcase).
 */
import Link from 'next/link'
import { PiggyBank, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  /** Total cash agrégé (livrets + compte courant + assets cash legacy, dédupliqué). */
  totalEur:       number
  /** Nombre de comptes pour le sous-libellé « (N comptes) ». */
  accountsCount:  number
}

export function CashSummaryCompact({ totalEur, accountsCount }: Props) {
  if (accountsCount === 0 || totalEur === 0) return null

  return (
    <section
      className="card p-4 flex items-center justify-between gap-4 flex-wrap"
      aria-label="Résumé du cash"
    >
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        <div className="flex items-center gap-2 flex-shrink-0">
          <PiggyBank size={16} className="text-accent" />
          <span className="text-sm font-medium text-primary">Cash</span>
          <span className="text-xs text-muted">
            ({accountsCount} compte{accountsCount > 1 ? 's' : ''})
          </span>
        </div>

        <span className="text-muted">·</span>

        <span className="text-sm financial-value text-primary">
          {formatCurrency(totalEur, 'EUR', { compact: true })}
        </span>
      </div>

      <Link
        href="/cash"
        className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors whitespace-nowrap flex-shrink-0"
      >
        Voir le détail
        <ArrowRight size={11} />
      </Link>
    </section>
  )
}
