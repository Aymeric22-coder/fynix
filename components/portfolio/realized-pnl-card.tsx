/**
 * Carte KPI « Plus-value réalisée 12 mois » (R6).
 *
 * Affiche la somme des `transactions.realized_pnl` sur les 12 derniers
 * mois, agrégée par enveloppe (PEA, CTO, AV…). Alimentée par
 * `summary.realizedPnlTtm` (cf. `lib/portfolio/build-from-db.ts`).
 *
 * Conditionnel : ne se rend pas si aucune donnée disponible (`data` null
 * ou total à 0), pour éviter de polluer le cockpit d'un utilisateur qui
 * n'a encore réalisé aucune vente.
 *
 * Server Component — pas d'interactivité.
 */

import { Receipt } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { NO_ENVELOPE_KEY } from '@/lib/portfolio/build-from-db'

interface Props {
  /** Agrégat fourni par `summary.realizedPnlTtm`. `null` ou total 0 → rien. */
  data: {
    total:      number
    byEnvelope: Record<string, number>
  } | null
  /** Devise de référence du portefeuille (pour le formatage). */
  currency: string
  /**
   * Mapping `envelope_id → label affichable` (ex. "PEA Bourse Direct",
   * "CTO Boursorama"). Toute clé absente est rendue telle quelle (UUID),
   * pour qu'on remarque visuellement un oubli côté page.
   */
  envelopeLabels?: Record<string, string>
  /** Classe utilitaire optionnelle. */
  className?: string
}

export function RealizedPnlCard({ data, currency, envelopeLabels = {}, className }: Props) {
  if (!data || data.total === 0) return null

  const isPositive = data.total >= 0
  const valueColor = isPositive ? 'text-accent' : 'text-danger'

  // Tri descendant par |montant| pour mettre la contribution la plus
  // forte en haut (positive ou négative).
  const rows = Object.entries(data.byEnvelope)
    .filter(([, v]) => v !== 0)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))

  return (
    <div className={['card p-5', className ?? ''].join(' ')}>
      <p className="text-xs text-secondary uppercase tracking-widest flex items-center gap-1">
        <Receipt size={11} /> PV réalisée 12 mois
      </p>
      <p className={`text-xl font-semibold financial-value mt-2 ${valueColor}`}>
        {formatCurrency(data.total, currency, { compact: true, sign: true })}
      </p>
      <p className="text-xs text-secondary mt-1">TTM glissant · ventes uniquement</p>

      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {rows.map(([envelopeId, value]) => {
            const label =
              envelopeId === NO_ENVELOPE_KEY
                ? 'Sans enveloppe'
                : envelopeLabels[envelopeId] ?? envelopeId
            const rowColor = value >= 0 ? 'text-accent' : 'text-danger'
            return (
              <li
                key={envelopeId}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-secondary truncate pr-2">{label}</span>
                <span className={`financial-value ${rowColor}`}>
                  {formatCurrency(value, currency, { compact: true, sign: true })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
