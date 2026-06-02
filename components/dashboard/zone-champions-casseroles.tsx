/**
 * ZoneChampionsCasseroles — Z8.5 du Dashboard, V2.4-BIS / V2.4-TER.
 *
 * Affiche le **meilleur** et le **pire** investissement de chaque bucket,
 * sur la base de rendements INSTANTANÉS (pas d'annualisation, pas de seuil
 * temporel). Disponible dès le jour 1.
 *
 * **V2.4-TER — 2 buckets seulement** :
 *   - 📊 **Marché** (financier + crypto fusionnés) : plus-value latente
 *   - 🏠 **Immobilier locatif** : rendement locatif net (RP exclue)
 *
 * Le cash a été retiré du composant : ce n'est pas un investissement au
 * sens propre mais un parking sécurisé. Il garde sa visibilité Z7
 * (CashSummaryCompact) et `/cash`.
 *
 * Layout :
 *   2 cartes côte à côte (« Meilleurs » à gauche, « Pires » à droite),
 *   max 2 lignes par card (1 par bucket). Asymétrie autorisée : si l'immo
 *   n'a qu'1 seul bien locatif, la card « Pires » peut n'avoir qu'1 ligne
 *   (marché) tandis que « Meilleurs » en a 2.
 *
 * Règles d'affichage :
 *   - Card « Meilleurs » : 1 ligne par bucket actif, montrant le #1
 *   - Card « Pires » : 1 ligne par bucket actif, montrant la dernière
 *     UNIQUEMENT s'il y a ≥ 2 positions dans le bucket
 *   - Bucket vide → absent des 2 cards (clé omise par le pipeline)
 *   - Si TOUS les buckets sont vides → composant retourne `null`
 *   - Si aucun bucket n'a de « pire » (tous à 1 position) → card « Pires » disparaît
 *
 * Server Component pur — pas d'état, juste de la composition.
 */
import Link from 'next/link'
import { Trophy, AlertTriangle, ArrowRight } from 'lucide-react'
import { formatPercent } from '@/lib/utils/format'
import type {
  InvestmentRanking,
  InvestmentRankings,
  InvestmentRankingBucket,
  InvestmentCategory,
} from '@/lib/portfolio/investment-rankings'

interface Props {
  rankings: InvestmentRankings
}

const CATEGORY_LABELS: Record<InvestmentCategory, string> = {
  marche:     'Marché',
  immobilier: 'Immobilier locatif',
}

const CATEGORY_ICONS: Record<InvestmentCategory, string> = {
  marche:     '📊',
  immobilier: '🏠',
}

const CATEGORY_HREF: Record<InvestmentCategory, string> = {
  marche:     '/portefeuille',
  immobilier: '/immobilier',
}

/** Ordre d'affichage stable des buckets. */
const CATEGORY_ORDER: InvestmentCategory[] = ['marche', 'immobilier']

interface CategoryEntry {
  category: InvestmentCategory
  bucket:   InvestmentRankingBucket
}

export function ZoneChampionsCasseroles({ rankings }: Props) {
  const entries: CategoryEntry[] = CATEGORY_ORDER
    .map((cat) => ({ category: cat, bucket: rankings[cat] }))
    .filter((e): e is CategoryEntry => e.bucket !== undefined)

  if (entries.length === 0) return null

  const hasAnyWorst = entries.some((e) => e.bucket.worst.length > 0)

  return (
    <section
      aria-label="Meilleur et pire investissement par catégorie"
      className={`grid grid-cols-1 ${hasAnyWorst ? 'md:grid-cols-2' : ''} gap-4`}
    >
      <RankingCard title="Meilleurs investissements" icon="trophy" entries={entries} side="best" />
      {hasAnyWorst && (
        <RankingCard title="Pires investissements" icon="alert" entries={entries} side="worst" />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────────

interface RankingCardProps {
  title:   string
  icon:    'trophy' | 'alert'
  entries: CategoryEntry[]
  side:    'best' | 'worst'
}

function RankingCard({ title, icon, entries, side }: RankingCardProps) {
  const IconComp = icon === 'trophy' ? Trophy : AlertTriangle
  const iconColor = icon === 'trophy' ? 'text-accent' : 'text-danger'

  const rows = entries
    .map<{ category: InvestmentCategory; item: InvestmentRanking } | null>((e) => {
      const item = (side === 'best' ? e.bucket.best[0] : e.bucket.worst[0])
      return item ? { category: e.category, item } : null
    })
    .filter((r): r is { category: InvestmentCategory; item: InvestmentRanking } => r !== null)

  if (rows.length === 0) return null

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <IconComp size={16} className={iconColor} />
        <h3 className="text-sm font-medium text-primary">{title}</h3>
      </div>

      <ul className="space-y-2.5">
        {rows.map((r) => (
          <RankingRow key={r.category} category={r.category} item={r.item} side={side} />
        ))}
      </ul>
    </div>
  )
}

interface RankingRowProps {
  category: InvestmentCategory
  item:     InvestmentRanking
  side:     'best' | 'worst'
}

function RankingRow({ category, item, side }: RankingRowProps) {
  const positive   = item.yieldPct >= 0
  const valueClass = side === 'best'
    ? (positive ? 'text-accent' : 'text-warning')
    : (positive ? 'text-secondary' : 'text-danger')

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <Link
        href={CATEGORY_HREF[category]}
        className="flex items-center gap-1.5 min-w-0 group"
      >
        <span aria-hidden="true" className="flex-shrink-0">{CATEGORY_ICONS[category]}</span>
        <span className="text-xs uppercase tracking-wide text-secondary flex-shrink-0 group-hover:text-accent transition-colors">
          {CATEGORY_LABELS[category]}
        </span>
        <span className="text-muted flex-shrink-0">·</span>
        <span className="truncate text-primary">{item.label}</span>
        {item.envelopeLabel && (
          <span className="text-xs text-muted flex-shrink-0">({item.envelopeLabel})</span>
        )}
        <ArrowRight size={9} className="text-accent/0 group-hover:text-accent/70 transition-colors flex-shrink-0" />
      </Link>
      <span
        className={`financial-value flex-shrink-0 ${valueClass}`}
        title={metricTooltip(item.metricType)}
      >
        {formatPercent(item.yieldPct, { sign: true, decimals: 1 })}
      </span>
    </li>
  )
}

function metricTooltip(metricType: InvestmentRanking['metricType']): string {
  switch (metricType) {
    case 'plus_value_latente':
      return 'Plus-value latente cumulée depuis l’achat — (valeur actuelle − coût d’acquisition) / coût d’acquisition'
    case 'rendement_locatif':
      return 'Rendement locatif net annuel — loyers nets annuels / valeur estimée actuelle'
  }
}
