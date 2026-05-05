import { cn } from '@/lib/utils/format'

interface PageHeaderProps {
  title:       string
  subtitle?:   string
  action?:     React.ReactNode
  className?:  string
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-8', className)}>
      <div>
        <h1 className="text-2xl font-semibold text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-secondary">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 ml-6">{action}</div>}
    </div>
  )
}
