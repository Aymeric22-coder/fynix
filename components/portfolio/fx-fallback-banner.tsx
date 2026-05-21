/**
 * Bandeau d'avertissement affiché lorsque le calcul du portefeuille a dû
 * recourir à un repli FX 1:1 (taux indisponible pour au moins une paire).
 *
 * Les positions concernées sont valorisées comme si leur devise valait
 * 1:1 avec la devise de référence, ce qui sous-évalue ou sur-évalue les
 * KPI cockpit (valeur actuelle, +/- value, allocation). On prévient
 * explicitement l'utilisateur pour qu'il sache pourquoi un chiffre paraît
 * anormal.
 *
 * Source de données : `summary.excludedForFx` (cf. `lib/portfolio/build-from-db.ts`).
 *
 * Server Component — pas d'interactivité.
 */

import { AlertTriangle } from 'lucide-react'

interface Props {
  /**
   * Liste des paires de devises non résolues, au format "FROM/TO"
   * (ex. ["USD/EUR", "GBP/EUR"]). Vide ou undefined : rien n'est rendu.
   */
  pairs: string[]
  /** Classe utilitaire optionnelle. */
  className?: string
}

export function FxFallbackBanner({ pairs, className }: Props) {
  if (!pairs || pairs.length === 0) return null

  const count = pairs.length
  const list  = pairs.join(', ')

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-muted px-4 py-3 mb-6',
        className ?? '',
      ].join(' ')}
    >
      <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-xs text-warning leading-relaxed">
        {count} paire{count > 1 ? 's' : ''} non résolue{count > 1 ? 's' : ''} — ces positions sont valorisées au taux 1:1 : {list}.
        Les KPI peuvent être sous-évalués.
      </div>
    </div>
  )
}
