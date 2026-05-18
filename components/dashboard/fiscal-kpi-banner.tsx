/**
 * KPI fiscal du Dashboard — bandeau accrocheur qui résume le total des
 * opportunités fiscales applicables détectées par `calculerOpportunitesFiscales`
 * et renvoie vers l'onglet « Optimiser » d'/analyse.
 *
 * Comportement :
 *   - gainAnnuel > 0  → carte amber avec « X €/an récupérables » + CTA
 *   - gainAnnuel == 0 → rien (l'utilisateur est déjà optimisé)
 *   - opportunites vide / undefined → rien
 */
import Link from 'next/link'
import { Lightbulb, ArrowRight } from 'lucide-react'
import { formatEur } from '@/lib/utils/format'
import type { OpportuniteFiscale } from '@/lib/analyse/optimiseurFiscal'

export interface FiscalKpiBannerProps {
  opportunites: OpportuniteFiscale[] | undefined | null
}

export function FiscalKpiBanner({ opportunites }: FiscalKpiBannerProps) {
  if (!opportunites || opportunites.length === 0) return null

  const gainAnnuel = opportunites
    .filter((o) => o.applicable)
    .reduce((s, o) => s + (o.gain_annuel_eur ?? 0), 0)

  if (gainAnnuel <= 0) return null

  const gain5ans = gainAnnuel * 5

  return (
    <section
      className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-5 relative overflow-hidden"
      aria-label="Opportunités fiscales détectées"
    >
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-full bg-amber-400/15 p-2.5 flex-shrink-0">
            <Lightbulb size={20} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-secondary uppercase tracking-widest">
              Opportunités fiscales
            </p>
            <p className="text-xl sm:text-2xl font-bold text-primary financial-value mt-1">
              💡 {formatEur(gainAnnuel, { decimals: 0 })}
              <span className="text-sm text-secondary font-medium ml-1.5">/an récupérables</span>
            </p>
            <p className="text-xs text-secondary mt-1">
              soit <span className="text-primary financial-value font-medium">
                {formatEur(gain5ans, { decimals: 0 })}
              </span> sur 5 ans en optimisant ta fiscalité
            </p>
          </div>
        </div>
        <Link
          href="/analyse?tab=optimiser"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-400/10 border border-amber-400/40 text-amber-400 text-sm font-medium hover:bg-amber-400/20 transition-colors whitespace-nowrap"
        >
          Voir les opportunités
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  )
}
