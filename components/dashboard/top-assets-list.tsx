/**
 * TopAssetsList — Z8 du Dashboard, V2.3 (BUG-5 corrigé).
 *
 * Liste consolidée par enveloppe / bien / compte (1 ligne = 1 entité
 * agrégée). Remplace la version V2.2 atomique qui mélangeait les
 * granularités.
 *
 * Chaque ligne est cliquable et renvoie vers la section appropriée
 * (`/portefeuille`, `/immobilier/[id]`, `/cash`).
 */
import Link from 'next/link'
import { Briefcase, Home, PiggyBank, Bitcoin, BarChart3, type LucideIcon } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { TopAssetConsolidated, ConsolidatedEnvelopeType } from '@/lib/analyse/dashboard-pipeline'

interface Props {
  assets: TopAssetConsolidated[]
}

const ICON_BY_TYPE: Record<ConsolidatedEnvelopeType, LucideIcon> = {
  pea:            Briefcase,
  cto:            Briefcase,
  av:             Briefcase,
  per:            Briefcase,
  wallet_crypto:  Bitcoin,
  other:          Briefcase,
  real_estate:    Home,
  cash_livret:    PiggyBank,
  cash_courant:   PiggyBank,
  asset_class:    BarChart3,
}

const COLOR_BY_TYPE: Record<ConsolidatedEnvelopeType, string> = {
  pea:            '#10b981',
  cto:            '#3b82f6',
  av:             '#a855f7',
  per:            '#f59e0b',
  wallet_crypto:  '#f7931a',
  other:          '#6b7280',
  real_estate:    '#E8B84B',
  cash_livret:    '#0ea5e9',
  cash_courant:   '#0ea5e9',
  asset_class:    '#71717a',
}

export function TopAssetsList({ assets }: Props) {
  if (assets.length === 0) return null

  return (
    <div className="space-y-2">
      {assets.map((a) => {
        const Icon  = ICON_BY_TYPE[a.envelopeType]
        const color = COLOR_BY_TYPE[a.envelopeType]
        return (
          <TopRow key={a.key} asset={a} Icon={Icon} color={color} />
        )
      })}
    </div>
  )
}

interface TopRowProps {
  asset: TopAssetConsolidated
  Icon:  LucideIcon
  color: string
}

function TopRow({ asset, Icon, color }: TopRowProps) {
  const showCount = asset.underlyingPositionsCount > 1
  const labelSuffix = showCount
    ? ` (${asset.underlyingPositionsCount} positions)`
    : ''

  const content = (
    <div className="flex items-center gap-3 group">
      {/* Icône colorée */}
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}26` }}     /* tint 15 % */
      >
        <Icon size={14} style={{ color }} />
      </div>
      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-primary truncate group-hover:text-accent transition-colors">
          {asset.label}
          {showCount && (
            <span className="text-xs text-muted ml-1">{labelSuffix}</span>
          )}
        </p>
      </div>
      {/* Valeur + part */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm financial-value text-primary">
          {formatCurrency(asset.totalValueEur, 'EUR', { compact: true })}
        </p>
        <p className="text-xs text-secondary">
          {formatPercent(asset.percentOfGross, { decimals: 1 })}
        </p>
      </div>
      {/* Barre de progression (capée à 100 %) */}
      <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden flex-shrink-0">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(asset.percentOfGross, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )

  return asset.href
    ? <Link href={asset.href}>{content}</Link>
    : content
}
