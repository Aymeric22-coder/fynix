/**
 * Frise calendrier des dividendes attendus (DCAL).
 *
 * Affiche les 6 prochains mois (compact pour mobile) :
 *   - Une colonne par mois (label court en FR : Juin, Juil., Aout...)
 *   - Barre de hauteur PROPORTIONNELLE au total attendu du mois
 *     (echelle relative au max de la fenetre affichee)
 *   - Total formate sous le mois
 *   - Petite coche si au moins un paiement reel est deja confirme
 *   - Liste compacte des tickers attendus (jusqu'a 3, sinon "+N")
 *   - Mois sans paiement attendu : colonne grisee avec "—"
 *
 * Rendu conditionnel : null si tous les mois ont totalExpectedRef = 0.
 *
 * Server Component — pas d'interactivite. Pas de tooltip (cohérent
 * avec la consigne du brief : si on reste SSR, tickers visibles
 * directement sous la barre).
 */

import { Check, CalendarDays } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { CalendarMonth } from '@/lib/portfolio/dividend-calendar'

interface Props {
  data:      CalendarMonth[]
  currency:  string
  /** Nombre de mois affiches. Defaut 6 (compact mobile). */
  monthsToShow?: number
  className?: string
}

/** Labels mois courts FR — fige, SSR-safe (pas de dependance locale). */
const MONTH_LABELS_FR = [
  'Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai',  'Juin',
  'Juil.', 'Août',  'Sept.', 'Oct.', 'Nov.', 'Déc.',
]

const MAX_BAR_HEIGHT_PX = 64  // hauteur visuelle maximale d'une barre
const MIN_BAR_HEIGHT_PX = 4   // hauteur visible meme pour un petit montant non nul

export function DividendCalendarStrip({
  data, currency, monthsToShow = 6, className,
}: Props) {
  const months = data.slice(0, monthsToShow)
  const hasAnyExpected = months.some((m) => m.totalExpectedRef > 0)
  if (!hasAnyExpected) return null

  const maxTotal = months.reduce((acc, m) => Math.max(acc, m.totalExpectedRef), 0)

  return (
    <div className={['card p-5', className ?? ''].join(' ')}>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
          <CalendarDays size={11} /> Prochains dividendes attendus
        </p>
        <p className="text-xs text-muted">{months.length} mois glissants</p>
      </div>

      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        {months.map((m) => (
          <MonthCell
            key={m.month}
            month={m}
            maxTotal={maxTotal}
            currency={currency}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────────────────

interface MonthCellProps {
  month:    CalendarMonth
  maxTotal: number
  currency: string
}

function MonthCell({ month, maxTotal, currency }: MonthCellProps) {
  const monthIndex = Number(month.month.slice(5, 7)) - 1
  const label = MONTH_LABELS_FR[monthIndex] ?? month.month.slice(5, 7)

  const isEmpty = month.totalExpectedRef === 0
  const hasConfirmed = month.expectedPayments.some((p) => p.isConfirmed)

  // Hauteur de barre : ratio sur le max + minimum visible si non vide.
  let barHeight = 0
  if (!isEmpty && maxTotal > 0) {
    const ratio = month.totalExpectedRef / maxTotal
    barHeight = Math.max(MIN_BAR_HEIGHT_PX, Math.round(ratio * MAX_BAR_HEIGHT_PX))
  }

  // Tickers compacts : on dedoublonne (une position trimestrielle peut
  // ne contribuer qu'une seule fois ce mois mais on garde le set au cas
  // ou plusieurs positions partagent un ticker — peu probable, mais sain).
  const seen = new Set<string>()
  const tickers: string[] = []
  for (const p of month.expectedPayments) {
    const t = p.ticker || '?'
    if (seen.has(t)) continue
    seen.add(t)
    tickers.push(t)
  }
  const visibleTickers = tickers.slice(0, 3)
  const extraCount     = tickers.length - visibleTickers.length

  return (
    <div className="flex-1 min-w-[64px] flex flex-col items-center gap-1">
      {/* Zone de la barre (toujours allouee a MAX_BAR_HEIGHT_PX pour alignement) */}
      <div
        className="w-full flex items-end justify-center"
        style={{ height: `${MAX_BAR_HEIGHT_PX}px` }}
      >
        {!isEmpty && (
          <div
            className="w-8 rounded-t bg-accent/70"
            style={{ height: `${barHeight}px` }}
            aria-hidden
          />
        )}
      </div>

      {/* Label mois + coche confirmation */}
      <div className="flex items-center gap-1 text-[11px] text-secondary">
        <span>{label}</span>
        {hasConfirmed && (
          <Check
            size={10}
            className="text-accent"
            aria-label="versement réel déjà confirmé ce mois"
          />
        )}
      </div>

      {/* Total attendu */}
      <p className={`text-xs financial-value ${isEmpty ? 'text-muted' : 'text-primary'}`}>
        {isEmpty
          ? '—'
          : formatCurrency(month.totalExpectedRef, currency, { compact: true })}
      </p>

      {/* Tickers compacts */}
      {!isEmpty && tickers.length > 0 && (
        <p className="text-[10px] text-muted truncate max-w-[80px]">
          {visibleTickers.join(' · ')}
          {extraCount > 0 && <span> +{extraCount}</span>}
        </p>
      )}
    </div>
  )
}
