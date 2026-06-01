/**
 * PortefeuilleSummaryCompact — résumé portefeuille financier en 1 ligne (V2.1).
 *
 * Remplace le bloc inline Récap Portefeuille (4 KPIs) sur le Dashboard.
 * Le détail complet vit sur la page `/portefeuille` (page dédiée).
 *
 * Format :
 *   « 💼 Portefeuille (17 pos.) · 56,2 k€ · PV +2,4 k€ (+4,75 %) ·
 *     Prix 95 % < 24 h · [Voir →] »
 *
 * Retourne `null` si l'utilisateur n'a aucune position (`positionsCount === 0`)
 * pour ne pas afficher une carte vide.
 */
import Link from 'next/link'
import { Briefcase, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'

interface Props {
  /** Nombre total de positions actives. */
  positionsCount:        number
  /** Sous-ensemble valorisé (= avec prix). */
  valuedPositionsCount:  number
  /** Valeur de marché totale (MV stricte, en EUR). */
  totalMarketValue:      number
  /** Plus-value latente (€). `null` si aucune position valorisée. */
  totalUnrealizedPnL:    number | null
  /** Plus-value latente (%). `null` si aucune position valorisée. */
  totalUnrealizedPnLPct: number | null
  /** Ratio de fraîcheur (0..1) — proportion de positions avec prix < 24 h. */
  freshnessRatio:        number
}

export function PortefeuilleSummaryCompact({
  positionsCount,
  valuedPositionsCount,
  totalMarketValue,
  totalUnrealizedPnL,
  totalUnrealizedPnLPct,
  freshnessRatio,
}: Props) {
  if (positionsCount === 0) return null

  const freshnessPct = Math.round(freshnessRatio * 100)
  const freshnessGood = freshnessRatio >= 0.8
  const hasPnL  = totalUnrealizedPnL !== null
  const pvPositive = (totalUnrealizedPnL ?? 0) >= 0

  return (
    <section
      className="card p-4 flex items-center justify-between gap-4 flex-wrap"
      aria-label="Résumé du portefeuille financier"
    >
      <div className="flex items-center gap-3 min-w-0 flex-wrap">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Briefcase size={16} className="text-accent" />
          <span className="text-sm font-medium text-primary">Portefeuille</span>
          <span className="text-xs text-muted">
            ({positionsCount} position{positionsCount > 1 ? 's' : ''})
          </span>
        </div>

        <span className="text-muted">·</span>

        <span className="text-sm financial-value text-primary">
          {formatCurrency(totalMarketValue, 'EUR', { compact: true })}
        </span>

        <span className="text-muted">·</span>

        {hasPnL ? (
          <span
            className={`text-sm financial-value ${pvPositive ? 'text-accent' : 'text-danger'}`}
            title="Plus-value latente"
          >
            PV {formatCurrency(totalUnrealizedPnL!, 'EUR', { compact: true, sign: true })}
            {totalUnrealizedPnLPct !== null && (
              <span className="text-xs text-muted ml-1">
                ({totalUnrealizedPnLPct >= 0 ? '+' : ''}{totalUnrealizedPnLPct.toFixed(2)} %)
              </span>
            )}
          </span>
        ) : (
          <span className="text-sm text-muted" title="Aucune position n'a encore de prix actualisé">
            Pas encore valorisé
          </span>
        )}

        <span className="text-muted">·</span>

        <span
          className={`text-sm financial-value ${freshnessGood ? 'text-accent' : 'text-secondary'}`}
          title={`${valuedPositionsCount} / ${positionsCount} positions avec prix < 24 h`}
        >
          Prix {freshnessPct} % &lt; 24 h
        </span>
      </div>

      <Link
        href="/portefeuille"
        className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors whitespace-nowrap flex-shrink-0"
      >
        Voir le détail
        <ArrowRight size={11} />
      </Link>
    </section>
  )
}
