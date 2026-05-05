import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/format'

interface StatCardProps {
  label:       string
  value:       string
  sub?:        string
  trend?:      number          // % variation — positif = vert, négatif = rouge
  icon?:       LucideIcon
  accent?:     boolean         // bordure verte
  loading?:    boolean
  className?:  string
}

export function StatCard({
  label, value, sub, trend, icon: Icon, accent, loading, className,
}: StatCardProps) {
  if (loading) {
    return (
      <div className={cn('card p-5 space-y-3', className)}>
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-7 w-32 rounded" />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    )
  }

  const trendPositive = trend !== undefined && trend >= 0
  const trendColor    = trend !== undefined
    ? trendPositive ? 'text-accent' : 'text-danger'
    : ''

  return (
    <div className={cn(
      'card p-5 space-y-3 transition-shadow hover:shadow-card-hover',
      accent && 'border-accent/30 shadow-glow',
      className,
    )}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-secondary uppercase tracking-widest font-medium">{label}</p>
        {Icon && <Icon size={15} className="text-muted" />}
      </div>

      <p className="text-2xl font-semibold financial-value text-primary tracking-tight">
        {value}
      </p>

      <div className="flex items-center gap-2">
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trendColor}`}>
            {trendPositive ? '▲' : '▼'} {Math.abs(trend).toFixed(1)} %
          </span>
        )}
        {sub && <span className="text-xs text-secondary">{sub}</span>}
      </div>
    </div>
  )
}
