/**
 * Bandeau d'information sur la fiabilité de l'analyse sectorielle/géo.
 *
 *   - vert   ≥ 90 % identifié → "Analyse fiable"
 *   - orange 70-89 %         → "Analyse partiellement fiable"
 *   - rouge  < 70 %          → "Données insuffisantes"
 *
 * Si des ETF sont non mappés, on les liste pour signaler quels ISIN
 * ajouter à la table `lib/analyse/etfCompositions.ts`.
 */
'use client'

import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { AnalyseFiabilite } from '@/types/analyse'

interface Props {
  fiabilite:    AnalyseFiabilite
  unmappedAll:  Array<{ isin: string; name: string; value: number; reason: string }>
}

const META: Record<AnalyseFiabilite['niveau'], {
  bg: string; text: string; border: string; Icon: React.ComponentType<{ size?: number; className?: string }>
}> = {
  vert:   { bg: 'bg-accent-muted', text: 'text-accent', border: 'border-accent/30', Icon: CheckCircle2 },
  orange: { bg: 'bg-warning-muted', text: 'text-warning', border: 'border-warning/30', Icon: AlertCircle },
  rouge:  { bg: 'bg-danger-muted', text: 'text-danger', border: 'border-danger/30', Icon: XCircle },
}

export function FiabiliteBadge({ fiabilite, unmappedAll }: Props) {
  const { bg, text, border, Icon } = META[fiabilite.niveau]

  return (
    <div className={`${bg} ${border} border rounded-lg px-4 py-3 mb-4`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon size={15} className={text} />
          <span className="text-sm text-primary">
            Analyse basée sur <span className={`font-semibold ${text}`}>{fiabilite.pct} %</span> de votre portefeuille financier (hors crypto)
          </span>
        </div>
        <span className={`text-xs ${text} font-medium uppercase tracking-widest`}>
          {fiabilite.label}
        </span>
      </div>

      {unmappedAll.length > 0 && (
        <details className="mt-3 pt-3 border-t border-border">
          <summary className="text-xs text-secondary cursor-pointer hover:text-primary">
            ⚠ {unmappedAll.length} position{unmappedAll.length > 1 ? 's' : ''} non identifiée{unmappedAll.length > 1 ? 's' : ''} (cliquer pour détail)
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {unmappedAll.map((u, i) => (
              <li key={`${u.isin || u.name}-${i}`} className="flex items-center justify-between gap-3">
                <span className="text-secondary truncate flex-1">
                  {u.isin && <code className="text-muted mr-1.5">{u.isin}</code>}
                  {u.name}
                  <span className="text-muted ml-1.5">— {u.reason}</span>
                </span>
                <span className="financial-value text-secondary flex-shrink-0">
                  {formatCurrency(u.value, 'EUR', { decimals: 0 })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted leading-relaxed">
            Pour atteindre 100 % : (a) ajouter les ISIN d&apos;ETF manquants dans <code>lib/analyse/etfCompositions.ts</code> ;
            (b) cliquer « Actualiser les prix » pour relancer la résolution Yahoo des actions sans secteur/pays.
          </p>
        </details>
      )}
    </div>
  )
}
