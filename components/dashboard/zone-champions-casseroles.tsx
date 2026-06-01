/**
 * ZoneChampionsCasseroles — Z8.5 de l'architecture Dashboard V2.4.
 *
 * Affiche le meilleur et le pire investissement annualisé par CATÉGORIE
 * (financier, crypto, immobilier, cash). Strictement isolé inter-classes :
 * un PEA n'est jamais comparé à un livret A, un T2 jamais à du Bitcoin.
 *
 * Layout :
 *   2 cartes côte à côte
 *     ┌─────────────────────────────┐ ┌─────────────────────────────┐
 *     │ 🏆 Champions                 │ │ 🍳 Casseroles                │
 *     │   Financier                  │ │   Financier                  │
 *     │     PEA Boursorama +12,3 %/an│ │     CTO Trade Rep. -4,5 %/an │
 *     │   Crypto                     │ │   Crypto                     │
 *     │     Ledger Nano X +85 %/an   │ │     Binance       -15 %/an   │
 *     │   Immobilier                 │ │   Immobilier                 │
 *     │     T2 Lyon +5,5 %/an        │ │     Studio Marseille -1,2 %  │
 *     │   Cash                       │ │   Cash                       │
 *     │     Livret A 3,0 %/an        │ │     CC 0,0 %/an              │
 *     └─────────────────────────────┘ └─────────────────────────────┘
 *
 * **Règles d'affichage** :
 *   - Auto-masquage complet si aucune catégorie n'a de candidat (`return null`)
 *   - Une sous-section catégorie est masquée si `totalCandidates === 0`
 *   - Une sous-section avec 1 seul candidat affiche la même ligne dans les
 *     2 cartes (champion = casserole d'une catégorie à 1 candidat)
 *   - Le badge ⚠️ « estimé » s'affiche si `extrapole === true` (TWR < 365 j)
 *   - Le badge ⚠️ « incomplet » s'affiche si `incompleteData === true` (immo)
 *
 * Server Component pur — pas d'état, juste de la composition.
 */
import Link from 'next/link'
import { Trophy, AlertTriangle, ArrowRight } from 'lucide-react'
import { formatPercent } from '@/lib/utils/format'
import type {
  InvestmentRanking,
  InvestmentRankingItem,
  InvestmentCategory,
} from '@/lib/portfolio/investment-rankings'

interface Props {
  /** Sorti directement par le pipeline `computeDashboardData(inputs)`. */
  rankings: InvestmentRanking[]
}

const CATEGORY_LABELS: Record<InvestmentCategory, string> = {
  financier:  'Financier',
  crypto:     'Crypto',
  immobilier: 'Immobilier',
  cash:       'Cash',
}

const CATEGORY_HREF: Record<InvestmentCategory, string> = {
  financier:  '/portefeuille',
  crypto:     '/portefeuille',
  immobilier: '/immobilier',
  cash:       '/cash',
}

export function ZoneChampionsCasseroles({ rankings }: Props) {
  // Auto-masquage complet si rien à montrer (0 candidats partout).
  const hasAnyCandidate = rankings.some((r) => r.totalCandidates > 0)
  if (!hasAnyCandidate) return null

  // Catégories à afficher : celles avec >= 1 candidat. Les autres sont skip.
  const visibleRankings = rankings.filter((r) => r.totalCandidates > 0)

  return (
    <section
      aria-label="Meilleur et pire investissement par catégorie"
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      <RankingCard
        title="Champions"
        icon="trophy"
        rankings={visibleRankings}
        side="best"
      />
      <RankingCard
        title="Casseroles"
        icon="alert"
        rankings={visibleRankings}
        side="worst"
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────────

interface RankingCardProps {
  title:    string
  icon:     'trophy' | 'alert'
  rankings: InvestmentRanking[]
  side:     'best' | 'worst'
}

function RankingCard({ title, icon, rankings, side }: RankingCardProps) {
  const IconComp = icon === 'trophy' ? Trophy : AlertTriangle
  const iconColor = icon === 'trophy' ? 'text-accent' : 'text-danger'

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <IconComp size={16} className={iconColor} />
        <h3 className="text-sm font-medium text-primary">{title}</h3>
      </div>

      <ul className="space-y-4">
        {rankings.map((r) => (
          <CategoryBlock key={r.category} ranking={r} side={side} />
        ))}
      </ul>
    </div>
  )
}

interface CategoryBlockProps {
  ranking: InvestmentRanking
  side:    'best' | 'worst'
}

function CategoryBlock({ ranking, side }: CategoryBlockProps) {
  const items = side === 'best' ? ranking.best : ranking.worst
  if (items.length === 0) return null

  return (
    <li>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wide text-secondary">
          {CATEGORY_LABELS[ranking.category]}
        </span>
        <Link
          href={CATEGORY_HREF[ranking.category]}
          className="inline-flex items-center gap-0.5 text-[10px] text-accent/80 hover:text-accent transition-colors"
        >
          Voir
          <ArrowRight size={9} />
        </Link>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <RankingRow key={item.id} item={item} side={side} />
        ))}
      </ul>
    </li>
  )
}

interface RankingRowProps {
  item: InvestmentRankingItem
  side: 'best' | 'worst'
}

function RankingRow({ item, side }: RankingRowProps) {
  const positive  = item.annualizedReturnPct >= 0
  // Sur la carte « Champions » on encourage le vert, sur « Casseroles » le rouge.
  const valueClass = side === 'best'
    ? (positive ? 'text-accent' : 'text-warning')
    : (positive ? 'text-secondary' : 'text-danger')

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="truncate text-primary min-w-0 flex items-center gap-1.5">
        <span className="truncate">{item.label}</span>
        {item.extrapole && (
          <span
            title="Annualisation extrapolée — historique < 1 an"
            className="text-[10px] text-warning flex-shrink-0"
          >
            ⚠
          </span>
        )}
        {item.incompleteData && (
          <span
            title="Simulation immobilière avec données partielles"
            className="text-[10px] text-warning flex-shrink-0"
          >
            (incomplet)
          </span>
        )}
      </span>
      <span className={`financial-value flex-shrink-0 ${valueClass}`}>
        {formatPercent(item.annualizedReturnPct, { sign: true, decimals: 1 })}/an
      </span>
    </li>
  )
}
