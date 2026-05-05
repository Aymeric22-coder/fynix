import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, formatCurrency, formatPercent } from '@/lib/utils/format'

interface TopAsset {
  id:      string
  name:    string
  type:    string
  value:   number
  percent: number
}

export function TopAssetsList({ assets }: { assets: TopAsset[] }) {
  return (
    <div className="space-y-2">
      {assets.map((a) => (
        <div key={a.id} className="flex items-center gap-3">
          {/* Pastille couleur */}
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: ASSET_TYPE_COLORS[a.type] ?? '#6b7280' }}
          />
          {/* Nom + type */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-primary truncate">{a.name}</p>
            <p className="text-xs text-secondary">{ASSET_TYPE_LABELS[a.type] ?? a.type}</p>
          </div>
          {/* Valeur + part */}
          <div className="text-right flex-shrink-0">
            <p className="text-sm financial-value text-primary">
              {formatCurrency(a.value, 'EUR', { compact: true })}
            </p>
            <p className="text-xs text-secondary">{formatPercent(a.percent, { decimals: 1 })}</p>
          </div>
          {/* Barre de progression */}
          <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden flex-shrink-0">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(a.percent, 100)}%`,
                backgroundColor: ASSET_TYPE_COLORS[a.type] ?? '#6b7280',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
