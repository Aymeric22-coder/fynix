import { cn } from '@/lib/utils/format'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-secondary border-border',
  success: 'bg-accent-muted text-accent border-accent/20',
  warning: 'bg-warning-muted text-warning border-warning/20',
  danger:  'bg-danger-muted text-danger border-danger/20',
  info:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  muted:   'bg-surface-2 text-muted border-border',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
      VARIANTS[variant],
      className,
    )}>
      {children}
    </span>
  )
}
