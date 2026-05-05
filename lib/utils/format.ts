// Utilitaires de formatage financier centralisés

export function formatCurrency(
  value: number | null | undefined,
  currency = 'EUR',
  options?: { compact?: boolean; sign?: boolean },
): string {
  if (value === null || value === undefined) return '—'

  const abs = Math.abs(value)
  let formatted: string

  if (options?.compact && abs >= 1_000_000) {
    formatted = (value / 1_000_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' M'
  } else if (options?.compact && abs >= 1_000) {
    formatted = (value / 1_000).toLocaleString('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' k'
  } else {
    formatted = value.toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  }

  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency
  const sign = options?.sign && value > 0 ? '+' : ''
  return `${sign}${formatted} ${symbol}`.trim()
}

export function formatPercent(
  value: number | null | undefined,
  options?: { sign?: boolean; decimals?: number },
): string {
  if (value === null || value === undefined) return '—'
  const decimals = options?.decimals ?? 2
  const sign = options?.sign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)} %`
}

export function formatDate(
  value: string | Date | null | undefined,
  style: 'short' | 'medium' | 'long' = 'short',
): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (isNaN(d.getTime())) return '—'

  if (style === 'short') {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  if (style === 'medium') {
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatQuantity(value: number | null | undefined, decimals = 4): string {
  if (value === null || value === undefined) return '—'
  // Crypto : 8 décimales max, actions : 2 max
  const d = value % 1 === 0 ? 0 : decimals
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d })
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const ASSET_TYPE_LABELS: Record<string, string> = {
  real_estate: 'Immobilier',
  scpi:        'SCPI',
  stock:       'Actions',
  etf:         'ETF',
  crypto:      'Crypto',
  gold:        'Or',
  cash:        'Cash',
  other:       'Autre',
}

export const ASSET_TYPE_COLORS: Record<string, string> = {
  real_estate: '#10b981',
  scpi:        '#34d399',
  stock:       '#3b82f6',
  etf:         '#60a5fa',
  crypto:      '#f59e0b',
  gold:        '#fbbf24',
  cash:        '#8b5cf6',
  other:       '#6b7280',
}
