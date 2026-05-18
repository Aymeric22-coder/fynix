/**
 * Carte « Mes trophées » — affiche les jalons patrimoniaux déjà franchis
 * d'après l'historique (wealth_snapshots).
 *
 * Réutilise `JalonFIRE.atteint` + `date_atteinte` calculés par
 * `enrichJalonsAvecHistorique` (lib/analyse/jalonsHistorique.ts).
 *
 * - Aucun jalon atteint → return null (pas de carte vide).
 * - 1-4 jalons atteints → grille de badges (les plus récents d'abord).
 * - 5+ jalons atteints → 4 badges + chip « +N autres ».
 */
import { Trophy } from 'lucide-react'
import { formatEur } from '@/lib/utils/format'
import type { JalonFIRE } from '@/types/analyse'

export interface TropheesCardProps {
  jalons: JalonFIRE[]
}

const MAX_BADGES = 4

const MONTH_LABELS = [
  'jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
] as const

function formatJalonDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const m = MONTH_LABELS[d.getUTCMonth()]
  return `${m} ${d.getUTCFullYear()}`
}

export function TropheesCard({ jalons }: TropheesCardProps) {
  const atteints = jalons.filter((j) => j.atteint === true)
  if (atteints.length === 0) return null

  // Tri par date de franchissement décroissant (les plus récents d'abord).
  // Pour les jalons sans date, on les place en fin.
  const sorted = [...atteints].sort((a, b) => {
    if (!a.date_atteinte && !b.date_atteinte) return b.valeur - a.valeur
    if (!a.date_atteinte) return 1
    if (!b.date_atteinte) return -1
    return b.date_atteinte.localeCompare(a.date_atteinte)
  })

  const visible = sorted.slice(0, MAX_BADGES)
  const hidden  = sorted.length - visible.length

  return (
    <section className="card p-5" aria-label="Jalons patrimoniaux franchis">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-primary">🏆 Jalons franchis</h2>
        <span className="text-xs text-muted">
          ({atteints.length} sur {jalons.length})
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {visible.map((j, idx) => {
          const date = formatJalonDate(j.date_atteinte)
          return (
            <div
              key={`${j.label}-${idx}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                         bg-emerald-500/10 border border-emerald-500/30
                         text-emerald-300 text-sm"
            >
              <Trophy size={12} className="text-emerald-400" />
              <span className="financial-value font-medium">
                {formatEur(j.valeur, { decimals: 0 })}
              </span>
              {date && <span className="text-xs text-emerald-300/80">· {date}</span>}
            </div>
          )
        })}
        {hidden > 0 && (
          <div className="inline-flex items-center px-3 py-1.5 rounded-full
                          bg-surface-2 border border-border text-secondary text-xs">
            +{hidden} autre{hidden > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </section>
  )
}
